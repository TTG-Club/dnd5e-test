import type { DamagePart, Scene, SceneEntity } from '@vtt/shared';
import type {
  ActiveEffect,
  DamageDefenseOutcome,
  DnDSceneEntity,
  Spell,
} from '@vtt/shared/system/dnd.js';

import type {
  RolledSpellDamagePart,
  SavingThrowResult,
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
  applyHpChange,
  applyMultiTypeDamageDefenses,
  expandDamageParts,
  findTokensInTemplate,
  formatDamageDefenseSuffix,
  getEntityConditionImmunities,
  isImmuneToCondition,
  mergeAppliedEffects,
  resolveActorStats,
  resolveEffectApplication,
  withInitializedDuration,
} from '@vtt/shared/system/dnd.js';

import { emitEntityUpdate } from '@/core/entityUtils';
import { useModalManager } from '@/shared_ui/composables/useModalManager';
import { useChatStore } from '@/stores/chatStore';
import { useDiceRollerStore } from '@/stores/diceRollerStore';
import { useTargetStore } from '@/stores/targetStore';

import {
  formatTargetGateSuffix,
  getPartKindLabel,
  orderTargetsBySaveMode,
  partPassesTargetGate,
  stampEffectTurnDuration,
} from './spellResolutionShared';
import { useSpellSavingThrows } from './useSpellSavingThrows';

/**
 * Проставляет динамическую Сл повторного спасброска: если у эффекта
 * `recurringSave.dc === 0` (маркер «использовать Сл кастера»), возвращает копию
 * с подставленной Сл заклинателя. Нужно заклинаниям персонажей (Сл зависит от
 * билда); у существ Сл фиксирована (dc > 0) и не трогается.
 *
 * @param effect - накладываемый эффект
 * @param spellSaveDC - Сл спасброска источника (кастера)
 * @returns исходный эффект или копия с проставленной Сл
 */
function stampRecurringSaveDc(
  effect: ActiveEffect,
  spellSaveDC: number,
): ActiveEffect {
  if (!effect.recurringSave || effect.recurringSave.dc > 0) {
    return effect;
  }

  return {
    ...effect,
    recurringSave: { ...effect.recurringSave, dc: spellSaveDC },
  };
}

/** Строка чата для одной части урона наложенного эффекта */
interface EffectDamageLine {
  /** Локализованный тип урона (для заголовка) */
  typeLabel: string;
  /** Формула броска */
  formula: string;
  /** Выпавшие значения кубиков */
  values: number[];
  /** Итог урона после множителя спаса и защит */
  applied: number;
  /** Сработавшая защита (уязв./сопр./иммун.) */
  outcome: DamageDefenseOutcome;
}

/**
 * Композабл для многочастного разрешения урона/лечения заклинания.
 */
export function useSpellDamageWithParts() {
  const chatStore = useChatStore();
  const targetStore = useTargetStore();
  const diceRollerStore = useDiceRollerStore();
  const { openModal } = useModalManager();
  const { resolveSavingThrowForTarget } = useSpellSavingThrows();

  /**
   * Записывает чистое изменение HP сущности ОДНИМ апдейтом.
   *
   * Используется многочастным путём: части уже сведены (урон с учётом защит,
   * лечение) в суммарные `totalDamage`/`totalHeal`/`totalTempHeal`, поэтому HP
   * пишется один раз — это исключает двойной emit и потерю урона при нескольких
   * частях на одну цель.
   *
   * Урон сначала снимает имеющиеся временные ХП, остаток — текущие (правило
   * 5e). Временные ХП (`totalTempHeal`) не прибавляются к текущим хитам и не
   * суммируются с оставшимися временными — берётся большее (правило 5e).
   *
   * @param entity - сущность
   * @param totalDamage - суммарный урон (после защит/спасброска)
   * @param totalHeal - суммарное лечение
   * @param totalTempHeal - суммарные временные ХП (`@heal.temp`)
   * @param effectsToApply - эффекты для наложения (или undefined)
   * @param socket - сокет
   * @returns HP до/после, полученные временные ХП и имена наложенных эффектов
   */
  function writeEntityHpDelta(
    entity: SceneEntity,
    totalDamage: number,
    totalHeal: number,
    totalTempHeal: number,
    effectsToApply: ActiveEffect[] | undefined,
    socket: SpellResolutionContext['socket'],
  ): {
    hpBefore: number;
    hpAfter: number;
    tempHpGained: number;
    appliedEffects: string[];
  } {
    // Ядро видит entity как Base*; в D&D-композабле восстанавливаем D&D-форму.
    const dnd = entity as DnDSceneEntity;

    const hpBefore = isCreatureEntity(dnd)
      ? (dnd.system.hitPoints.current ?? 0)
      : dnd.system.hitPoints.current;

    const maxHp = isCreatureEntity(dnd)
      ? (dnd.system.hitPoints.max ?? 0)
      : dnd.system.hitPoints.max;

    const tempBefore = dnd.system.hitPoints.temp ?? 0;

    // Урон сначала снимает временные ХП (правило 5e), остаток — текущие
    const hpChange = applyHpChange({
      hpBefore,
      maxHp,
      tempBefore,
      damage: totalDamage,
      heal: totalHeal,
    });

    const hpAfter = hpChange.hpAfter;

    // Новые временные ХП не суммируются с оставшимися — берётся большее
    const tempAfter = Math.max(hpChange.tempAfter, totalTempHeal);

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

      // Один и тот же статус не стакается: повтор ЗАМЕНЯЕТ прежний (5e 2024,
      // «самый недавний/сильный»); разные эффекты складываются.
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

    emitEntityUpdate(socket, updatedEntity);

    return {
      hpBefore,
      hpAfter,
      tempHpGained: tempAfter - hpChange.tempAfter,
      appliedEffects,
    };
  }

  /**
   * Спрашивает игрока, к какой сущности применить choose-части.
   *
   * Открывает модалку со списком целей на сцене (токены с корректными данными
   * системы) и резолвится выбранной сущностью либо `null` при отмене.
   *
   * @param spell - заклинание (для заголовка)
   * @param chooseParts - брошенные choose-части (для описания «что применяется»)
   * @param scene - текущая сцена (источник списка токенов)
   * @param actors - все сущности мира (акторы + существа)
   * @returns промис с выбранной сущностью или null
   */
  function pickChooseTarget(
    spell: Spell,
    chooseParts: RolledSpellDamagePart[],
    scene: Scene | null,
    actors: SceneEntity[],
  ): Promise<SceneEntity | null> {
    return new Promise((resolve) => {
      // Уникальные сущности, у которых есть токен на сцене
      const seen = new Set<string>();
      const targetOptions: { id: string; name: string }[] = [];

      for (const token of scene?.tokens ?? []) {
        const entity = actors.find((item) => item.id === token.actorId);

        if (entity?.system?.abilities && !seen.has(entity.id)) {
          seen.add(entity.id);
          targetOptions.push({ id: entity.id, name: entity.name });
        }
      }

      const description = chooseParts
        .map(
          (part) =>
            `${getPartKindLabel(part)} ${part.formula}${formatTargetGateSuffix(part.targetGate)}`,
        )
        .join(', ');

      openModal('SpellChooseTargetModal', {
        allowMultiple: true,
        title: `${spell.name} — выбор цели`,
        description: `Выберите цель для: ${description}`,
        options: targetOptions,
        onConfirm: (entityId: string | null) => {
          resolve(
            entityId
              ? (actors.find((item) => item.id === entityId) ?? null)
              : null,
          );
        },
      });
    });
  }

  /**
   * Бросает урон эффекта (с множителем спаса) и применяет защиты цели по типу.
   * Поддерживает плоские формулы; @-формулы пропускаются с warn (у эффектов
   * существ/оружия формулы плоские, контекста заклинания тут нет).
   *
   * @param entity - цель
   * @param parts - части урона эффекта
   * @param multiplier - множитель урона (1 / 0.5 по результату спасброска)
   * @returns суммарный урон и сработавшая защита цели
   */
  function rollEffectDamage(
    entity: SceneEntity,
    parts: DamagePart[],
    multiplier: number,
  ): {
    damage: number;
    outcome: DamageDefenseOutcome;
    lines: EffectDamageLine[];
  } {
    const stats = resolveActorStats(entity as DnDSceneEntity);

    let total = 0;
    let outcome: DamageDefenseOutcome = 'normal';

    const lines: EffectDamageLine[] = [];

    // Разворачиваем инлайн-токены `@dmg.<type>`/`@target.*` в типизированные
    // сегменты тем же ядром, что и базовый урон: редактор пишет тип урона
    // токеном (напр. `2к6@dmg.poison`), а не в поле `type`. У урона эффекта нет
    // контекста `@mod`/`@prof`/`@level` — нерезолвенные сегменты пропускаем.
    const segments = expandDamageParts(parts, undefined, (formula) => formula);

    for (const segment of segments) {
      // Урон эффекта не лечит (редактор скрывает @heal) — на всякий случай.
      if (segment.isHealing) {
        continue;
      }

      if (segment.formula.includes('@')) {
        console.warn(
          '[EffectDamage] @-формула не поддержана:',
          segment.formula,
        );

        continue;
      }

      const rolled = diceRollerStore.parseAndRoll(segment.formula);
      const values = rolled.dice.flatMap((group) => group.values);

      const types = segment.types ?? (segment.type ? [segment.type] : []);

      let damage = Math.floor(rolled.total * multiplier);
      let partOutcome: DamageDefenseOutcome = 'normal';

      if (types.length > 0) {
        const defense = applyMultiTypeDamageDefenses(
          damage,
          types,
          stats.damageDefenses,
        );

        damage = defense.finalDamage;
        partOutcome = defense.outcome;

        if (defense.outcome !== 'normal') {
          outcome = defense.outcome;
        }
      }

      total += damage;

      lines.push({
        typeLabel: getPartKindLabel({
          isHealing: false,
          type: segment.type,
          types: segment.types,
        }),
        formula: segment.formula,
        values,
        applied: damage,
        outcome: partOutcome,
      });
    }

    return { damage: total, outcome, lines };
  }

  /**
   * Многочастное разрешение урона/лечения заклинания.
   *
   * Бросок уже выполнен в модалке (значения в `parts`). Логика:
   * «вычислить все части → применить по сущности ОДНИМ апдейтом».
   * - целевые части (`selected`/`choose`) → целям (AoE-токены или выбранная цель);
   * - `self`-части → заклинателю;
   * - гейт-ветки `@target.full`/`@target.notFull` (`targetGate`) — фильтруются
   *   по фактическому HP каждой цели в момент применения (per-target);
   * - спасбросок — один на цель (авто или ручной через DiceRollModal по
   *   `autoSaves` цели; авто-цели обрабатываются первыми), влияет на
   *   урон-части цели;
   * - защиты по типу — на каждую урон-часть;
   * - `requiresDamage` — лечащая/гейтнутая часть применяется только если по
   *   заклинанию суммарно нанесён урон (>0).
   *
   * Ограничения (отложено): снаряды — для них используется одночастный путь.
   *
   * @param context - контекст (заклинание, DC, сущности, сокет, casterId)
   * @param parts - брошенные части
   * @param options - сцена и кэш шаблона AoE
   * @param options.scene - текущая сцена
   * @param options.cachedTemplate - кэшированный шаблон AoE (если заклинание с областью)
   */
  async function resolveSpellDamageWithParts(
    context: SpellResolutionContext,
    parts: RolledSpellDamagePart[],
    options: {
      scene: Scene | null;
      cachedTemplate?: import('@vtt/shared').MeasurementTemplate | null;
    },
  ): Promise<void> {
    const { spell, spellSaveDC, actors, socket } = context;
    const { scene, cachedTemplate } = options;

    // 1. Целевые сущности: AoE-шаблон или одиночная цель из targetStore
    const targetEntities: SceneEntity[] = [];

    if (cachedTemplate && scene) {
      const affectedTokens = findTokensInTemplate(
        cachedTemplate,
        scene.tokens ?? [],
        resolveGridCellSize(scene.gridSettings),
      );

      for (const token of affectedTokens) {
        const entity = actors.find((item) => item.id === token.actorId);

        if (entity?.system?.abilities) {
          targetEntities.push(entity);
        }
      }
    } else {
      const targetEntity = targetStore.getTargetActor();

      if (targetEntity?.system?.abilities) {
        targetEntities.push(targetEntity);
      }
    }

    // 2. Заклинатель (для self-частей)
    const caster = context.casterId
      ? (actors.find((item) => item.id === context.casterId) ?? null)
      : null;

    // Разделяем части по адресату:
    // - self    → заклинателю;
    // - choose  → отдельно выбираемой цели (спрашиваем после броска);
    // - selected→ текущей цели (targetStore) или токенам в AoE-шаблоне.
    const selfParts = parts.filter((part) => part.target === 'self');
    const chooseParts = parts.filter((part) => part.target === 'choose');

    const selectedParts = parts.filter(
      (part) => part.target !== 'self' && part.target !== 'choose',
    );

    // 2a. Цель для choose-частей: спрашиваем игрока (после броска урона).
    // Это покрывает сценарий «нанести урон выбранной цели, затем указать
    // кого лечить». При отмене choose-части просто не применяются.
    let chooseEntity: SceneEntity | null = null;

    if (chooseParts.length > 0) {
      chooseEntity = await pickChooseTarget(spell, chooseParts, scene, actors);
    }

    interface EntityAccumulator {
      entity: SceneEntity;
      save?: SavingThrowResult;
      damageBase: number;
      damageGated: number;
      healBase: number;
      healGated: number;
      tempHealBase: number;
      tempHealGated: number;
      defenseOutcome: DamageDefenseOutcome;
      isTarget: boolean;
    }

    const accumulators = new Map<string, EntityAccumulator>();

    /** Вклад одной части в одну цель — для группировки чата по типу урона. */
    interface PartContribution {
      entityId: string;
      entityName: string;
      /** Итог части для цели: урон (после спас./защит) или лечение/врем. ХП */
      applied: number;
      /** Сработавшая защита (для суффикса уязв./сопр./иммун.) */
      outcome: DamageDefenseOutcome;
      /** Лечащая/врем. часть с `requiresDamage` — скрыта, пока урон не нанесён */
      requiresGate: boolean;
    }

    // Вклады по частям (ключ — брошенная часть), для разбивки чата по типам
    const partContributions = new Map<
      RolledSpellDamagePart,
      PartContribution[]
    >();

    /** Регистрирует вклад части в цель (для группировки чата по типу урона). */
    function recordContribution(
      part: RolledSpellDamagePart,
      entity: SceneEntity,
      applied: number,
      outcome: DamageDefenseOutcome,
      requiresGate: boolean,
    ): void {
      let list = partContributions.get(part);

      if (!list) {
        list = [];
        partContributions.set(part, list);
      }

      list.push({
        entityId: entity.id,
        entityName: entity.name,
        applied,
        outcome,
        requiresGate,
      });
    }

    function getAccumulator(
      entity: SceneEntity,
      isTarget: boolean,
    ): EntityAccumulator {
      let accumulator = accumulators.get(entity.id);

      if (!accumulator) {
        accumulator = {
          entity,
          damageBase: 0,
          damageGated: 0,
          healBase: 0,
          healGated: 0,
          tempHealBase: 0,
          tempHealGated: 0,
          defenseOutcome: 'normal',
          isTarget,
        };

        accumulators.set(entity.id, accumulator);
      }

      accumulator.isTarget = accumulator.isTarget || isTarget;

      return accumulator;
    }

    /** Считает итоговый урон части с учётом спасброска и защит (без записи). */
    function computeDamageFinal(
      entity: SceneEntity,
      amount: number,
      types: string[] | undefined,
      save: SavingThrowResult | undefined,
    ): { final: number; outcome: DamageDefenseOutcome } {
      let dmg = amount;

      if (save?.passed) {
        if (spell.saveEffect === 'half') {
          dmg = Math.floor(amount / 2);
        } else if (spell.saveEffect === 'none') {
          dmg = 0;
        }
      }

      let outcome: DamageDefenseOutcome = 'normal';

      if (types && types.length > 0) {
        const stats = resolveActorStats(entity as DnDSceneEntity);

        // Несколько типов на одной кости — защиты по наиболее выгодному цели
        const defenseResult = applyMultiTypeDamageDefenses(
          dmg,
          types,
          stats.damageDefenses,
        );

        dmg = defenseResult.finalDamage;
        outcome = defenseResult.outcome;
      }

      return { final: dmg, outcome };
    }

    /** Накапливает часть в аккумулятор сущности. */
    function accumulatePart(
      accumulator: EntityAccumulator,
      part: RolledSpellDamagePart,
      save: SavingThrowResult | undefined,
    ): void {
      const primaryDamageType = part.type ?? context.overrideDamageType;

      // Типы для расчёта защит: несколько (рубящий+огонь) или один
      let damageTypes: string[] | undefined;

      if (part.types && part.types.length > 0) {
        damageTypes = part.types;
      } else if (primaryDamageType) {
        damageTypes = [primaryDamageType];
      }

      if (part.isHealing) {
        // Лечение: `requiresDamage` гейтит его до момента, пока по заклинанию
        // не нанесён урон. Урон-части — НЕ гейтятся (иначе урон-часть с
        // requiresDamage сама себя обнулила бы). Временные ХП (`@heal.temp`)
        // копятся отдельно — они не прибавляются к текущим хитам.
        if (part.healTemp) {
          if (part.requiresDamage) {
            accumulator.tempHealGated += part.amount;
          } else {
            accumulator.tempHealBase += part.amount;
          }
        } else if (part.requiresDamage) {
          accumulator.healGated += part.amount;
        } else {
          accumulator.healBase += part.amount;
        }

        recordContribution(
          part,
          accumulator.entity,
          part.amount,
          'normal',
          part.requiresDamage,
        );

        return;
      }

      const { final, outcome } = computeDamageFinal(
        accumulator.entity,
        part.amount,
        damageTypes,
        save,
      );

      if (outcome !== 'normal') {
        accumulator.defenseOutcome = outcome;
      }

      // Урон применяется всегда (requiresDamage на уроне игнорируется)
      accumulator.damageBase += final;

      recordContribution(part, accumulator.entity, final, outcome, false);
    }

    // 3. selected-части → каждой цели (спасбросок один на цель: авто или
    // ручной по `autoSaves` цели; авто-цели обрабатываются первыми).
    // Гейт-ветки @target.full/@target.notFull фильтруются по фактическому HP
    // КАЖДОЙ цели (per-target): цель получает только ветку своего состояния.
    if (selectedParts.length > 0) {
      const orderedTargets = orderTargetsBySaveMode(
        targetEntities,
        spell.saveType,
      );

      for (const entity of orderedTargets) {
        const applicableParts = selectedParts.filter((part) =>
          partPassesTargetGate(part, entity),
        );

        if (applicableParts.length === 0) {
          continue;
        }

        const accumulator = getAccumulator(entity, true);

        if (spell.saveType !== 'none' && accumulator.save === undefined) {
          accumulator.save = await resolveSavingThrowForTarget(
            entity,
            spell.saveType,
            spellSaveDC,
          );
        }

        for (const part of applicableParts) {
          accumulatePart(accumulator, part, accumulator.save);
        }
      }
    }

    // 3a. choose-части → отдельно выбранной цели.
    // Спасбросок кидаем только если на эту цель идёт урон (лечение спас не требует).
    if (chooseEntity && chooseParts.length > 0) {
      const applicableChooseParts = chooseParts.filter((part) =>
        partPassesTargetGate(part, chooseEntity),
      );

      if (applicableChooseParts.length > 0) {
        const hasDamagePart = applicableChooseParts.some(
          (part) => !part.isHealing,
        );

        const accumulator = getAccumulator(chooseEntity, hasDamagePart);

        if (
          hasDamagePart
          && spell.saveType !== 'none'
          && accumulator.save === undefined
        ) {
          accumulator.save = await resolveSavingThrowForTarget(
            chooseEntity,
            spell.saveType,
            spellSaveDC,
          );
        }

        for (const part of applicableChooseParts) {
          accumulatePart(accumulator, part, accumulator.save);
        }
      }
    }

    // 4. self-части → заклинателю (без спасброска)
    if (caster && selfParts.length > 0) {
      const applicableSelfParts = selfParts.filter((part) =>
        partPassesTargetGate(part, caster),
      );

      if (applicableSelfParts.length > 0) {
        const accumulator = getAccumulator(caster, false);

        for (const part of applicableSelfParts) {
          accumulatePart(accumulator, part, undefined);
        }
      }
    }

    // 4a. Гарантируем аккумулятор цели даже без частей урона (чистый статус):
    // эффекты с effectTarget 'target' должны примениться и без урона. Для
    // save-landing катаем landing-спас, чтобы эффекты без applySave гейтились им.
    const hasTargetEffects = (spell.activeEffects ?? []).some(
      (effect) => !effect.disabled && effect.effectTarget === 'target',
    );

    if (hasTargetEffects) {
      for (const entity of targetEntities) {
        const accumulator = getAccumulator(entity, true);

        if (spell.saveType !== 'none' && accumulator.save === undefined) {
          accumulator.save = await resolveSavingThrowForTarget(
            entity,
            spell.saveType,
            spellSaveDC,
          );
        }
      }
    }

    // 5. Гейт requiresDamage: открыт, если суммарно нанесён негейтнутый урон
    let totalDamageNonGated = 0;

    for (const accumulator of accumulators.values()) {
      totalDamageNonGated += accumulator.damageBase;
    }

    const gateOpen = totalDamageNonGated > 0;

    /**
     * Собирает эффекты-состояния и доп.урон для цели: эффекты носителя с
     * `effectTarget: 'target'` применяются по своему `applySave` (если задан),
     * иначе по факту приземления; доп.урон эффекта катается с множителем спаса.
     *
     * @param entity - цель
     * @param landingSave - результат landing-спасброска цели (если был)
     * @returns эффекты для наложения, доп.урон и сработавшая защита
     */
    async function resolveTargetEffects(
      entity: SceneEntity,
      landingSave: SavingThrowResult | undefined,
    ): Promise<{
      effects: ActiveEffect[];
      bonusDamage: number;
      defenseOutcome: DamageDefenseOutcome;
      damageLines: EffectDamageLine[];
    }> {
      const targetEffects = (spell.activeEffects ?? []).filter(
        (effect) => !effect.disabled && effect.effectTarget === 'target',
      );

      // Приземление: атака/авто (saveType 'none') доходят сюда только попавшими;
      // для landing-спаса «приземлилось» = цель провалила спас.
      const landed = spell.saveType === 'none' || !landingSave?.passed;
      const immunities = getEntityConditionImmunities(entity as DnDSceneEntity);

      const collected: ActiveEffect[] = [];
      const damageLines: EffectDamageLine[] = [];

      let bonusDamage = 0;
      let defenseOutcome: DamageDefenseOutcome = 'normal';

      for (const effect of targetEffects) {
        let applySaveSucceeded: boolean | undefined;

        if (effect.applySave) {
          const saveResult = await resolveSavingThrowForTarget(
            entity,
            effect.applySave.ability,
            effect.applySave.dc,
          );

          applySaveSucceeded = saveResult.passed;
        }

        const application = resolveEffectApplication(effect, {
          landed,
          applySaveSucceeded,
        });

        if (
          effect.damageParts
          && effect.damageParts.length > 0
          && application.damageMultiplier > 0
        ) {
          const rolled = rollEffectDamage(
            entity,
            effect.damageParts,
            application.damageMultiplier,
          );

          bonusDamage += rolled.damage;
          damageLines.push(...rolled.lines);

          if (rolled.outcome !== 'normal') {
            defenseOutcome = rolled.outcome;
          }
        }

        if (!application.applyEffect) {
          continue;
        }

        // Чисто-урон эффекты (без состояния и без модификаторов) не «висят» на
        // цели — они только наносят урон (напр. яд за спасбросок). Но эффект с
        // периодикой (DoT/повторный спас) обязан остаться на цели, чтобы тикать.
        const isPersistent =
          effect.conditionKey !== undefined
          || effect.changes.length > 0
          || effect.flags.length > 0
          || effect.recurringDamage !== undefined
          || effect.recurringSave !== undefined;

        if (!isPersistent) {
          continue;
        }

        const immune =
          effect.conditionKey !== undefined
          && isImmuneToCondition(immunities, effect.conditionKey);

        if (!immune) {
          // Точная turn-длительность инициализируется тут же (носитель = цель,
          // источник = кастер): нужен текущий ход энкаунтера на момент наложения.
          collected.push(
            stampEffectTurnDuration(
              stampRecurringSaveDc(effect, spellSaveDC),
              entity.id,
              context.casterId,
            ),
          );
        }
      }

      return { effects: collected, bonusDamage, defenseOutcome, damageLines };
    }

    // 6. Применяем по сущности ОДНИМ апдейтом
    const results: SpellTargetResult[] = [];

    // Доп.урон наложенных эффектов по цели — для отдельной группы в чате
    const effectDamageByEntity = new Map<string, EffectDamageLine[]>();

    for (const accumulator of accumulators.values()) {
      let totalDamage =
        accumulator.damageBase + (gateOpen ? accumulator.damageGated : 0);

      const totalHeal =
        accumulator.healBase + (gateOpen ? accumulator.healGated : 0);

      const totalTempHeal =
        accumulator.tempHealBase + (gateOpen ? accumulator.tempHealGated : 0);

      let effectsToApply: ActiveEffect[] | undefined;

      if (accumulator.isTarget) {
        const targetResult = await resolveTargetEffects(
          accumulator.entity,
          accumulator.save,
        );

        effectsToApply =
          targetResult.effects.length > 0 ? targetResult.effects : undefined;

        totalDamage += targetResult.bonusDamage;

        if (targetResult.damageLines.length > 0) {
          effectDamageByEntity.set(
            accumulator.entity.id,
            targetResult.damageLines,
          );
        }

        if (targetResult.defenseOutcome !== 'normal') {
          accumulator.defenseOutcome = targetResult.defenseOutcome;
        }
      }

      const { hpBefore, hpAfter, tempHpGained, appliedEffects } =
        writeEntityHpDelta(
          accumulator.entity,
          totalDamage,
          totalHeal,
          totalTempHeal,
          effectsToApply,
          socket,
        );

      results.push({
        actorName: accumulator.entity.name,
        actorId: accumulator.entity.id,
        saveRoll: accumulator.save?.roll,
        saveModifier: accumulator.save?.modifier,
        savePassed: accumulator.save?.passed,
        damageApplied: totalDamage,
        healApplied: totalHeal,
        hpBefore,
        hpAfter,
        tempHpGained,
        defenseOutcome: accumulator.defenseOutcome,
        appliedEffects,
      });
    }

    // 7. Сводка в чат, СГРУППИРОВАННАЯ ПО ТИПУ УРОНА:
    //    строка 1 — чем нанёс (название); далее на каждую часть — заголовок
    //    «тип урона/лечение», под ним строки целей «формула [кубики] = итог».
    //    Тип урона не дублируется у каждой цели; если частей несколько —
    //    сначала первый тип со всеми целями, затем второй и т.д.

    // Наложенные эффекты по цели — показываем один раз (у первой строки цели)
    const effectsByEntity = new Map<string, string[]>();

    for (const result of results) {
      if (result.appliedEffects && result.appliedEffects.length > 0) {
        effectsByEntity.set(result.actorId, result.appliedEffects);
      }
    }

    const messageLines = [spell.name];
    const usedEffectEntities = new Set<string>();

    // Перебираем части В ПОРЯДКЕ заклинания/оружия (пропускаем нулевые —
    // например, не сработавшие условные ветки @target.full/@target.notFull).
    for (const part of parts) {
      if (part.amount <= 0) {
        continue;
      }

      const contributions = partContributions.get(part);
      const header = `${getPartKindLabel(part)}${formatTargetGateSuffix(part.targetGate)}`;

      const diceBreakdown =
        part.values.length > 0 ? `[${part.values.join(', ')}] = ` : '';

      // Целей нет — но кубики брошены: показываем часть «в пустоту»
      if (!contributions || contributions.length === 0) {
        if (results.length === 0) {
          messageLines.push(header);
          messageLines.push(`→ ${part.formula} ${diceBreakdown}${part.amount}`);
        }

        continue;
      }

      // Гейт requiresDamage: лечащие/врем. части скрыты, пока урон не нанесён
      const visibleContributions = contributions.filter(
        (contribution) => !(contribution.requiresGate && !gateOpen),
      );

      if (visibleContributions.length === 0) {
        continue;
      }

      messageLines.push(header);

      const sign = part.isHealing ? '+' : '-';
      const hpSuffix = part.healTemp ? ' врем. HP' : ' HP';

      for (const contribution of visibleContributions) {
        const defenseSuffix = formatDamageDefenseSuffix(contribution.outcome);

        let line = `→ ${contribution.entityName}: ${part.formula} ${diceBreakdown}${sign}${contribution.applied}${hpSuffix}${defenseSuffix}`;

        const effects = effectsByEntity.get(contribution.entityId);

        if (effects && !usedEffectEntities.has(contribution.entityId)) {
          usedEffectEntities.add(contribution.entityId);
          line += ` [${effects.join(', ')}]`;
        }

        messageLines.push(line);
      }
    }

    // Доп.урон от наложенных эффектов — отдельной группой (в HP уже учтён выше).
    for (const result of results) {
      const damageLines = effectDamageByEntity.get(result.actorId);

      if (!damageLines || damageLines.length === 0) {
        continue;
      }

      for (const damageLine of damageLines) {
        const breakdown =
          damageLine.values.length > 0
            ? `[${damageLine.values.join(', ')}] = `
            : '';

        messageLines.push(`${damageLine.typeLabel} (эффект)`);

        messageLines.push(
          `→ ${result.actorName}: ${damageLine.formula} ${breakdown}-${damageLine.applied} HP${formatDamageDefenseSuffix(damageLine.outcome)}`,
        );
      }
    }

    if (results.length === 0) {
      messageLines.push('→ Нет целей');
    }

    chatStore.sendMessage(messageLines.join('\n'), 'text');
  }

  return {
    resolveSpellDamageWithParts,
    writeEntityHpDelta,
    pickChooseTarget,
  };
}
