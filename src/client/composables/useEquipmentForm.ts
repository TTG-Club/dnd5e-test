import type {
  EquipmentCategory,
  EquipmentCategoryDefinition,
  ItemRarity,
} from '@vtt/shared';
import type {
  ActiveEffect,
  CurrencyType,
  GameItem,
} from '@vtt/shared/system/dnd.js';

import {
  DEFAULT_CURRENCY,
  isDnDEffect,
  parseCost,
} from '@vtt/shared/system/dnd.js';
import { computed, ref, watch } from 'vue';

import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

/**
 * Composable для логики формы доспеха.
 *
 * Инкапсулирует все reactive-поля формы, computed-опции из systemDataStore,
 * методы заполнения формы и сборки GameItem для сохранения.
 *
 * @param getArmor - функция получения текущего редактируемого доспеха (null = создание)
 * @param getIsOpen - функция получения флага открытости модалки
 */
export function useEquipmentForm(
  getArmor: () => GameItem | null,
  getIsOpen: () => boolean,
) {
  // --- Reactive-поля формы ---
  const name = ref('');
  const nameEn = ref('');
  const description = ref('');
  const baseType = ref('');
  const equipmentCategory = ref<EquipmentCategory>('light');
  const baseArmorAC = ref(10);
  const maxDexBonus = ref<number | null>(null);
  const selectedEquipmentProperties = ref<string[]>([]);
  const strengthRequirement = ref(0);
  const weight = ref(0);
  const costValue = ref(0);
  const costCurrency = ref<CurrencyType>(DEFAULT_CURRENCY);
  const sourceKey = ref('hb');
  const isSRD = ref(false);
  const magicAttunement = ref<'none' | 'required' | 'optional'>('none');
  const isAttuned = ref(false);
  const magicBonus = ref(0);
  const rarity = ref<ItemRarity>('none');
  const activeEffects = ref<ActiveEffect[]>([]);

  /**
   * Помеха скрытности — вычисляемое на основе selectedEquipmentProperties
   */
  const stealthDisadvantage = computed(() =>
    selectedEquipmentProperties.value.includes('stealth-disadvantage'),
  );

  /**
   * Адамантиновое — вычисляемое на основе selectedEquipmentProperties
   */
  const isAdamantine = computed(() =>
    selectedEquipmentProperties.value.includes('adamantine'),
  );

  /**
   * Магическое — вычисляемое на основе selectedEquipmentProperties
   */
  const isMagical = computed(() =>
    selectedEquipmentProperties.value.includes('magical'),
  );

  /**
   * Фокусирующее — вычисляемое на основе selectedEquipmentProperties
   */
  const isFocus = computed(() =>
    selectedEquipmentProperties.value.includes('focus'),
  );

  const systemDataStore = useSystemDataStore();

  // --- Computed-опции из systemDataStore ---

  /** Категории, скрытые из выбора */
  const HIDDEN_CATEGORIES = new Set(['vehicle-equipment']);

  /** Опции типа экипировки (с группировкой «Броня») */
  const categoryOptions = computed(() => {
    const categories = systemDataStore.armorCategories.filter(
      (cat: EquipmentCategoryDefinition) => !HIDDEN_CATEGORIES.has(cat.key),
    );

    const nonArmor = categories.filter(
      (cat: EquipmentCategoryDefinition) => !cat.isArmor,
    );

    const armor = categories.filter(
      (cat: EquipmentCategoryDefinition) => cat.isArmor,
    );

    const items: Array<{ label: string; value?: string; type?: string }> = [];

    for (const cat of nonArmor) {
      items.push({ label: cat.name, value: cat.key });
    }

    if (armor.length > 0) {
      items.push({ label: '', type: 'separator' });
      items.push({ label: 'Снаряжение', type: 'label' });

      for (const cat of armor) {
        items.push({ label: cat.name, value: cat.key });
      }
    }

    return items;
  });

  /** Опции базовых типов доспеха */
  const baseTypeOptions = computed(() =>
    systemDataStore.armorBaseTypes.map((bt) => ({
      label: bt.name,
      value: bt.key,
    })),
  );

  /** Опции источников контента */
  const sourceOptions = computed(() =>
    systemDataStore.sources.map((src) => ({
      label: `${src.name} (${src.abbreviation})`,
      value: src.key,
    })),
  );

  /** Опции свойств экипировки */
  const equipmentPropertyOptions = computed(() =>
    systemDataStore.equipmentProperties.map((prop) => ({
      label: prop.name,
      value: prop.key,
      description: prop.description,
    })),
  );

  /**
   * Является ли выбранная категория щитом
   */
  const isShield = computed(() => equipmentCategory.value === 'shield');

  /** Категории, являющиеся настоящей бронёй */
  const ARMOR_KEYS = new Set(['light', 'medium', 'heavy', 'shield']);

  /**
   * Является ли выбранная категория настоящей бронёй (с КД, владением и т.д.)
   */
  const isActualArmor = computed(() => ARMOR_KEYS.has(equipmentCategory.value));

  /**
   * Удаляет свойство из массива selectedEquipmentProperties
   * @param prop - ключ свойства
   */
  function removeEquipmentProperty(prop: string): void {
    const index = selectedEquipmentProperties.value.indexOf(prop);

    if (index !== -1) {
      selectedEquipmentProperties.value.splice(index, 1);
    }
  }

  /**
   * Переключает свойство экипировки (добавляет/убирает из массива)
   * @param prop - ключ свойства
   */
  function toggleEquipmentProperty(prop: string): void {
    const index = selectedEquipmentProperties.value.indexOf(prop);

    if (index === -1) {
      selectedEquipmentProperties.value.push(prop);
    } else {
      selectedEquipmentProperties.value.splice(index, 1);
    }
  }

  // --- Автоматическая синхронизация при смене категории ---
  watch(equipmentCategory, (newCategory) => {
    if (!ARMOR_KEYS.has(newCategory)) {
      // Не-бронный тип: сбрасываем защитные поля
      baseArmorAC.value = 0;
      maxDexBonus.value = null;
      strengthRequirement.value = 0;
      baseType.value = '';

      // Убираем stealth-disadvantage из свойств
      removeEquipmentProperty('stealth-disadvantage');
    } else if (newCategory === 'shield') {
      // Щит: базовый КД +2, нет бонуса Ловкости, без требования Силы
      baseArmorAC.value = 2;
      maxDexBonus.value = null;
      strengthRequirement.value = 0;
      removeEquipmentProperty('stealth-disadvantage');
    } else if (newCategory === 'light') {
      // Лёгкая: неограниченный бонус Ловкости
      maxDexBonus.value = null;
      strengthRequirement.value = 0;
      removeEquipmentProperty('stealth-disadvantage');
    } else if (newCategory === 'medium') {
      // Средняя: максимальный бонус Ловкости +2
      maxDexBonus.value = 2;
    } else if (newCategory === 'heavy') {
      // Тяжёлая: нет бонуса Ловкости
      maxDexBonus.value = 0;
    }
  });

  // --- Заполнение формы при открытии ---
  watch(
    getIsOpen,
    (open) => {
      if (!open) {
        return;
      }

      const armor = getArmor();

      if (armor) {
        name.value = armor.name;
        nameEn.value = armor.nameEn ?? '';
        description.value = armor.description;
        baseType.value = armor.baseType ?? '';

        equipmentCategory.value = armor.equipmentCategory ?? 'light';

        baseArmorAC.value = armor.baseArmorAC ?? 10;
        maxDexBonus.value = armor.maxDexBonus ?? null;
        strengthRequirement.value = armor.strengthRequirement ?? 0;
        weight.value = armor.weight;

        const parsed = parseCost(armor.cost);

        costValue.value = parsed.value;
        costCurrency.value = parsed.currency;
        sourceKey.value = armor.sourceKey ?? 'hb';
        isSRD.value = armor.isSRD ?? false;

        // Синхронизируем свойства в selectedEquipmentProperties
        const props: string[] = [];

        if (armor.stealthDisadvantage) {
          props.push('stealth-disadvantage');
        }

        if (armor.isAdamantine) {
          props.push('adamantine');
        }

        if (armor.isMagical) {
          props.push('magical');
        }

        if (armor.isFocus) {
          props.push('focus');
        }

        selectedEquipmentProperties.value = props;

        magicAttunement.value = armor.magicAttunement ?? 'none';
        isAttuned.value = armor.isAttuned ?? false;
        magicBonus.value = armor.magicBonus ?? 0;
        rarity.value = armor.rarity ?? 'none';

        activeEffects.value = [...(armor.activeEffects || [])].filter(
          isDnDEffect,
        );
      } else {
        // Дефолты для создания
        name.value = '';
        nameEn.value = '';
        description.value = '';
        baseType.value = '';
        equipmentCategory.value = 'light';
        baseArmorAC.value = 11;
        maxDexBonus.value = null;
        strengthRequirement.value = 0;
        weight.value = 0;
        costValue.value = 0;
        costCurrency.value = DEFAULT_CURRENCY;
        sourceKey.value = 'hb';
        isSRD.value = false;
        selectedEquipmentProperties.value = [];
        magicAttunement.value = 'none';
        isAttuned.value = false;
        magicBonus.value = 0;
        rarity.value = 'none';
        activeEffects.value = [];
      }
    },
    { immediate: true },
  );

  /**
   * Собирает объект GameItem из текущих полей формы
   * @returns объект GameItem для отправки на сервер
   */
  function buildArmor(): GameItem {
    const armor = getArmor();

    return {
      id: armor?.id ?? '',
      name: name.value,
      nameEn: nameEn.value.trim() || undefined,
      description: description.value,
      type: 'equipment',
      quantity: 1,
      weight: weight.value,
      cost:
        costValue.value > 0
          ? { value: costValue.value, currency: costCurrency.value }
          : '',
      rarity: rarity.value,
      equipped: armor?.equipped ?? false,
      baseType: baseType.value || undefined,
      equipmentCategory: equipmentCategory.value,
      baseArmorAC: baseArmorAC.value,
      maxDexBonus: maxDexBonus.value,
      stealthDisadvantage: stealthDisadvantage.value,
      strengthRequirement:
        strengthRequirement.value > 0 ? strengthRequirement.value : undefined,
      sourceKey: sourceKey.value || undefined,
      isSRD: isSRD.value || undefined,
      isReadOnly: false,
      isAdamantine: isAdamantine.value || undefined,
      isMagical: isMagical.value || undefined,
      isFocus: isFocus.value || undefined,
      magicAttunement:
        isMagical.value && magicAttunement.value !== 'none'
          ? magicAttunement.value
          : undefined,
      isAttuned: isMagical.value && isAttuned.value ? true : undefined,
      magicBonus:
        isMagical.value && magicBonus.value > 0 ? magicBonus.value : undefined,
      activeEffects:
        activeEffects.value.length > 0 ? activeEffects.value : undefined,
    };
  }

  return {
    // Поля формы
    name,
    nameEn,
    description,
    baseType,
    equipmentCategory,
    baseArmorAC,
    maxDexBonus,
    stealthDisadvantage,
    strengthRequirement,
    weight,
    costValue,
    costCurrency,
    sourceKey,
    isSRD,
    isAdamantine,
    isMagical,
    isFocus,
    magicAttunement,
    isAttuned,
    magicBonus,
    rarity,
    activeEffects,

    // Computed
    isShield,
    isActualArmor,
    categoryOptions,
    baseTypeOptions,
    sourceOptions,
    equipmentPropertyOptions,
    selectedEquipmentProperties,

    // Методы
    toggleEquipmentProperty,
    buildArmor,
  };
}
