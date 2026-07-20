/**
 * Композабл для обработки результатов заклинания (фасад).
 *
 * Отвечает за:
 * - Определение целей (AoE шаблон или одиночная цель из targetStore)
 * - Автоматические спасброски для каждой цели (или ручные — если autoSaves выключен)
 * - Применение урона с учётом результата спасброска (full / half / none)
 * - Отправку результатов в чат
 */
import type {
  DiceGroupResult,
  MeasurementTemplate,
  Scene,
  SceneEntity,
} from '@vtt/shared';
import type {
  ActiveEffect,
  AttackRollMode,
  DamageDefenseOutcome,
  DnDSceneEntity,
  Spell,
} from '@vtt/shared/system/dnd.js';

import type {
  AoeContext,
  RolledSpellDamagePart,
  SavingThrowResult,
  SpellDamagePartInput,
  SpellResolutionContext,
  SpellTargetResult,
} from './spellResolutionShared';

import {
  generateId,
  isActorEntity,
  isCreatureEntity,
  resolveGridCellSize,
} from '@vtt/shared';
import {
  applyDamageDefenses,
  applyHpChange,
  buildAttackFormula,
  buildAttackLabel,
  collectActiveEffects,
  damagePartIsHealing,
  detectFormulaDamageType,
  doubleDiceInFormula,
  evaluateDefensiveACBonus,
  findTokensInTemplate,
  formatDamageDefenseSuffix,
  getShortDamageTypeLabel,
  getSpellDamageParts,
  getSpellPrimaryDamageType,
  mergeAppliedEffects,
  resolveActorStats,
  resolveAttackRoll,
  spellHasDamage,
  spellHealsTempHp,
  spellIsHealing,
  withInitializedDuration,
} from '@vtt/shared/system/dnd.js';

import { emitEntityUpdate } from '@/core/entityUtils';
import { useChatStore } from '@/stores/chatStore';
import { useDiceRollerStore } from '@/stores/diceRollerStore';
import { useTargetStore } from '@/stores/targetStore';

import {
  formatRolledPartLine,
  getPartKindLabel,
  isSaveAbility,
  partPassesTargetGate,
  resolveAutoSaves,
  resolveEffectsToApply,
  stampEffectTurnDuration,
} from './spellResolutionShared';
import { useSpellDamageWithParts } from './useSpellDamageWithParts';
import { useSpellSavingThrows } from './useSpellSavingThrows';

// Реэкспорт публичных типов системы разрешения заклинаний
export type {
  RolledSpellDamagePart,
  SpellDamagePartInput,
  SpellTargetResult,
} from './spellResolutionShared';

/**
 * Контекст серии атак снарядов (атакующие снарядные заклинания: Мистический
 * заряд, Палящий луч). Каждый снаряд кидает СВОЙ бросок попадания против AC
 * своей цели; урон катается только за попавшие снаряды, крит удваивает кости
 * только своего снаряда. Режим броска (преимущество/помеха) — общий на серию,
 * выбирается один раз в DiceRollModal.
 */
export interface ProjectileAttackContext {
  /** Итоговый модификатор атаки заклинанием (включая доп. бонус из модалки) */
  attackModifier: number;
  /** Режим бросков атаки — общий для всех снарядов серии */
  rollMode: AttackRollMode;
  /** Тип атаки для условных бонусов к AC цели (напр. +2 КД от дальнобойных) */
  attackType: 'melee' | 'ranged';
}

/**
 * Композабл для обработки результатов заклинания.
 *
 * Использование:
 * ```ts
 * const { resolveSpellTargets } = useSpellResolution();
 * // После броска урона в DiceRollModal:
 * resolveSpellTargets({ spell, damageTotal, spellSaveDC, actors, socket }, aoeContext?);
 * ```
 */
export function useSpellResolution() {
  const chatStore = useChatStore();
  const targetStore = useTargetStore();

  const { rollSavingThrow, requestManualSavingThrow } = useSpellSavingThrows();

  const { resolveSpellDamageWithParts } = useSpellDamageWithParts();

  /**
   * Определяет, нужна ли автоматическая обработка целей для этого заклинания.
   *
   * Снарядный режим зависит от контекста каста (число снарядов считается от
   * круга ячейки / уровня персонажа — `getSpellProjectileCount`), поэтому
   * вызывающий передаёт его готовым флагом. При одном снаряде (напр.
   * Мистический заряд до 5 уровня) каст идёт обычным одиночным путём.
   *
   * @param spell - заклинание
   * @param hasProjectiles - активен ли снарядный режим для этого каста
   * @returns true если заклинание требует автоматической обработки целей
   */
  function needsAutoResolution(spell: Spell, hasProjectiles = false): boolean {
    // Есть спасбросок -> нужно прокинуть
    if (spell.saveType !== 'none') {
      return true;
    }

    // Auto-hit -> нужно применить урон без бросков
    if (spell.autoHit && spellHasDamage(spell)) {
      return true;
    }

    // Распределение снарядов по целям — применение через resolveSpellDamage
    if (hasProjectiles) {
      return true;
    }

    return false;
  }

  /**
   * Применяет урон и эффекты к одной сущности.
   *
   * @param entity - сущность-цель
   * @param damage - количество урона
   * @param damageType - тип урона (для сопротивлений)
   * @param isHealing - является ли лечением
   * @param effectsToApply - эффекты для наложения (если есть)
   * @param socket - сокет для отправки обновления
   * @param options - дополнительные параметры применения
   * @param options.extraDamageAfterDefenses - доп. урон, уже учитывающий защиты
   *   цели (бонус-части снарядного пути — у них свои типы/защиты); добавляется
   *   после применения защит к основному урону, в тот же HP-апдейт
   * @param options.healTemp - лечение временными ХП (`@heal.temp`): вместо
   *   прибавления к текущим хитам применяется правило «берётся большее»
   * @returns результат применения
   */
  function applyResultsToEntity(
    entity: SceneEntity,
    damage: number,
    damageType: string | undefined,
    isHealing: boolean,
    effectsToApply: ActiveEffect[] | undefined,
    socket: SpellResolutionContext['socket'],
    options: { extraDamageAfterDefenses?: number; healTemp?: boolean } = {},
  ): {
    hpBefore: number;
    hpAfter: number;
    finalDamage: number;
    tempHpGained: number;
    defenseOutcome: DamageDefenseOutcome;
    appliedEffects: string[];
  } {
    const extraDamageAfterDefenses = options.extraDamageAfterDefenses ?? 0;
    const healTemp = options.healTemp ?? false;

    // Ядро видит entity как Base*; в D&D-композабле восстанавливаем D&D-форму.
    const dnd = entity as DnDSceneEntity;

    const hpBefore = isCreatureEntity(dnd)
      ? (dnd.system.hitPoints.current ?? 0)
      : dnd.system.hitPoints.current;

    const maxHp = isCreatureEntity(dnd)
      ? (dnd.system.hitPoints.max ?? 0)
      : dnd.system.hitPoints.max;

    let finalDamage = damage;
    let defenseOutcome: DamageDefenseOutcome = 'normal';

    // Учитываем защиты цели: иммунитет (урон 0), сопротивление (½), уязвимость (×2)
    if (!isHealing && damageType) {
      const stats = resolveActorStats(dnd);

      const defenseResult = applyDamageDefenses(
        damage,
        damageType,
        stats.damageDefenses,
      );

      finalDamage = defenseResult.finalDamage;
      defenseOutcome = defenseResult.outcome;
    }

    if (!isHealing) {
      finalDamage += extraDamageAfterDefenses;
    }

    const tempBefore = dnd.system.hitPoints.temp ?? 0;

    // Урон сначала снимает временные ХП (правило 5e), лечение их не трогает;
    // @heal.temp не лечит текущие хиты — даёт временные (ниже)
    const hpChange = applyHpChange({
      hpBefore,
      maxHp,
      tempBefore,
      damage: isHealing ? 0 : finalDamage,
      heal: isHealing && !healTemp ? finalDamage : 0,
    });

    // @heal.temp: временные ХП не суммируются с имеющимися — берётся большее
    const tempAfter =
      isHealing && healTemp
        ? Math.max(hpChange.tempAfter, finalDamage)
        : hpChange.tempAfter;

    const hpAfter = hpChange.hpAfter;

    // Deep clone сущности для отправки через сокет.
    // Shallow spread теряет вложенные свойства Vue reactive proxy.
    const updatedEntity: DnDSceneEntity = JSON.parse(JSON.stringify(entity));

    if (isCreatureEntity(updatedEntity)) {
      updatedEntity.system.hitPoints.current = hpAfter;
      updatedEntity.system.hitPoints.temp = tempAfter;
    } else if (isActorEntity(updatedEntity)) {
      updatedEntity.system.hitPoints.current = hpAfter;
      updatedEntity.system.hitPoints.temp = tempAfter;
    }

    const appliedEffects: string[] = [];

    if (effectsToApply && effectsToApply.length > 0) {
      if (!updatedEntity.activeEffects) {
        updatedEntity.activeEffects = [];
      }

      // Один и тот же статус не стакается: повтор ЗАМЕНЯЕТ прежний (5e 2024);
      // разные эффекты складываются.
      const instantiated = effectsToApply.map(
        (effect): ActiveEffect =>
          withInitializedDuration({
            ...effect,
            id: generateId('effect'),
            origin: 'spell',
          }),
      );

      updatedEntity.activeEffects = mergeAppliedEffects(
        updatedEntity.activeEffects,
        instantiated,
      );

      for (const effect of instantiated) {
        appliedEffects.push(effect.name);
      }
    }

    // emitEntityUpdate автоматически определяет нужное WS-событие (actor:updated / creature:updated)
    emitEntityUpdate(socket, updatedEntity);

    return {
      hpBefore,
      hpAfter,
      finalDamage,
      tempHpGained: Math.max(0, tempAfter - hpChange.tempAfter),
      defenseOutcome,
      appliedEffects,
    };
  }

  /**
   * Считает суммарный бонус-урон от эффектов для конкретной цели
   * (снарядный путь): per-target гейты по HP цели, спасбросок и защиты
   * по типу каждой части.
   *
   * @param entity - сущность-цель
   * @param bonusParts - брошенные бонус-части (значения общие на каст)
   * @param saveResult - результат спасброска цели (если был)
   * @param saveEffect - эффект успешного спасброска заклинания
   * @returns суммарный бонус-урон с учётом гейтов, спасброска и защит
   */
  function computeBonusDamageForEntity(
    entity: SceneEntity,
    bonusParts: RolledSpellDamagePart[],
    saveResult: SavingThrowResult | undefined,
    saveEffect: Spell['saveEffect'],
  ): number {
    let total = 0;

    for (const part of bonusParts) {
      if (part.amount <= 0 || !partPassesTargetGate(part, entity)) {
        continue;
      }

      let partDamage = part.amount;

      if (saveResult?.passed) {
        if (saveEffect === 'half') {
          partDamage = Math.floor(partDamage / 2);
        } else if (saveEffect === 'none') {
          partDamage = 0;
        }
      }

      if (part.type) {
        const stats = resolveActorStats(entity as DnDSceneEntity);

        partDamage = applyDamageDefenses(
          partDamage,
          part.type,
          stats.damageDefenses,
        ).finalDamage;
      }

      total += partDamage;
    }

    return total;
  }

  /**
   * Обрабатывает одну цель: спасбросок + применение урона (синхронно, авто-ролл).
   *
   * @param entity - сущность-цель
   * @param context - контекст заклинания
   * @param bonusParts - бонус-части урона от эффектов (снарядный путь);
   *   применяются той же записью HP с собственными гейтами/защитами
   * @returns результат обработки цели
   */
  function processTarget(
    entity: SceneEntity,
    context: SpellResolutionContext,
    bonusParts: RolledSpellDamagePart[] = [],
  ): SpellTargetResult {
    const { spell, damageTotal, spellSaveDC, socket } = context;

    let finalDamage = damageTotal;
    let saveResult: SavingThrowResult | undefined;

    // Спасбросок (проверка `!== 'none'` сужает saveType до AbilityType)
    if (spell.saveType !== 'none') {
      saveResult = rollSavingThrow(entity, spell.saveType, spellSaveDC);

      if (saveResult.passed) {
        switch (spell.saveEffect) {
          case 'half':
            finalDamage = Math.floor(damageTotal / 2);

            break;
          case 'none':
            finalDamage = 0;

            break;
          // 'special' — полный урон (обрабатывается вручную)
        }
      }
    }

    // Применяем урон (overrideDamageType для заклинаний с выбором стихии)
    const resolvedDamageType =
      context.overrideDamageType ?? getSpellPrimaryDamageType(spell);

    const effectsToApply = resolveEffectsToApply(spell, saveResult)?.map(
      (effect) => stampEffectTurnDuration(effect, entity.id, context.casterId),
    );

    const isHealingSpell = spellIsHealing(spell);

    // @heal.temp в базовой части: лечение временными ХП (правило «большее»)
    const healsTempHp = spellHealsTempHp(spell);

    // Бонус-урон от эффектов: гейты по HP цели оцениваются ДО записи HP,
    // к лечащим заклинаниям бонус-урон не применяется
    const bonusDamage = isHealingSpell
      ? 0
      : computeBonusDamageForEntity(
          entity,
          bonusParts,
          saveResult,
          spell.saveEffect,
        );

    const damageResult = applyResultsToEntity(
      entity,
      finalDamage,
      resolvedDamageType,
      isHealingSpell,
      effectsToApply,
      socket,
      { extraDamageAfterDefenses: bonusDamage, healTemp: healsTempHp },
    );

    return {
      actorName: entity.name,
      actorId: entity.id,
      saveRoll: saveResult?.roll,
      saveModifier: saveResult?.modifier,
      savePassed: saveResult?.passed,
      damageApplied: damageResult.finalDamage,
      hpBefore: damageResult.hpBefore,
      hpAfter: damageResult.hpAfter,
      tempHpGained: healsTempHp ? damageResult.tempHpGained : undefined,
      defenseOutcome: damageResult.defenseOutcome,
      appliedEffects: damageResult.appliedEffects,
    };
  }

  /**
   * Обрабатывает одну цель с ручным спасброском (через DiceRollModal).
   *
   * @param entity - сущность-цель
   * @param context - контекст заклинания
   * @returns промис с результатом обработки цели
   */
  async function processTargetManualSave(
    entity: SceneEntity,
    context: SpellResolutionContext,
  ): Promise<SpellTargetResult> {
    const { spell, damageTotal, spellSaveDC, socket } = context;

    let finalDamage = damageTotal;

    // Ручной спасбросок вызывается только для заклинаний со спасброском;
    // guard сужает saveType до AbilityType без приведения типов.
    if (!isSaveAbility(spell.saveType)) {
      throw new Error(
        `Заклинание "${spell.name}" не требует спасброска — ручной бросок невозможен`,
      );
    }

    const saveResult = await requestManualSavingThrow(
      entity,
      spell.saveType,
      spellSaveDC,
    );

    if (saveResult.passed) {
      switch (spell.saveEffect) {
        case 'half':
          finalDamage = Math.floor(damageTotal / 2);

          break;
        case 'none':
          finalDamage = 0;

          break;
        // 'special' — полный урон (обрабатывается вручную)
      }
    }

    // Применяем урон (overrideDamageType для заклинаний с выбором стихии)
    const resolvedDamageType =
      context.overrideDamageType ?? getSpellPrimaryDamageType(spell);

    const effectsToApply = resolveEffectsToApply(spell, saveResult)?.map(
      (effect) => stampEffectTurnDuration(effect, entity.id, context.casterId),
    );

    // @heal.temp в базовой части: лечение временными ХП (правило «большее»)
    const healsTempHp = spellHealsTempHp(spell);

    const damageResult = applyResultsToEntity(
      entity,
      finalDamage,
      resolvedDamageType,
      spellIsHealing(spell),
      effectsToApply,
      socket,
      { healTemp: healsTempHp },
    );

    return {
      actorName: entity.name,
      actorId: entity.id,
      saveRoll: saveResult.roll,
      saveModifier: saveResult.modifier,
      savePassed: saveResult.passed,
      damageApplied: damageResult.finalDamage,
      hpBefore: damageResult.hpBefore,
      hpAfter: damageResult.hpAfter,
      tempHpGained: healsTempHp ? damageResult.tempHpGained : undefined,
      defenseOutcome: damageResult.defenseOutcome,
      appliedEffects: damageResult.appliedEffects,
    };
  }

  /**
   * Форматирует изменение HP цели для сводки: урон, лечение или временные ХП
   * (`@heal.temp` — у результата заполнен `tempHpGained`).
   *
   * @param isHealing - является ли каст лечением
   * @param result - результат обработки цели
   * @returns строка вида «-5 HP», «+7 HP» или «+10 врем. HP»
   */
  function formatTargetHpChange(
    isHealing: boolean,
    result: SpellTargetResult,
  ): string {
    if (!isHealing) {
      return `-${result.damageApplied} HP`;
    }

    if (result.tempHpGained !== undefined) {
      return `+${result.tempHpGained} врем. HP`;
    }

    return `+${result.hpAfter - result.hpBefore} HP`;
  }

  /**
   * Отправляет сводку результатов AoE заклинания в чат.
   *
   * @param spellName - название заклинания
   * @param results - массив результатов по каждой цели
   * @param isHealing - является ли лечением
   * @param bonusPartLines - строки разбивки бонус-частей урона от эффектов
   *   (снарядный путь), показываются перед итогами по целям
   */
  /**
   * Строит структурированное сообщение для сводки заклинания в чате.
   *
   * @param spell - заклинание
   * @param results - массив результатов по целям
   * @param bonusPartLines - строки разбивки бонус-частей урона
   */
  function buildSpellSummaryMessage(
    spell: Spell,
    results: SpellTargetResult[],
    bonusPartLines: string[] = [],
  ): string {
    const lines: string[] = [spell.name];

    // Собираем все типы урона и лечения из частей заклинания
    const parts = getSpellDamageParts(spell);

    const hasHealing =
      parts.some((part) => damagePartIsHealing(part)) || spellIsHealing(spell);

    const damageTypes = [
      ...new Set(
        parts
          .filter((part) => !damagePartIsHealing(part) && part.formula)
          .map((part) => part.type ?? detectFormulaDamageType(part.formula))
          .filter((damageType): damageType is string => !!damageType),
      ),
    ];

    const kinds: string[] = [];

    if (damageTypes.length > 0) {
      const labels = damageTypes
        .map((damageType) => getShortDamageTypeLabel(damageType))
        .filter(Boolean);

      const typeSuffix = labels.length > 0 ? ` (${labels.join(', ')})` : '';

      kinds.push(`Урон${typeSuffix}`);
    }

    if (hasHealing) {
      kinds.push('Лечение');
    }

    if (kinds.length > 0) {
      lines.push(kinds.join(' + '));
    }

    // Бонус-части
    for (const partLine of bonusPartLines) {
      lines.push(`Бонус-урон: ${partLine}`);
    }

    // Результаты по целям
    for (const result of results) {
      const hpChange = formatTargetHpChange(spellIsHealing(spell), result);

      let line = `→ ${result.actorName}: ${hpChange}`;

      line += formatDamageDefenseSuffix(result.defenseOutcome);

      if (result.appliedEffects && result.appliedEffects.length > 0) {
        line += ` [${result.appliedEffects.join(', ')}]`;
      }

      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * Отправляет сводку по целям (AoE-путь или несколько снарядов).
   *
   * @param spell - заклинание
   * @param results - массив результатов по каждой цели
   * @param bonusPartLines - строки разбивки бонус-частей урона от эффектов
   */
  function sendAoeSummary(
    spell: Spell,
    results: SpellTargetResult[],
    bonusPartLines: string[] = [],
  ): void {
    if (results.length === 0) {
      chatStore.sendMessage(`${spell.name} — Нет целей в области`, 'text');

      return;
    }

    const message = buildSpellSummaryMessage(spell, results, bonusPartLines);

    chatStore.sendMessage(message, 'text');
  }

  /**
   * Отправляет итог для single-target заклинания.
   *
   * @param spell - заклинание
   * @param result - результат цели
   */
  function sendSingleTargetSummary(
    spell: Spell,
    result: SpellTargetResult,
  ): void {
    const message = buildSpellSummaryMessage(spell, [result]);

    chatStore.sendMessage(message, 'text');
  }

  /**
   * Обрабатывает ручные спасброски последовательно (один за другим).
   * Каждый бросок открывает DiceRollModal и ждёт результат.
   *
   * @param targets - массив акторов с ручными спасброками
   * @param context - контекст заклинания
   * @param isHealing - является ли лечением
   * @param spellName - название заклинания
   * @param sendSummaryAfter - отправлять ли сводку после завершения ручных бросков
   * @returns промис с массивом результатов
   */
  async function processManualTargetsSequentially(
    targets: SceneEntity[],
    context: SpellResolutionContext,
    isHealing: boolean,
    spellName: string,
    sendSummaryAfter: boolean,
  ): Promise<SpellTargetResult[]> {
    const manualResults: SpellTargetResult[] = [];

    for (const entity of targets) {
      try {
        const result = await processTargetManualSave(entity, context);

        manualResults.push(result);
      } catch (error) {
        console.error(
          `[SpellResolution] Ошибка ручного спасброска "${entity.name}":`,
          error,
        );
      }
    }

    // Если это единственная цель (single-target) — отправляем одиночную сводку
    if (targets.length === 1 && manualResults.length === 1) {
      sendSingleTargetSummary(context.spell, manualResults[0]);
    } else if (sendSummaryAfter && manualResults.length > 0) {
      // Отправляем сводку ручных результатов
      sendAoeSummary(context.spell, manualResults);
    }

    return manualResults;
  }

  /**
   * Главная функция: обрабатывает все цели заклинания.
   *
   * Для AoE: находит токены в шаблоне, кидает спасы, применяет урон.
   * Для single-target: берёт цель из targetStore, кидает спас, применяет урон.
   *
   * Акторы с `autoSaves: false` получают ручной спасбросок через DiceRollModal.
   * Акторы с `autoSaves: true` (по умолчанию) — автоматический бросок.
   *
   * @param context - контекст заклинания (spell, damageTotal, spellSaveDC, actors, socket)
   * @param aoeContext - контекст AoE (template, tokens, gridSize) — если есть шаблон
   * @returns массив результатов по каждой цели
   */
  function resolveSpellTargets(
    context: SpellResolutionContext,
    aoeContext?: AoeContext,
  ): SpellTargetResult[] {
    const { spell, actors } = context;
    const results: SpellTargetResult[] = [];

    if (aoeContext) {
      // AoE: находим токены в области шаблона
      const affectedTokens = findTokensInTemplate(
        aoeContext.template,
        aoeContext.tokens,
        aoeContext.gridSize,
      );

      /** Сущности с авто-спасброском (NPC/существа и прочие с autoSaves !== false) */
      const autoTargets: SceneEntity[] = [];

      /** Сущности с ручным спасброском (PC с autoSaves === false) */
      const manualTargets: SceneEntity[] = [];

      for (const token of affectedTokens) {
        const entity = actors.find(
          (entityItem) => entityItem.id === token.actorId,
        );

        if (!entity) {
          continue;
        }

        // Пропускаем сущности без корректных данных системы
        if (!entity.system?.abilities) {
          console.warn(
            `[SpellResolution] Сущность "${entity.name}" (${entity.id}) не имеет system.abilities — пропущена`,
          );

          continue;
        }

        // Ручной спасбросок нужен если есть спасбросок и autoSaves не включён
        const needsManualSave =
          spell.saveType !== 'none' && !resolveAutoSaves(entity);

        if (needsManualSave) {
          manualTargets.push(entity);
        } else {
          autoTargets.push(entity);
        }
      }

      // Фаза 1: обрабатываем авто-цели синхронно
      for (const entity of autoTargets) {
        try {
          const result = processTarget(entity, context);

          results.push(result);
        } catch (error) {
          console.error(
            `[SpellResolution] Ошибка обработки цели "${entity.name}":`,
            error,
          );
        }
      }

      // Фаза 2: ручные спасброски — последовательно через DiceRollModal
      if (manualTargets.length > 0) {
        processManualTargetsSequentially(
          manualTargets,
          context,
          spellIsHealing(spell),
          spell.name,
          autoTargets.length === 0, // отправлять сводку, только если нет авто-целей
        );
      }

      // Отправляем сводку для авто-результатов.
      // Для ручных — сводка будет отправлена после завершения всех бросков.
      if (autoTargets.length > 0) {
        sendAoeSummary(spell, results);
      }
    } else {
      // Single-target: берём цель из targetStore
      const targetEntity = targetStore.getTargetActor();

      if (targetEntity) {
        // Пропускаем сущности без корректных данных системы
        if (!targetEntity.system?.abilities) {
          console.warn(
            `[SpellResolution] Сущность "${targetEntity.name}" (${targetEntity.id}) не имеет system.abilities — пропущена`,
          );

          return results;
        }

        // Проверяем, нужен ли ручной спасбросок
        const needsManualSave =
          spell.saveType !== 'none' && !resolveAutoSaves(targetEntity);

        if (needsManualSave) {
          // Ручной бросок для single-target
          processManualTargetsSequentially(
            [targetEntity],
            context,
            spellIsHealing(spell),
            spell.name,
            true,
          );
        } else {
          const result = processTarget(targetEntity, context);

          results.push(result);

          // Отправляем результат для single-target в чат
          sendSingleTargetSummary(spell, result);
        }
      }
    }

    return results;
  }

  /**
   * Серия атак снарядов: каждый снаряд кидает отдельный бросок попадания
   * против AC своей цели (с условными защитными бонусами и иммунитетом к
   * критам), урон катается только за попавшие снаряды, крит удваивает кости
   * только своего снаряда. Бонус-части урона от эффектов (напр. Hex) катаются
   * НА КАЖДОЕ попадание — со своими типами и защитами цели; крит удваивает и
   * их кости. Плоские добавки вида «+мод. ХАР» (Agonizing Blast) живут прямо
   * в формуле части урона снаряда и входят в каждый бросок автоматически.
   *
   * Броски атаки уходят в чат отдельными roll-сообщениями (как у оружия),
   * урон — одной общей 3D-анимацией и сводкой по целям (как у Волшебной
   * стрелы).
   *
   * @param context - контекст разрешения заклинания
   * @param options - параметры серии
   * @param options.attack - модификатор, режим и тип атаки
   * @param options.resolvedDamageFormula - формула урона ОДНОГО снаряда (с разрешёнными @-переменными)
   * @param options.scene - текущая сцена (для токенов распределения)
   * @param options.bonusDamageParts - бонус-части урона от эффектов (за каждое попадание)
   */
  function resolveProjectileAttackSeries(
    context: SpellResolutionContext,
    options: {
      attack: ProjectileAttackContext;
      resolvedDamageFormula: string;
      scene: Scene | null;
      bonusDamageParts?: SpellDamagePartInput[];
    },
  ): void {
    void import('@/stores/projectileStore').then(({ useProjectileStore }) => {
      const projectileStore = useProjectileStore();
      const assigned = projectileStore.assignedTargets;
      const { spell } = context;
      const { attack, resolvedDamageFormula, scene } = options;

      if (assigned.size === 0 || !scene) {
        projectileStore.stopTargeting();

        return;
      }

      const diceStore = useDiceRollerStore();
      const results: SpellTargetResult[] = [];

      // Кубики урона всех снарядов — одной общей 3D-анимацией
      // (броски атаки анимируются своими roll-сообщениями в чате)
      const damageDiceGroups: DiceGroupResult[] = [];

      let damageGrandTotal = 0;
      let totalHits = 0;

      const bonusPartInputs = options.bonusDamageParts ?? [];
      const totalProjectiles = projectileStore.assignedProjectilesCount;

      let projectileNumber = 0;

      for (const [tokenId, count] of assigned.entries()) {
        const sceneToken = scene.tokens.find((token) => token.id === tokenId);

        if (!sceneToken) {
          continue;
        }

        const targetEntity = context.actors.find(
          (actorEntry) => actorEntry.id === sceneToken.actorId,
        );

        if (!targetEntity) {
          continue;
        }

        // AC цели с условными защитными бонусами (напр. +2 КД от дальнобойных)
        // и флаги (иммунитет к критам) — per-target, как в targetStore
        const targetStats = resolveActorStats(targetEntity as DnDSceneEntity);

        const targetAc =
          targetStats.armorClass
          + evaluateDefensiveACBonus(
            collectActiveEffects(targetEntity as DnDSceneEntity),
            {
              attackType: attack.attackType,
            },
          );

        const hitDamageDetails: number[] = [];
        const rolledBonusParts: RolledSpellDamagePart[] = [];

        let targetDamage = 0;
        let hits = 0;

        for (let beamIndex = 0; beamIndex < count; beamIndex += 1) {
          projectileNumber += 1;

          const attackFormula = buildAttackFormula(
            attack.attackModifier,
            attack.rollMode,
          );

          const attackRoll = diceStore.parseAndRoll(attackFormula);

          const attackResult = resolveAttackRoll({
            total: attackRoll.total,
            attackModifier: attack.attackModifier,
            targetAc,
            targetFlags: targetStats.activeFlags,
          });

          attackRoll.label = buildAttackLabel({
            weaponName:
              totalProjectiles > 1
                ? `${spell.name} (снаряд ${projectileNumber}/${totalProjectiles})`
                : spell.name,
            targetName: targetEntity.name,
            result: attackResult,
          });

          chatStore.sendMessage(attackFormula, 'roll', attackRoll);

          if (!attackResult.isHit) {
            continue;
          }

          hits += 1;
          totalHits += 1;

          // Урон снаряда; крит удваивает кости только этого снаряда
          if (resolvedDamageFormula) {
            const damageFormula = attackResult.isCriticalHit
              ? doubleDiceInFormula(resolvedDamageFormula)
              : resolvedDamageFormula;

            const damageRoll = diceStore.parseAndRoll(damageFormula);

            hitDamageDetails.push(damageRoll.total);
            targetDamage += damageRoll.total;
            damageGrandTotal += damageRoll.total;
            damageDiceGroups.push(...damageRoll.dice);
          }

          // Бонус-части эффектов — отдельный бросок на каждое попадание
          for (const bonusPart of bonusPartInputs) {
            const bonusFormula = attackResult.isCriticalHit
              ? doubleDiceInFormula(bonusPart.formula)
              : bonusPart.formula;

            const bonusRoll = diceStore.parseAndRoll(bonusFormula);

            damageGrandTotal += bonusRoll.total;
            damageDiceGroups.push(...bonusRoll.dice);

            rolledBonusParts.push({
              amount: bonusRoll.total,
              formula: bonusFormula,
              values: bonusRoll.dice.flatMap((group) => group.values),
              type: bonusPart.type,
              isHealing: false,
              target: 'selected',
              requiresDamage: false,
              targetGate: bonusPart.targetGate,
            });
          }
        }

        if (hits === 0) {
          // Все снаряды по цели промахнулись — строка в сводке без записи HP
          const targetDnd = targetEntity as DnDSceneEntity;

          const hpCurrent = isCreatureEntity(targetDnd)
            ? (targetDnd.system.hitPoints.current ?? 0)
            : targetDnd.system.hitPoints.current;

          results.push({
            actorName: `${targetEntity.name} (промах ×${count})`,
            actorId: targetEntity.id,
            damageApplied: 0,
            hpBefore: hpCurrent,
            hpAfter: hpCurrent,
          });

          continue;
        }

        const result = processTarget(
          targetEntity,
          { ...context, damageTotal: targetDamage },
          rolledBonusParts,
        );

        const prettyFormula = resolvedDamageFormula.replace(/d/gi, 'к');

        let hitsSuffix = '';

        if (hitDamageDetails.length > 0) {
          const formulaPart =
            hits > 1 ? `(${prettyFormula})×${hits}` : prettyFormula;

          hitsSuffix = ` (${formulaPart})`;
        }

        result.actorName = `${result.actorName} (попало ${hits}/${count}${hitsSuffix})`;

        results.push(result);
      }

      if (damageDiceGroups.length > 0) {
        diceStore.animateRoll({
          formula: resolvedDamageFormula,
          total: damageGrandTotal,
          dice: damageDiceGroups,
          details: '',
          label: spell.name,
        });
      }

      // Бонус-части показываем формулами «за каждое попадание»: значения у
      // каждого попадания свои и уже вошли в итог по целям
      const bonusPartLines =
        totalHits > 0
          ? bonusPartInputs.map(
              (bonusPart) =>
                `${bonusPart.formula} ${getPartKindLabel({
                  isHealing: false,
                  type: bonusPart.type,
                })} за каждое попадание`,
            )
          : [];

      sendAoeSummary(spell, results, bonusPartLines);

      projectileStore.stopTargeting();
    });
  }

  /**
   * Единая точка разрешения урона заклинания после броска кастера.
   *
   * Инкапсулирует общую логику обоих путей каста (хотбар-макрос и лист
   * персонажа): снаряды (каждый — отдельный бросок), AoE-шаблон или одиночная
   * цель. Вызывающий код отвечает за гейт `needsAutoResolution(spell) &&
   * damageTotal > 0`, построение `context` и жизненный цикл шаблона.
   *
   * @param context - контекст разрешения (заклинание, урон, цели, сокет)
   * @param options - параметры каста (снаряды, формула, сцена, кэш шаблона)
   * @param options.hasProjectiles - многоснарядное заклинание (напр. Волшебная стрела)
   * @param options.resolvedDamageFormula - формула урона с подставленными @-переменными
   * @param options.scene - текущая сцена
   * @param options.cachedTemplate - кэшированный шаблон AoE (если заклинание с областью)
   * @param options.bonusDamageParts - бонус-части урона от Active Effects для
   *   снарядного пути: катаются один раз на каст и применяются каждой задетой
   *   цели (per-target гейты по HP, свои защиты по типу)
   * @param options.projectileAttack - серия атак снарядов: бросок попадания
   *   на каждый снаряд, урон только за попавшие (Мистический заряд)
   */
  function resolveSpellDamage(
    context: SpellResolutionContext,
    options: {
      /** Многоснарядное заклинание (напр. Волшебная стрела) */
      hasProjectiles: boolean;
      /** Формула урона с подставленными @-переменными (для снарядов) */
      resolvedDamageFormula: string;
      /** Текущая сцена (для токенов и размера клетки) */
      scene: Scene | null;
      /** Кэшированный шаблон AoE (если заклинание с областью) */
      cachedTemplate?: MeasurementTemplate | null;
      /** Бонус-части урона от эффектов (снарядный путь, формулы разрешены) */
      bonusDamageParts?: SpellDamagePartInput[];
      /**
       * Серия атак снарядов (атакующие снарядные заклинания: Мистический
       * заряд, Палящий луч): бросок попадания на каждый снаряд, урон только
       * за попавшие. Без этого поля снаряды применяются авто-попаданием
       * (Волшебная стрела).
       */
      projectileAttack?: ProjectileAttackContext;
    },
  ): void {
    const { spell } = context;

    const { hasProjectiles, resolvedDamageFormula, scene, cachedTemplate } =
      options;

    // Атакующие снаряды: серия бросков попадания, урон только за попавшие
    if (hasProjectiles && options.projectileAttack) {
      resolveProjectileAttackSeries(context, {
        attack: options.projectileAttack,
        resolvedDamageFormula,
        scene,
        bonusDamageParts: options.bonusDamageParts,
      });

      return;
    }

    // Снаряды: каждый снаряд — отдельный бросок урона (D&D 5e правила)
    if (hasProjectiles) {
      void import('@/stores/projectileStore').then(({ useProjectileStore }) => {
        const projectileStore = useProjectileStore();
        const assigned = projectileStore.assignedTargets;

        if (assigned.size > 0 && scene) {
          const diceStore = useDiceRollerStore();
          const results: SpellTargetResult[] = [];

          // Собираем все dice groups для объединённой 3D-анимации
          const allDiceGroups: DiceGroupResult[] = [];

          let grandTotal = 0;

          // Бонус-части урона от эффектов: катаются ОДИН раз на каст (как в
          // AoE — все цели получают одно выпавшее значение), применяются
          // каждой задетой цели один раз, независимо от числа снарядов в ней.
          // К лечащим заклинаниям бонус-урон не применяется.
          const rolledBonusParts: RolledSpellDamagePart[] = [];

          const bonusPartInputs = spellIsHealing(spell)
            ? []
            : (options.bonusDamageParts ?? []);

          for (const bonusPart of bonusPartInputs) {
            const bonusRoll = diceStore.parseAndRoll(bonusPart.formula);

            allDiceGroups.push(...bonusRoll.dice);

            rolledBonusParts.push({
              amount: bonusRoll.total,
              formula: bonusPart.formula,
              values: bonusRoll.dice.flatMap((group) => group.values),
              type: bonusPart.type,
              isHealing: false,
              target: 'selected',
              requiresDamage: false,
              targetGate: bonusPart.targetGate,
            });

            grandTotal += bonusRoll.total;
          }

          for (const [tokenId, count] of assigned.entries()) {
            const sceneToken = scene.tokens.find(
              (token) => token.id === tokenId,
            );

            if (!sceneToken) {
              continue;
            }

            const targetActor = context.actors.find(
              (actorEntry) => actorEntry.id === sceneToken.actorId,
            );

            if (!targetActor) {
              continue;
            }

            const rollDetails: number[] = [];

            let totalProjectileDamage = 0;

            for (
              let projectileIndex = 0;
              projectileIndex < count;
              projectileIndex++
            ) {
              if (resolvedDamageFormula) {
                const rollResult = diceStore.parseAndRoll(
                  resolvedDamageFormula,
                );

                rollDetails.push(rollResult.total);
                totalProjectileDamage += rollResult.total;
                allDiceGroups.push(...rollResult.dice);
              }
            }

            grandTotal += totalProjectileDamage;

            const result = processTarget(
              targetActor,
              {
                ...context,
                damageTotal: totalProjectileDamage,
              },
              rolledBonusParts,
            );

            // Показываем разбивку: "Новый 1 ((1к4+1)×3)"
            const prettyFormula = resolvedDamageFormula.replace(/d/gi, 'к');

            result.actorName =
              count > 1
                ? `${result.actorName} ((${prettyFormula})×${count})`
                : `${result.actorName} (${prettyFormula})`;

            results.push(result);
          }

          // 3D-анимация всех снарядных кубиков одновременно
          if (allDiceGroups.length > 0) {
            diceStore.animateRoll({
              formula: resolvedDamageFormula,
              total: grandTotal,
              dice: allDiceGroups,
              details: '',
              label: spell.name,
            });
          }

          // Разбивка бонус-частей в сводке (нулевые и не прошедшие гейты
          // ни у одной цели — не показываем, чтобы не засорять чат)
          const bonusPartLines = rolledBonusParts
            .filter(
              (rolledPart) =>
                rolledPart.amount > 0
                && results.some((result) => {
                  const entity = context.actors.find(
                    (actorEntry) => actorEntry.id === result.actorId,
                  );

                  return entity && partPassesTargetGate(rolledPart, entity);
                }),
            )
            .map((rolledPart) => formatRolledPartLine(rolledPart));

          sendAoeSummary(spell, results, bonusPartLines);
        }

        projectileStore.stopTargeting();
      });

      return;
    }

    // AoE: поиск целей в кэшированном шаблоне
    if (cachedTemplate && scene) {
      const gridSize = resolveGridCellSize(scene.gridSettings);
      const tokens = scene.tokens ?? [];

      resolveSpellTargets(context, {
        template: cachedTemplate,
        tokens,
        gridSize,
      });
    } else {
      // Single-target: берём цель из targetStore
      resolveSpellTargets(context);
    }
  }

  return {
    needsAutoResolution,
    resolveSpellTargets,
    resolveSpellDamage,
    resolveSpellDamageWithParts,
    processTarget,
    sendAoeSummary,
  };
}
