import type {
  ActiveEffect,
  Creature,
  CreatureAction,
  DnDActor,
  DnDSceneEntity,
  EffectTargetKey,
  GameItem,
  ResolvedActorStats,
  RollContext,
  Spell,
} from '@vtt/shared/system/dnd.js';

import type { SpellDamagePartInput } from './useSpellResolution';

/**
 * Композабл бонус-частей урона от Active Effects (оружие и заклинания).
 *
 * Кость-формулы в ключах `damage.melee`/`damage.ranged`/`damage.spell` (напр.
 * «2к6@dmg.fire@target.full») не входят в плоские статы пайплайна — они
 * катаются отдельными частями урона в многочастном пути. Композабл решает,
 * нужно ли броску идти многочастным путём, и собирает части в момент броска
 * (условия преимущества/помехи и HP цели оцениваются по фактическому
 * контексту, выбранному в модалке).
 *
 * Используется тремя точками броска: вкладкой снаряжения листа персонажа,
 * хотбар-макросом `weapon-attack` и обоими путями каста заклинаний.
 */
import { isActorEntity, isCreatureEntity } from '@vtt/shared';
import {
  buildFormulaContext,
  calculateWeaponDamageModifier,
  collectBonusDamageFormulas,
  describeDamagePart,
  getCreatureSpellMod,
  getWeaponDamageParts,
  getWeaponPrimaryDamageType,
  hasBonusDamageFormulas,
  isDnDEffect,
  resolveBonusDamageParts,
  resolveCreatureDamageParts,
  resolveCreatureSpellDamageParts,
  resolveDamagePartsForCast,
  resolveSpellDamageFormula,
  substituteFormulaVariables,
} from '@vtt/shared/system/dnd.js';

import { useTargetStore } from '@/stores/targetStore';

/** Контекст броска из модалки (фактический режим преимущества/помехи) */
interface ModalRollContext {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
}

/** Roll-time сборщик бонус-частей (проп DiceRollModal) */
type BonusPartsEvaluator = (
  context: ModalRollContext,
) => SpellDamagePartInput[];

/** Параметры сборки многочастного броска оружия */
interface WeaponRollSetupOptions {
  /** Оружие */
  weapon: GameItem;
  /** Актор-владелец (для @-переменных в формулах урона и бонусов) */
  actor: DnDActor;
  /** Активные эффекты владельца (включая ауры) */
  effects: readonly ActiveEffect[];
  /** Итоговые статы (для @mod.* и статического урона с учётом эффектов) */
  resolvedStats?: ResolvedActorStats;
  /**
   * Полнота HP выбранной цели для токенов `@target.full`/`@target.notFull`.
   * `undefined` (нет цели) — части раскладываются на per-target гейт-ветки.
   */
  targetIsFull?: boolean;
}

/** Результат сборки многочастного броска оружия */
interface WeaponRollSetup {
  /** Базовая часть урона оружия (формула + тип) */
  baseParts: SpellDamagePartInput[];
  /** Roll-time сборщик бонус-частей от эффектов (для DiceRollModal) */
  evaluateBonusDamageParts: BonusPartsEvaluator;
  /**
   * Псевдо-заклинание для оркестратора `resolveSpellDamageWithParts`:
   * без спасброска и эффектов, имя — для подписи в чате. Позволяет
   * переиспользовать многочастный движок применения (защиты по типу на
   * каждую часть, per-target гейты, единый HP-апдейт) без отдельного
   * оружейного оркестратора.
   */
  pseudoSpell: Spell;
}

/** Параметры сборки многочастного броска действия существа */
interface CreatureRollSetupOptions {
  /** Действие существа (с damageParts/saveType/areaOfEffect) */
  action: CreatureAction;
  /** Существо-источник (для casterId, эффектов и @-переменных в формулах) */
  creature: Creature;
  /** Активные эффекты существа (включая ауры) */
  effects: readonly ActiveEffect[];
  /**
   * Полнота HP выбранной цели для токенов `@target.full`/`@target.notFull`.
   * `undefined` (нет цели / AoE) — части раскладываются на per-target гейт-ветки.
   */
  targetIsFull?: boolean;
}

/** Результат сборки многочастного броска действия существа */
interface CreatureRollSetup {
  /** Базовые части урона действия (формулы существа, без инъекции модификатора) */
  baseParts: SpellDamagePartInput[];
  /** Roll-time сборщик бонус-частей от эффектов (для DiceRollModal) */
  evaluateBonusDamageParts: BonusPartsEvaluator;
  /** Псевдо-заклинание для оркестратора (saveType/saveEffect/areaOfEffect действия) */
  pseudoSpell: Spell;
}

/** Параметры сборки многочастного броска заклинания существа */
interface CreatureSpellRollSetupOptions {
  /** Заклинание существа (готовый «псевдо-спелл»: damageParts/saveType/areaOfEffect) */
  spell: Spell;
  /** Существо-заклинатель (для casterId, эффектов и @mod.spell в формулах) */
  creature: Creature;
  /** Активные эффекты существа (включая ауры) */
  effects: readonly ActiveEffect[];
  /**
   * Полнота HP выбранной цели для токенов `@target.full`/`@target.notFull`.
   * `undefined` (нет цели / AoE) — части раскладываются на per-target гейт-ветки.
   */
  targetIsFull?: boolean;
}

/** Параметры сборщика бонус-частей урона заклинания */
interface SpellBonusEvaluatorOptions {
  /** Заклинание */
  spell: Spell;
  /** Актор-заклинатель */
  actor: DnDActor;
  /** Активные эффекты заклинателя (включая ауры) */
  effects: readonly ActiveEffect[];
  /** Итоговые статы (для @mod.* с учётом эффектов) */
  resolvedStats?: ResolvedActorStats;
  /**
   * Каст без единой цели (AoE-шаблон или распределение снарядов): условия
   * `target.hp.*` в поле condition откладываются в per-target гейт, а токены
   * `@target.*` в формуле раскладываются на гейт-ветки — оркестратор фильтрует
   * их по HP каждой цели в момент применения.
   */
  multiTarget: boolean;
}

/**
 * Ключ бонусов урона по типу оружия.
 *
 * @param weapon - оружие
 * @returns `damage.ranged` для дальнобойного, иначе `damage.melee`
 */
function weaponDamageKey(weapon: GameItem): EffectTargetKey {
  return weapon.rangeType === 'ranged' ? 'damage.ranged' : 'damage.melee';
}

/**
 * Есть ли у владельца кость-формулы бонус-урона для этого оружия.
 * Определяет, идёт ли бросок многочастным путём (иначе — прежний
 * одноформульный, нулевое изменение поведения).
 *
 * @param weapon - оружие
 * @param effects - активные эффекты владельца
 * @returns true если бросок должен идти многочастным путём
 */
export function hasWeaponBonusDamage(
  weapon: GameItem,
  effects: readonly ActiveEffect[],
): boolean {
  return hasBonusDamageFormulas(effects, weaponDamageKey(weapon));
}

/**
 * Есть ли у заклинателя кость-формулы бонус-урона заклинаний.
 *
 * @param effects - активные эффекты заклинателя
 * @returns true если каст должен идти многочастным путём
 */
export function hasSpellBonusDamage(effects: readonly ActiveEffect[]): boolean {
  return hasBonusDamageFormulas(effects, 'damage.spell');
}

/**
 * Композабл бонус-частей урона от Active Effects.
 */
export function useBonusDamageParts() {
  const targetStore = useTargetStore();

  /**
   * HP текущей цели для условий `target.hp.*` (читается в момент вызова).
   *
   * @returns текущее/максимальное HP цели или undefined (цели/HP нет)
   */
  function buildTargetHpContext():
    | { currentHp: number; maxHp: number }
    | undefined {
    const entity = targetStore.getTargetActor();

    if (!entity) {
      return undefined;
    }

    let hp: { current?: number; max?: number } | undefined;

    // Ядро видит entity как Base*; в D&D-композабле восстанавливаем D&D-форму.
    const dnd = entity as DnDSceneEntity;

    if (isActorEntity(dnd)) {
      hp = dnd.system.hitPoints;
    } else if (isCreatureEntity(dnd)) {
      hp = dnd.system.hitPoints;
    }

    if (!hp || hp.max === undefined) {
      return undefined;
    }

    return { currentHp: hp.current ?? 0, maxHp: hp.max };
  }

  /**
   * Собирает бонус-части по контексту броска: условия change оцениваются по
   * фактическому режиму и HP цели, формулы раскладываются на гейт-ветки и
   * типизированные сегменты.
   *
   * Без единой цели (`useTargetState: false` — AoE/снаряды) условия
   * `target.hp.*` и токены `@target.*` не гасятся, а откладываются в
   * per-target гейты (`targetGate`) — их оценивает оркестратор по HP
   * каждой цели в момент применения.
   *
   * @param effects - активные эффекты
   * @param damageKey - ключ урона (damage.melee/ranged/spell)
   * @param modalContext - режим броска из модалки
   * @param defaultType - тип урона сегментов без токена @dmg
   * @param useTargetState - оценивать ли состояние единой цели (false для AoE/снарядов)
   * @param resolveFormula - резолвер @-переменных сегмента
   * @returns бонус-части урона
   */
  function collectParts(
    effects: readonly ActiveEffect[],
    damageKey: EffectTargetKey,
    modalContext: ModalRollContext,
    defaultType: string | undefined,
    useTargetState: boolean,
    resolveFormula: (subFormula: string) => string,
  ): SpellDamagePartInput[] {
    const targetHp = useTargetState ? buildTargetHpContext() : undefined;

    const rollContext: RollContext = {
      hasAdvantage: modalContext.hasAdvantage,
      hasDisadvantage: modalContext.hasDisadvantage,
      target: targetHp,
    };

    const formulas = collectBonusDamageFormulas(
      effects,
      damageKey,
      rollContext,
    );

    const targetIsFull = targetHp
      ? targetHp.currentHp >= targetHp.maxHp
      : undefined;

    return resolveBonusDamageParts(
      formulas,
      defaultType,
      targetIsFull,
      resolveFormula,
    );
  }

  /**
   * Собирает данные многочастного броска оружия: базовую часть, roll-time
   * сборщик бонус-частей и псевдо-заклинание для оркестратора.
   *
   * @param options - оружие, актор, эффекты и базовая формула урона
   * @returns данные для DiceRollModal и resolveSpellDamageWithParts
   */
  function buildWeaponRollSetup(
    options: WeaponRollSetupOptions,
  ): WeaponRollSetup {
    const { weapon, actor, effects, resolvedStats, targetIsFull } = options;

    const damageKey = weaponDamageKey(weapon);
    const defaultType = getWeaponPrimaryDamageType(weapon);

    const pseudoSpell: Spell = {
      id: `weapon-roll-${weapon.id}`,
      name: weapon.name,
      level: 0,
      school: 'evocation',
      castingTimeValue: 1,
      castingTimeUnit: 'action',
      components: { verbal: false, somatic: false, material: false },
      range: 0,
      rangeUnit: 'ft',
      durationValue: 0,
      durationUnit: 'instantaneous',
      concentration: false,
      ritual: false,
      targetType: 'creature',
      deliveryType: weapon.rangeType === 'ranged' ? 'ranged' : 'melee',
      saveType: weapon.saveType ?? 'none',
      saveEffect: weapon.saveEffect,
      // Эффекты оружия (статус/доп.урон со своим applySave) обрабатывает
      // оркестратор per-target — тем же путём, что и у заклинаний/существ.
      activeEffects: weapon.activeEffects?.filter(isDnDEffect),
      description: '',
    };

    // Базовые части урона оружия через тот же резолвер, что и заклинания
    // (versatile-хват применён в getWeaponDamageParts; @-переменные, @dmg/@heal/
    // @target-токены и per-target гейты разворачиваются внутри).
    const baseParts: SpellDamagePartInput[] = resolveDamagePartsForCast(
      pseudoSpell,
      actor,
      getWeaponDamageParts(weapon),
      resolvedStats,
      targetIsFull,
    );

    // Статический урон оружия (мод. характеристики + магический бонус + плоские
    // бонусы эффектов) вливается в первую урон-часть — как и прежде у одиночной
    // формулы; ability-мод не дублируется на дополнительные части урона.
    const flatDamageMod =
      (weapon.isMagical && weapon.magicBonus ? weapon.magicBonus : 0)
      + calculateWeaponDamageModifier(actor, weapon, resolvedStats);

    if (flatDamageMod !== 0) {
      const firstDamageIndex = baseParts.findIndex((part) => !part.isHealing);

      if (firstDamageIndex !== -1) {
        const sign = flatDamageMod > 0 ? '+' : '';

        baseParts[firstDamageIndex] = {
          ...baseParts[firstDamageIndex],
          formula: `${baseParts[firstDamageIndex].formula}${sign}${flatDamageMod}`,
        };
      }
    }

    const formulaContext = buildFormulaContext(actor);

    /**
     * Разрешает @-переменные сегмента бонус-формулы (напр. @mod.str).
     * Невалидная формула не валит бросок — сегмент пропускается с warn
     * (@mod.spell у оружия недоступен: нет контекста заклинания).
     *
     * @param subFormula - сегмент формулы бонус-урона
     * @returns формула для роллера или пустая строка (пропуск сегмента)
     */
    function resolveFormula(subFormula: string): string {
      if (!subFormula.includes('@')) {
        return subFormula;
      }

      try {
        return substituteFormulaVariables(subFormula, formulaContext);
      } catch (error) {
        console.warn(
          '[BonusDamageParts] Невалидная формула бонус-урона оружия:',
          subFormula,
          error,
        );

        return '';
      }
    }

    const evaluateBonusDamageParts: BonusPartsEvaluator = (modalContext) =>
      collectParts(
        effects,
        damageKey,
        modalContext,
        defaultType,
        true,
        resolveFormula,
      );

    return { baseParts, evaluateBonusDamageParts, pseudoSpell };
  }

  /**
   * Собирает roll-time сборщик бонус-частей урона заклинания
   * (ключ `damage.spell`) для передачи в DiceRollModal.
   *
   * @param options - заклинание, актор, эффекты, статы и признак мультицели
   * @returns сборщик бонус-частей для DiceRollModal
   */
  function buildSpellBonusEvaluator(
    options: SpellBonusEvaluatorOptions,
  ): BonusPartsEvaluator {
    const { spell, actor, effects, resolvedStats, multiTarget } = options;

    /**
     * Разрешает @-переменные сегмента через спелл-резолвер (@mod.spell и т.д.).
     * Невалидная формула не валит каст — сегмент пропускается с warn.
     *
     * @param subFormula - сегмент формулы бонус-урона
     * @returns формула для роллера или пустая строка (пропуск сегмента)
     */
    function resolveFormula(subFormula: string): string {
      try {
        return resolveSpellDamageFormula(
          spell,
          actor,
          subFormula,
          resolvedStats,
        );
      } catch (error) {
        console.warn(
          '[BonusDamageParts] Невалидная формула бонус-урона заклинания:',
          subFormula,
          error,
        );

        return '';
      }
    }

    return (modalContext) =>
      collectParts(
        effects,
        'damage.spell',
        modalContext,
        undefined,
        !multiTarget,
        resolveFormula,
      );
  }

  /**
   * Собирает данные многочастного броска ДЕЙСТВИЯ СУЩЕСТВА: базовые части
   * (плоские формулы существа), roll-time сборщик бонус-частей от эффектов и
   * псевдо-заклинание для оркестратора.
   *
   * Отличие от оружия: модификатор НЕ вливается автоматически (у существ он уже
   * вшит в формулу, напр. «1к8 + 3»), бонус атаки и DC спасброска плоские.
   * Псевдо-заклинание несёт `saveType`/`saveEffect`/`areaOfEffect` действия —
   * оркестратор кидает спасброски целей (одиночная цель или AoE-шаблон) штатно.
   *
   * @param options - действие, существо-источник, эффекты и состояние цели
   * @returns данные для DiceRollModal и resolveSpellDamageWithParts
   */
  function buildCreatureRollSetup(
    options: CreatureRollSetupOptions,
  ): CreatureRollSetup {
    const { action, creature, effects, targetIsFull } = options;

    const damageKey: EffectTargetKey =
      action.rangeType === 'ranged' ? 'damage.ranged' : 'damage.melee';

    const baseDamageParts = action.damageParts ?? [];

    const defaultType = baseDamageParts[0]
      ? describeDamagePart(baseDamageParts[0]).types[0]
      : undefined;

    const pseudoSpell: Spell = {
      id: `creature-action-${creature.id}-${action.name}`,
      name: action.name,
      level: 0,
      school: 'evocation',
      castingTimeValue: 1,
      castingTimeUnit: 'action',
      components: { verbal: false, somatic: false, material: false },
      range: 0,
      rangeUnit: 'ft',
      durationValue: 0,
      durationUnit: 'instantaneous',
      concentration: false,
      ritual: false,
      targetType: action.areaOfEffect ? 'area' : 'creature',
      deliveryType: action.rangeType === 'ranged' ? 'ranged' : 'melee',
      saveType: action.saveType ?? 'none',
      saveEffect: action.saveEffect,
      areaOfEffect: action.areaOfEffect,
      // Эффекты действия (статус/доп.урон со своим applySave) обрабатывает
      // оркестратор per-target — тем же путём, что и у заклинаний/оружия.
      activeEffects: action.activeEffects,
      description: '',
    };

    // Базовые части через тот же движок сегментации (@dmg/@heal/@target),
    // что и заклинания/оружие — без инъекции модификатора характеристики.
    const baseParts: SpellDamagePartInput[] = resolveCreatureDamageParts(
      baseDamageParts,
      targetIsFull,
      creature,
    );

    const formulaContext = buildFormulaContext(creature);

    /**
     * Разрешает @-переменные сегмента бонус-формулы эффекта существа.
     * Невалидный токен (нет контекста заклинания) не валит бросок — сегмент
     * пропускается с warn.
     *
     * @param subFormula - сегмент формулы бонус-урона
     * @returns формула для роллера или пустая строка (пропуск сегмента)
     */
    function resolveFormula(subFormula: string): string {
      if (!subFormula.includes('@')) {
        return subFormula;
      }

      try {
        return substituteFormulaVariables(subFormula, formulaContext);
      } catch (error) {
        console.warn(
          '[BonusDamageParts] Невалидная формула бонус-урона существа:',
          subFormula,
          error,
        );

        return '';
      }
    }

    const evaluateBonusDamageParts: BonusPartsEvaluator = (modalContext) =>
      collectParts(
        effects,
        damageKey,
        modalContext,
        defaultType,
        true,
        resolveFormula,
      );

    return { baseParts, evaluateBonusDamageParts, pseudoSpell };
  }

  /**
   * Собирает данные многочастного броска ЗАКЛИНАНИЯ СУЩЕСТВА. В отличие от
   * действий, источник — настоящее заклинание (его `saveType`/`saveEffect`/
   * `areaOfEffect`/`deliveryType` используются напрямую), а токен `@mod.spell`
   * в формулах подставляется из заклинательной характеристики существа.
   * DC спасброска и бонус атаки — плоские из `creature.system.spellcasting`.
   *
   * @param options - заклинание, существо-источник, эффекты и состояние цели
   * @returns данные для DiceRollModal и resolveSpellDamageWithParts
   */
  function buildCreatureSpellRollSetup(
    options: CreatureSpellRollSetupOptions,
  ): CreatureRollSetup {
    const { spell, creature, effects, targetIsFull } = options;

    const baseDamageParts = spell.damageParts ?? [];

    const defaultType = baseDamageParts[0]
      ? describeDamagePart(baseDamageParts[0]).types[0]
      : undefined;

    // Клон заклинания как псевдо-спелл: позволяет выставить activeEffects для
    // save/area-пути, не мутируя сохранённое заклинание существа.
    const pseudoSpell: Spell = { ...spell };

    const spellMod = getCreatureSpellMod(creature);

    const baseParts: SpellDamagePartInput[] = resolveCreatureSpellDamageParts(
      baseDamageParts,
      targetIsFull,
      creature,
      spellMod,
    );

    const formulaContext = buildFormulaContext(creature);

    /**
     * Разрешает @-переменные сегмента бонус-формулы эффекта существа.
     *
     * @param subFormula - сегмент формулы бонус-урона
     * @returns формула для роллера или пустая строка (пропуск сегмента)
     */
    function resolveFormula(subFormula: string): string {
      if (!subFormula.includes('@')) {
        return subFormula;
      }

      try {
        return substituteFormulaVariables(subFormula, {
          ...formulaContext,
          spellMod,
        });
      } catch (error) {
        console.warn(
          '[BonusDamageParts] Невалидная формула бонус-урона существа:',
          subFormula,
          error,
        );

        return '';
      }
    }

    const evaluateBonusDamageParts: BonusPartsEvaluator = (modalContext) =>
      collectParts(
        effects,
        'damage.spell',
        modalContext,
        defaultType,
        true,
        resolveFormula,
      );

    return { baseParts, evaluateBonusDamageParts, pseudoSpell };
  }

  return {
    hasWeaponBonusDamage,
    hasSpellBonusDamage,
    buildWeaponRollSetup,
    buildCreatureRollSetup,
    buildCreatureSpellRollSetup,
    buildSpellBonusEvaluator,
    buildTargetHpContext,
  };
}
