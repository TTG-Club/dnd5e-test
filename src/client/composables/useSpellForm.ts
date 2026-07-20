import type {
  AbilityType,
  DamagePart,
  DistanceUnit,
  SpellAreaShape,
  SpellCastingTimeUnit,
  SpellDeliveryType,
  SpellDurationUnit,
  SpellSaveType,
  SpellSchool,
  SpellTargetType,
} from '@vtt/shared';
import type {
  ActiveEffect,
  CantripScalingTier,
  ClassKey,
  ProjectileCountTier,
  Spell,
  SpellUsesRecovery,
} from '@vtt/shared/system/dnd.js';

import { generateId } from '@vtt/shared';
import {
  AREA_SHAPE_OPTIONS,
  CASTING_TIME_OPTIONS,
  CLASS_KEY_OPTIONS,
  damagePartIsHealing,
  DELIVERY_TYPE_OPTIONS,
  DURATION_UNIT_OPTIONS,
  getSpellDamageParts,
  PROJECTILE_DISTRIBUTION_OPTIONS,
  SAVE_EFFECT_OPTIONS,
  SAVE_TYPE_OPTIONS,
  SPELL_LEVEL_OPTIONS,
  SPELL_SCHOOL_OPTIONS,
  TARGET_TYPE_OPTIONS,
} from '@vtt/shared/system/dnd.js';
import { computed, ref, watch } from 'vue';

import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

/**
 * Composable для логики формы заклинания.
 *
 * Инкапсулирует все reactive-поля формы, опции и методы сборки Spell.
 *
 * @param getSpell - функция получения текущего заклинания (null = создание)
 * @param getIsOpen - функция получения флага открытости модалки
 */
export function useSpellForm(
  getSpell: () => Spell | null,
  getIsOpen: () => boolean,
) {
  // --- Reactive-поля формы ---
  const name = ref('');
  const nameEn = ref('');
  const level = ref(0);
  const school = ref<SpellSchool>('evocation');

  // Время сотворения
  const castingTimeValue = ref(1);
  const castingTimeUnit = ref<SpellCastingTimeUnit>('action');
  const reactionTrigger = ref('');

  // Компоненты
  const verbal = ref(true);
  const somatic = ref(true);
  const material = ref(false);
  const materialDescription = ref('');
  const materialCost = ref(0);
  const materialConsumed = ref(false);

  // Дистанция
  const range = ref(0);
  const rangeUnit = ref<DistanceUnit>('ft');
  const rangeSpecial = ref('');

  // Длительность
  const durationValue = ref(0);
  const durationUnit = ref<SpellDurationUnit>('instantaneous');
  const concentration = ref(false);
  const ritual = ref(false);

  // Область воздействия
  const hasArea = ref(false);
  const areaShape = ref<SpellAreaShape>('circle');
  const areaSize = ref(20);
  const areaWidth = ref(5);
  const areaHeight = ref(10);
  const areaUnit = ref<DistanceUnit>('ft');
  const areaResizable = ref(false);

  // Цели
  const targetType = ref<SpellTargetType>('creature');
  const targetCount = ref(1);

  // Боевая механика
  const deliveryType = ref<SpellDeliveryType>('none');
  /** Части урона/лечения (источник истины боевой механики) */
  const damageParts = ref<DamagePart[]>([]);
  const autoHit = ref(false);

  /** Добавить пустую часть урона */
  function addDamagePart(): void {
    damageParts.value.push({ formula: '', target: 'selected' });
  }

  /** Удалить часть урона по индексу */
  function removeDamagePart(index: number): void {
    damageParts.value.splice(index, 1);
  }

  const saveType = ref<SpellSaveType>('none');
  const saveEffect = ref<'half' | 'none' | 'special'>('none');
  const attackAbility = ref<AbilityType | ''>('');
  const attackBonus = ref(0);

  // Снаряды (каждый — отдельный бросок урона и атаки, если заклинание атакующее)
  const hasProjectiles = ref(false);
  const projectileCount = ref(3);
  /** Дополнительные снаряды за круг ячейки выше базового (уровневые заклинания) */
  const projectilePerSlotLevel = ref(0);

  /** Распределение снарядов по целям ('any' — свободно, в JSON не пишется) */
  const projectileTargetDistribution = ref<'any' | 'single' | 'distinct'>(
    'any',
  );

  /** Пороги уровня персонажа → число снарядов (заговоры) */
  const projectileTiers = ref<ProjectileCountTier[]>([]);

  /** Добавить порог числа снарядов заговора */
  function addProjectileTier(): void {
    const lastTier = projectileTiers.value[projectileTiers.value.length - 1];

    projectileTiers.value.push({
      level: lastTier ? lastTier.level + 6 : 5,
      count: lastTier ? lastTier.count + 1 : 2,
    });
  }

  /** Удалить порог числа снарядов по индексу */
  function removeProjectileTier(index: number): void {
    projectileTiers.value.splice(index, 1);
  }

  // Масштабирование
  const hasScaling = ref(false);
  const scalingAdditionalDice = ref('');
  const scalingAdditionalTargets = ref(0);
  const scalingDescription = ref('');
  /** Поуровневые тиры масштабирования заговора (полный набор частей на уровень) */
  const cantripScalingTiers = ref<CantripScalingTier[]>([]);

  /** Добавить тир масштабирования (с одной пустой частью) */
  function addCantripTier(): void {
    cantripScalingTiers.value.push({
      level: 5,
      parts: [{ formula: '', target: 'selected' }],
    });
  }

  /** Удалить тир по индексу */
  function removeCantripTier(index: number): void {
    cantripScalingTiers.value.splice(index, 1);
  }

  /** Добавить пустую часть в тир */
  function addCantripTierPart(tierIndex: number): void {
    cantripScalingTiers.value[tierIndex]?.parts.push({
      formula: '',
      target: 'selected',
    });
  }

  /** Удалить часть тира по индексу */
  function removeCantripTierPart(tierIndex: number, partIndex: number): void {
    cantripScalingTiers.value[tierIndex]?.parts.splice(partIndex, 1);
  }

  // Описание
  const description = ref('');
  const higherLevelDescription = ref('');

  // Использование и Мета
  const prepared = ref(false);
  const alwaysPrepared = ref(false);
  // Заряды использования (врождённые/расовые заклинания, заклинания существ)
  const hasUses = ref(false);
  const usesMax = ref(1);
  const usesCurrent = ref(1);
  const usesRecovery = ref<SpellUsesRecovery>('longRest');
  const sourceKey = ref('hb');
  const isSRD = ref(false);
  /** Классы, которым доступно заклинание (видимость в списках по классу) */
  const classKeys = ref<ClassKey[]>([]);

  // Эффекты
  const activeEffects = ref<ActiveEffect[]>([]);

  const systemDataStore = useSystemDataStore();

  // --- Опции из systemDataStore ---
  const damageTypeOptions = computed(() =>
    systemDataStore.damageTypes.map((dt) => ({
      label: dt.name,
      value: dt.key,
    })),
  );

  const sourceOptions = computed(() =>
    systemDataStore.sources.map((src) => ({
      label: `${src.name} (${src.abbreviation})`,
      value: src.key,
    })),
  );

  // --- Заполнение формы при открытии ---
  watch(
    getIsOpen,
    (open) => {
      if (!open) {
        return;
      }

      const spell = getSpell();

      if (spell) {
        name.value = spell.name;
        nameEn.value = spell.nameEn ?? '';
        level.value = spell.level;
        school.value = spell.school;

        castingTimeValue.value = spell.castingTimeValue;
        castingTimeUnit.value = spell.castingTimeUnit;
        reactionTrigger.value = spell.reactionTrigger ?? '';

        verbal.value = spell.components.verbal;
        somatic.value = spell.components.somatic;
        material.value = spell.components.material;
        materialDescription.value = spell.components.materialDescription ?? '';
        materialCost.value = spell.components.materialCost ?? 0;
        materialConsumed.value = spell.components.materialConsumed ?? false;

        range.value = spell.range;
        rangeUnit.value = spell.rangeUnit;
        rangeSpecial.value = spell.rangeSpecial ?? '';

        durationValue.value = spell.durationValue;
        durationUnit.value = spell.durationUnit;
        concentration.value = spell.concentration;
        ritual.value = spell.ritual;

        if (spell.areaOfEffect) {
          hasArea.value = true;
          areaShape.value = spell.areaOfEffect.shape;
          areaSize.value = spell.areaOfEffect.size;
          areaWidth.value = spell.areaOfEffect.width ?? 0;
          areaHeight.value = spell.areaOfEffect.height ?? 0;
          areaUnit.value = spell.areaOfEffect.unit;
          areaResizable.value = spell.areaOfEffect.resizable ?? false;
        } else {
          hasArea.value = false;
        }

        targetType.value = spell.targetType;
        targetCount.value = spell.targetCount ?? 1;

        deliveryType.value = spell.deliveryType;

        // Источник истины — damageParts (вид части — токены @heal/@dmg в
        // формуле). Клонируем, чтобы не мутировать spell.
        damageParts.value = getSpellDamageParts(spell).map((part) => ({
          ...part,
        }));

        autoHit.value = spell.autoHit ?? false;
        saveType.value = spell.saveType;
        saveEffect.value = spell.saveEffect ?? 'none';
        attackAbility.value = spell.attackAbility ?? '';
        attackBonus.value = spell.attackBonus ?? 0;

        // Явный блок снарядов — единственный источник истины снарядности
        // (targetCount — информационное число целей, распределение не включает).
        if (spell.projectiles) {
          hasProjectiles.value = true;
          projectileCount.value = spell.projectiles.count;
          projectilePerSlotLevel.value = spell.projectiles.perSlotLevel ?? 0;

          projectileTargetDistribution.value =
            spell.projectiles.targetDistribution ?? 'any';

          projectileTiers.value = (
            spell.projectiles.countByCharacterLevel ?? []
          ).map((tier) => ({ ...tier }));
        } else {
          hasProjectiles.value = false;
          projectileCount.value = 3;
          projectilePerSlotLevel.value = 0;
          projectileTargetDistribution.value = 'any';
          projectileTiers.value = [];
        }

        if (spell.scaling) {
          hasScaling.value = true;
          scalingAdditionalDice.value = spell.scaling.additionalDice ?? '';
          scalingAdditionalTargets.value = spell.scaling.additionalTargets ?? 0;
          scalingDescription.value = spell.scaling.description ?? '';
        } else {
          hasScaling.value = false;
          scalingAdditionalTargets.value = 0;
        }

        cantripScalingTiers.value = (spell.cantripScalingTiers ?? []).map(
          (tier) => ({
            level: tier.level,
            parts: tier.parts.map((part) => ({ ...part })),
          }),
        );

        description.value = spell.description;
        higherLevelDescription.value = spell.higherLevelDescription ?? '';

        prepared.value = spell.prepared ?? false;
        alwaysPrepared.value = spell.alwaysPrepared ?? false;
        hasUses.value = !!spell.uses;
        usesMax.value = spell.uses?.max ?? 1;
        usesCurrent.value = spell.uses?.current ?? spell.uses?.max ?? 1;
        usesRecovery.value = spell.uses?.recovery ?? 'longRest';
        sourceKey.value = spell.sourceKey ?? 'hb';
        isSRD.value = spell.isSRD ?? false;
        classKeys.value = [...(spell.classKeys ?? [])];

        activeEffects.value = [...(spell.activeEffects ?? [])];
      } else {
        // Дефолты для создания
        name.value = '';
        nameEn.value = '';
        level.value = 0;
        school.value = 'evocation';

        castingTimeValue.value = 1;
        castingTimeUnit.value = 'action';
        reactionTrigger.value = '';

        verbal.value = true;
        somatic.value = true;
        material.value = false;
        materialDescription.value = '';
        materialCost.value = 0;
        materialConsumed.value = false;

        range.value = 0;
        rangeUnit.value = 'ft';
        rangeSpecial.value = '';

        durationValue.value = 0;
        durationUnit.value = 'instantaneous';
        concentration.value = false;
        ritual.value = false;

        hasArea.value = false;
        areaShape.value = 'circle';
        areaSize.value = 20;
        areaWidth.value = 5;
        areaUnit.value = 'ft';

        targetType.value = 'creature';
        targetCount.value = 1;

        deliveryType.value = 'none';
        damageParts.value = [];
        autoHit.value = false;
        saveType.value = 'none';
        saveEffect.value = 'none';
        attackAbility.value = '';
        attackBonus.value = 0;

        hasProjectiles.value = false;
        projectileCount.value = 3;
        projectilePerSlotLevel.value = 0;
        projectileTargetDistribution.value = 'any';
        projectileTiers.value = [];

        hasScaling.value = false;
        scalingAdditionalDice.value = '';
        scalingAdditionalTargets.value = 0;
        scalingDescription.value = '';
        cantripScalingTiers.value = [];

        description.value = '';
        higherLevelDescription.value = '';

        prepared.value = false;
        alwaysPrepared.value = false;
        hasUses.value = false;
        usesMax.value = 1;
        usesCurrent.value = 1;
        usesRecovery.value = 'longRest';
        sourceKey.value = 'hb';
        isSRD.value = false;
        classKeys.value = [];

        activeEffects.value = [];
      }
    },
    { immediate: true },
  );

  // Синхронизация флага наличия области с типом цели "Область"
  watch(targetType, (newType) => {
    hasArea.value = newType === 'area';
  });

  /** Нормализует одну часть урона/лечения к сохранению (trim + сброс пустых полей). */
  function cleanPart(part: DamagePart): DamagePart {
    return {
      formula: part.formula.trim(),
      type: damagePartIsHealing(part) ? undefined : part.type,
      target: part.target ?? 'selected',
      requiresDamage: part.requiresDamage || undefined,
    };
  }

  /**
   * Готовит массив частей урона к сохранению: отбрасывает части без формулы.
   * Возвращает `undefined`, если значимых частей нет.
   */
  function buildDamageParts(): DamagePart[] | undefined {
    const parts = damageParts.value
      .filter((part) => part.formula.trim().length > 0)
      .map(cleanPart);

    return parts.length > 0 ? parts : undefined;
  }

  /**
   * Готовит тиры масштабирования заговора к сохранению: чистит части, отбрасывает
   * пустые тиры, сортирует по уровню. Только для заговоров (level 0).
   * Возвращает `undefined`, если значимых тиров нет.
   */
  function buildCantripTiers(): CantripScalingTier[] | undefined {
    if (level.value !== 0) {
      return undefined;
    }

    const tiers = cantripScalingTiers.value
      .map((tier) => ({
        level: tier.level,
        parts: tier.parts
          .filter((part) => part.formula.trim().length > 0)
          .map(cleanPart),
      }))
      .filter((tier) => tier.parts.length > 0)
      .sort((first, second) => first.level - second.level);

    return tiers.length > 0 ? tiers : undefined;
  }

  /**
   * Готовит блок снарядов к сохранению. Пороги уровня — только у заговоров
   * (сортируются по уровню), добавка за круг — только у уровневых заклинаний.
   * Возвращает `undefined`, если снарядный режим выключен.
   */
  function buildProjectiles(): Spell['projectiles'] {
    if (!hasProjectiles.value) {
      return undefined;
    }

    const tiers =
      level.value === 0
        ? projectileTiers.value
            .filter((tier) => tier.level > 0 && tier.count > 0)
            .map((tier) => ({ ...tier }))
            .sort((tierA, tierB) => tierA.level - tierB.level)
        : [];

    return {
      count: projectileCount.value > 0 ? projectileCount.value : 1,
      perSlotLevel:
        level.value > 0 && projectilePerSlotLevel.value > 0
          ? projectilePerSlotLevel.value
          : undefined,
      countByCharacterLevel: tiers.length > 0 ? tiers : undefined,
      targetDistribution:
        projectileTargetDistribution.value === 'any'
          ? undefined
          : projectileTargetDistribution.value,
    };
  }

  /**
   * Готовит блок масштабирования уровневого заклинания. «Доп. целей за круг»
   * живёт в секции целей и не зависит от галочки «Усиление» (та отвечает за
   * кости и описание); у снарядных заклинаний рост целей задаёт
   * `projectiles.perSlotLevel`, поэтому поле подавляется.
   */
  function buildScaling(): Spell['scaling'] {
    if (level.value === 0) {
      return undefined;
    }

    const additionalTargets =
      !hasProjectiles.value && scalingAdditionalTargets.value > 0
        ? scalingAdditionalTargets.value
        : undefined;

    const additionalDice = hasScaling.value
      ? scalingAdditionalDice.value || undefined
      : undefined;

    const scalingText = hasScaling.value
      ? scalingDescription.value || undefined
      : undefined;

    if (
      additionalDice === undefined
      && additionalTargets === undefined
      && scalingText === undefined
    ) {
      return undefined;
    }

    return {
      additionalDice,
      additionalTargets,
      description: scalingText,
    };
  }

  /**
   * Сборка объекта Spell.
   */
  function buildSpell(): Spell {
    const spell = getSpell();

    const builtDamageParts = buildDamageParts();

    return {
      id: spell?.id ?? generateId('spell'),
      type: 'spell',
      name: name.value,
      nameEn: nameEn.value || undefined,
      level: level.value,
      school: school.value,

      castingTimeValue: castingTimeValue.value,
      castingTimeUnit: castingTimeUnit.value,
      reactionTrigger:
        castingTimeUnit.value === 'reaction'
          ? reactionTrigger.value
          : undefined,

      components: {
        verbal: verbal.value,
        somatic: somatic.value,
        material: material.value,
        materialDescription: material.value
          ? materialDescription.value || undefined
          : undefined,
        materialCost: material.value
          ? materialCost.value || undefined
          : undefined,
        materialConsumed: material.value
          ? materialConsumed.value || undefined
          : undefined,
      },

      range: range.value,
      rangeUnit: rangeUnit.value,
      rangeSpecial: rangeSpecial.value || undefined,

      durationValue: durationValue.value,
      durationUnit: durationUnit.value,
      concentration: concentration.value,
      ritual: ritual.value,

      areaOfEffect: hasArea.value
        ? {
            shape: areaShape.value,
            size: areaSize.value,
            width:
              areaShape.value === 'ray' || areaShape.value === 'rect'
                ? areaWidth.value || undefined
                : undefined,
            height:
              areaShape.value === 'cylinder'
                ? areaHeight.value || undefined
                : undefined,
            unit: areaUnit.value,
            resizable: areaResizable.value,
          }
        : undefined,

      targetType: targetType.value,
      // У снарядных заклинаний число целей определяют сами снаряды и режим
      // распределения — информационный targetCount не пишется
      targetCount:
        !hasProjectiles.value && targetCount.value > 1
          ? targetCount.value
          : undefined,

      deliveryType: deliveryType.value,
      damageParts: builtDamageParts,
      autoHit: autoHit.value ? true : undefined,
      projectiles: buildProjectiles(),
      saveType: saveType.value,
      saveEffect: saveType.value !== 'none' ? saveEffect.value : undefined,
      attackAbility: attackAbility.value || undefined,
      attackBonus: attackBonus.value || undefined,

      scaling: buildScaling(),
      cantripScalingTiers: buildCantripTiers(),

      description: description.value,
      higherLevelDescription: higherLevelDescription.value || undefined,

      uses: hasUses.value
        ? {
            max: usesMax.value,
            current: Math.min(usesCurrent.value, usesMax.value),
            recovery: usesRecovery.value,
          }
        : undefined,

      prepared: prepared.value,
      alwaysPrepared: alwaysPrepared.value,

      sourceKey: sourceKey.value || undefined,
      isSRD: isSRD.value || undefined,

      classKeys: classKeys.value.length > 0 ? classKeys.value : undefined,
      activeEffects: activeEffects.value,
    };
  }

  return {
    name,
    nameEn,
    level,
    school,
    castingTimeValue,
    castingTimeUnit,
    reactionTrigger,
    verbal,
    somatic,
    material,
    materialDescription,
    materialCost,
    materialConsumed,
    range,
    rangeUnit,
    rangeSpecial,
    durationValue,
    durationUnit,
    concentration,
    ritual,
    hasArea,
    areaShape,
    areaSize,
    areaWidth,
    areaHeight,
    areaUnit,
    areaResizable,
    targetType,
    targetCount,
    deliveryType,
    damageParts,
    addDamagePart,
    removeDamagePart,
    autoHit,
    saveType,
    saveEffect,
    attackAbility,
    attackBonus,
    hasProjectiles,
    projectileCount,
    projectilePerSlotLevel,
    projectileTargetDistribution,
    projectileTiers,
    addProjectileTier,
    removeProjectileTier,
    hasScaling,
    scalingAdditionalDice,
    scalingAdditionalTargets,
    scalingDescription,
    cantripScalingTiers,
    addCantripTier,
    removeCantripTier,
    addCantripTierPart,
    removeCantripTierPart,
    description,
    higherLevelDescription,
    prepared,
    alwaysPrepared,
    hasUses,
    usesMax,
    usesCurrent,
    usesRecovery,
    sourceKey,
    isSRD,
    classKeys,
    activeEffects,
    SPELL_SCHOOL_OPTIONS,
    CASTING_TIME_OPTIONS,
    CLASS_KEY_OPTIONS,
    DURATION_UNIT_OPTIONS,
    TARGET_TYPE_OPTIONS,
    AREA_SHAPE_OPTIONS,
    DELIVERY_TYPE_OPTIONS,
    PROJECTILE_DISTRIBUTION_OPTIONS,
    SAVE_TYPE_OPTIONS,
    SAVE_EFFECT_OPTIONS,
    SPELL_LEVEL_OPTIONS,
    damageTypeOptions,
    sourceOptions,

    buildSpell,
  };
}
