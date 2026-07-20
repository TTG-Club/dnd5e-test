import type {
  AbilityType,
  AmmunitionType,
  DamagePart,
  DistanceUnit,
  ItemRarity,
  SpellSaveType,
  WeaponCategory,
  WeaponProficiencyMode,
  WeaponProperty,
  WeaponRangeType,
} from '@vtt/shared';
import type {
  ActiveEffect,
  CurrencyType,
  GameItem,
} from '@vtt/shared/system/dnd.js';

import {
  damagePartIsHealing,
  DEFAULT_CURRENCY,
  isDnDEffect,
  parseCost,
  SAVE_EFFECT_OPTIONS,
  SAVE_TYPE_OPTIONS,
  WEAPON_MASTERIES,
} from '@vtt/shared/system/dnd.js';
import { computed, ref, watch } from 'vue';

import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

/**
 * Значение опции «не выбрано» в селектах базового типа/категории/приёма.
 * Не пустая строка: Nuxt UI `USelect` резервирует `''` под очистку выбора и
 * запрещает её как значение пункта.
 */
const NO_SELECTION = 'none';

/**
 * Composable для логики формы оружия.
 *
 * Инкапсулирует все reactive-поля формы, computed-опции из systemDataStore,
 * методы заполнения формы и сборки GameItem для сохранения.
 *
 * @param getWeapon - функция получения текущего редактируемого оружия (null = создание)
 * @param getIsOpen - функция получения флага открытости модалки
 */
export function useWeaponForm(
  getWeapon: () => GameItem | null,
  getIsOpen: () => boolean,
) {
  // --- Reactive-поля формы ---
  const name = ref('');
  const nameEn = ref('');
  const description = ref('');
  const baseType = ref<string>(NO_SELECTION);
  const weaponCategory = ref<WeaponCategory | typeof NO_SELECTION>('simple');
  const rangeType = ref<WeaponRangeType>('melee');

  const damageParts = ref<DamagePart[]>([
    { formula: '1к6', type: 'slashing', target: 'selected' },
  ]);

  const saveType = ref<SpellSaveType>('none');
  const saveEffect = ref<'half' | 'none' | 'special'>('none');
  const selectedProperties = ref<WeaponProperty[]>([]);
  const weight = ref(0);
  const costValue = ref(0);
  const costCurrency = ref<CurrencyType>(DEFAULT_CURRENCY);
  const reach = ref(5);
  const rangeNormal = ref(0);
  const rangeLong = ref(0);
  const attackAbility = ref<AbilityType>('strength');
  const proficiencyMode = ref<WeaponProficiencyMode>('auto');
  const attackBonus = ref(0);
  const special = ref('');
  const ammunitionType = ref<AmmunitionType | ''>('');
  const mastery = ref<string>(NO_SELECTION);
  const distanceUnit = ref<DistanceUnit>('ft');
  const sourceKey = ref('hb');
  const isSRD = ref(false);
  const magicAttunement = ref<'none' | 'required' | 'optional'>('none');
  const isAttuned = ref(false);
  const magicBonus = ref(0);
  const rarity = ref<ItemRarity>('none');
  const activeEffects = ref<ActiveEffect[]>([]);

  /**
   * Адамантиновое — вычисляемое на основе selectedProperties
   */
  const isAdamantine = computed(() =>
    selectedProperties.value.includes('adamantine'),
  );

  /**
   * Магическое — вычисляемое на основе selectedProperties
   */
  const isMagical = computed(() =>
    selectedProperties.value.includes('magical'),
  );

  const systemDataStore = useSystemDataStore();

  // --- Computed-опции из systemDataStore ---

  /** Опции категории оружия (с пунктом «Не выбрано») */
  const categoryOptions = computed(() => [
    { label: 'Не выбрано', value: NO_SELECTION },
    ...systemDataStore.weaponCategories.map((cat) => ({
      label: cat.name,
      value: cat.key,
    })),
  ]);

  /** Опции типа урона */
  const damageTypeOptions = computed(() =>
    systemDataStore.damageTypes.map((dt) => ({
      label: dt.name,
      value: dt.key,
    })),
  );

  /** Опции свойств оружия */
  const propertyOptions = computed(() =>
    systemDataStore.weaponProperties.map((prop) => ({
      label: prop.name,
      value: prop.key,
      description: prop.description,
    })),
  );

  /** Опции базовых типов оружия (с пунктом «Не выбрано») */
  const baseTypeOptions = computed(() => [
    { label: 'Не выбрано', value: NO_SELECTION },
    ...systemDataStore.weaponBaseTypes.map((bt) => ({
      label: bt.name,
      value: bt.key,
    })),
  ]);

  /** Опции типов боеприпасов */
  const ammunitionTypeOptions = computed(() =>
    systemDataStore.ammunitionTypes.map((at) => ({
      label: at.name,
      value: at.key,
    })),
  );

  /** Опции режима владения */
  const proficiencyModeOptions = [
    { label: 'Автоматически', value: 'auto' as const },
    { label: 'Учитывать', value: 'always' as const },
    { label: 'Не учитывать', value: 'never' as const },
  ];

  /** Опции оружейных приёмов (с пунктом «Без приёма») */
  const masteryOptions = computed(() => [
    { label: 'Без приёма', value: NO_SELECTION, description: '' },
    ...WEAPON_MASTERIES.map((masteryEntry) => ({
      label: `${masteryEntry.name.ru} (${masteryEntry.name.en})`,
      value: masteryEntry.key,
      description: masteryEntry.description.ru,
    })),
  ]);

  /** Опции источников контента */
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

      const weapon = getWeapon();

      if (weapon) {
        name.value = weapon.name;
        nameEn.value = weapon.nameEn ?? '';
        description.value = weapon.description;
        baseType.value = weapon.baseType ?? NO_SELECTION;
        weaponCategory.value = weapon.weaponCategory ?? NO_SELECTION;
        rangeType.value = weapon.rangeType ?? 'melee';

        damageParts.value =
          weapon.damageParts && weapon.damageParts.length > 0
            ? weapon.damageParts.map((part) => ({ ...part }))
            : [{ formula: '1к6', type: 'slashing', target: 'selected' }];

        saveType.value = weapon.saveType ?? 'none';
        saveEffect.value = weapon.saveEffect ?? 'none';
        selectedProperties.value = [...(weapon.weaponProperties ?? [])];
        weight.value = weapon.weight;

        const parsed = parseCost(weapon.cost);

        costValue.value = parsed.value;
        costCurrency.value = parsed.currency;
        reach.value = weapon.reach ?? 5;
        rangeNormal.value = weapon.range?.normal ?? 0;
        rangeLong.value = weapon.range?.long ?? 0;
        attackAbility.value = weapon.attackAbility ?? 'strength';
        proficiencyMode.value = weapon.proficiencyMode ?? 'auto';
        attackBonus.value = weapon.attackBonus ?? 0;
        special.value = weapon.special ?? '';
        ammunitionType.value = weapon.ammunitionType ?? '';
        mastery.value = weapon.mastery ?? NO_SELECTION;
        distanceUnit.value = weapon.distanceUnit ?? 'ft';
        sourceKey.value = weapon.sourceKey ?? 'hb';
        isSRD.value = weapon.isSRD ?? false;
        rarity.value = weapon.rarity ?? 'none';

        // Синхронизируем adamantine/magical в selectedProperties
        if (
          weapon.isAdamantine
          && !selectedProperties.value.includes('adamantine')
        ) {
          selectedProperties.value.push('adamantine');
        }

        if (weapon.isMagical && !selectedProperties.value.includes('magical')) {
          selectedProperties.value.push('magical');
        }

        magicAttunement.value = weapon.magicAttunement ?? 'none';
        isAttuned.value = weapon.isAttuned ?? false;
        magicBonus.value = weapon.magicBonus ?? 0;

        activeEffects.value = [...(weapon.activeEffects ?? [])].filter(
          isDnDEffect,
        );
      } else {
        // Дефолты для создания
        name.value = '';
        nameEn.value = '';
        description.value = '';
        baseType.value = NO_SELECTION;
        weaponCategory.value = 'simple';
        rangeType.value = 'melee';

        damageParts.value = [
          { formula: '1к6', type: 'slashing', target: 'selected' },
        ];

        saveType.value = 'none';
        saveEffect.value = 'none';
        selectedProperties.value = [];
        weight.value = 0;
        costValue.value = 0;
        costCurrency.value = DEFAULT_CURRENCY;
        reach.value = 5;
        rangeNormal.value = 0;
        rangeLong.value = 0;
        attackAbility.value = 'strength';
        proficiencyMode.value = 'auto';
        attackBonus.value = 0;
        special.value = '';
        ammunitionType.value = '';
        mastery.value = NO_SELECTION;
        distanceUnit.value = 'ft';
        sourceKey.value = 'hb';
        isSRD.value = false;
        magicAttunement.value = 'none';
        isAttuned.value = false;
        magicBonus.value = 0;
        rarity.value = 'none';
        activeEffects.value = [];
      }
    },
    { immediate: true },
  );

  // --- Синхронизация range <-> rangeType ---
  watch(rangeType, (newType) => {
    const hasRange = selectedProperties.value.includes('range');

    if (newType === 'ranged' && !hasRange) {
      selectedProperties.value.push('range');
      attackAbility.value = 'dexterity';
    } else if (newType === 'melee' && hasRange) {
      const index = selectedProperties.value.indexOf('range');

      if (index !== -1) {
        selectedProperties.value.splice(index, 1);
      }

      attackAbility.value = 'strength';
    }
  });

  /**
   * Переключает свойство оружия
   * @param prop - свойство для переключения
   */
  function toggleProperty(prop: WeaponProperty): void {
    const index = selectedProperties.value.indexOf(prop);

    if (index === -1) {
      selectedProperties.value.push(prop);

      // При включении range → автоматически переключаем тип боя на дальнобойное
      if (prop === 'range') {
        rangeType.value = 'ranged';
      }

      // При включении reach → увеличиваем досягаемость до 10
      if (prop === 'reach') {
        reach.value = 10;
      }

      // При включении versatile → подставляем альтернативную формулу первой
      // части урона по умолчанию (двуручный хват), если ещё не задана
      if (
        prop === 'versatile'
        && damageParts.value[0]
        && !damageParts.value[0].versatileFormula
      ) {
        damageParts.value[0] = {
          ...damageParts.value[0],
          versatileFormula: damageParts.value[0].formula,
        };
      }
    } else {
      selectedProperties.value.splice(index, 1);

      // При выключении range → автоматически переключаем тип боя на ближний
      if (prop === 'range') {
        rangeType.value = 'melee';
      }

      // При выключении reach → возвращаем досягаемость на 5
      if (prop === 'reach') {
        reach.value = 5;
      }
    }
  }

  /**
   * Собирает части урона оружия из формы: пустые части отбрасываются, тип у
   * лечащих частей не пишется, versatile-формула хранится только на первой
   * части и только при выбранном свойстве versatile.
   *
   * @returns очищенные части урона (или `undefined`, если урон не задан)
   */
  function buildDamageParts(): DamagePart[] | undefined {
    const hasVersatile = selectedProperties.value.includes('versatile');

    const parts = damageParts.value
      .filter((part) => part.formula.trim().length > 0)
      .map((part, index) => {
        const cleaned: DamagePart = {
          formula: part.formula.trim(),
          type: damagePartIsHealing(part) ? undefined : part.type,
          target: part.target ?? 'selected',
          requiresDamage: part.requiresDamage || undefined,
        };

        const versatile = part.versatileFormula?.trim();

        if (hasVersatile && index === 0 && versatile) {
          cleaned.versatileFormula = versatile;
        }

        return cleaned;
      });

    return parts.length > 0 ? parts : undefined;
  }

  /**
   * Собирает объект GameItem из текущих полей формы
   * @returns объект GameItem для отправки на сервер
   */
  function buildWeapon(): GameItem {
    const weapon = getWeapon();

    return {
      id: weapon?.id ?? '',
      name: name.value,
      nameEn: nameEn.value.trim() || undefined,
      description: description.value,
      type: 'weapon',
      quantity: 1,
      weight: weight.value,
      cost:
        costValue.value > 0
          ? { value: costValue.value, currency: costCurrency.value }
          : '',
      rarity: rarity.value,
      equipped: weapon?.equipped ?? false,
      weaponCategory:
        weaponCategory.value !== NO_SELECTION
          ? weaponCategory.value
          : undefined,
      rangeType: rangeType.value,
      baseType: baseType.value !== NO_SELECTION ? baseType.value : undefined,
      reach: reach.value !== 5 ? reach.value : undefined,
      mastery: mastery.value !== NO_SELECTION ? mastery.value : undefined,
      damageParts: buildDamageParts(),
      weaponProperties: selectedProperties.value,
      range:
        rangeNormal.value > 0
          ? { normal: rangeNormal.value, long: rangeLong.value || undefined }
          : undefined,
      saveType: saveType.value !== 'none' ? saveType.value : undefined,
      saveEffect:
        saveType.value !== 'none' && saveEffect.value !== 'none'
          ? saveEffect.value
          : undefined,
      attackAbility: attackAbility.value,
      proficiencyMode: proficiencyMode.value,
      attackBonus: attackBonus.value || undefined,
      special: special.value.trim() || undefined,
      ammunitionType: selectedProperties.value.includes('ammunition')
        ? ammunitionType.value || undefined
        : undefined,
      sourceKey: sourceKey.value || undefined,
      isSRD: isSRD.value || undefined,
      isReadOnly: false,
      distanceUnit:
        distanceUnit.value !== 'ft' ? distanceUnit.value : undefined,
      isAdamantine: isAdamantine.value || undefined,
      isMagical: isMagical.value || undefined,
      magicAttunement:
        isMagical.value && magicAttunement.value !== 'none'
          ? magicAttunement.value
          : undefined,
      isAttuned: isMagical.value && isAttuned.value ? true : undefined,
      magicBonus:
        isMagical.value && magicBonus.value > 0 ? magicBonus.value : undefined,
      activeEffects: activeEffects.value,
    };
  }

  return {
    // Поля формы
    name,
    nameEn,
    description,
    baseType,
    weaponCategory,
    rangeType,
    damageParts,
    saveType,
    saveEffect,
    selectedProperties,
    weight,
    costValue,
    costCurrency,
    reach,
    rangeNormal,
    rangeLong,
    attackAbility,
    proficiencyMode,
    attackBonus,
    special,
    ammunitionType,
    mastery,
    distanceUnit,
    sourceKey,
    isSRD,
    isAdamantine,
    isMagical,
    magicAttunement,
    isAttuned,
    magicBonus,
    rarity,
    activeEffects,

    // Computed опции
    categoryOptions,
    damageTypeOptions,
    propertyOptions,
    baseTypeOptions,
    ammunitionTypeOptions,
    proficiencyModeOptions,
    masteryOptions,
    sourceOptions,
    saveTypeOptions: SAVE_TYPE_OPTIONS,
    saveEffectOptions: SAVE_EFFECT_OPTIONS,

    // Методы
    toggleProperty,
    buildWeapon,
  };
}
