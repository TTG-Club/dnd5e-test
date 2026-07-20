import type {
  AmmunitionTypeDefinition,
  ArmorBaseTypeDefinition,
  DamageTypeDefinition,
  EquipmentCategoryDefinition,
  EquipmentPropertyDefinition,
  SourceDefinition,
  ToolPropertyDefinition,
  WeaponBaseTypeDefinition,
  WeaponCategoryDefinition,
  WeaponPropertyDefinition,
} from '@vtt/shared';

import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Хранилище системных данных D&D (свойства оружия, типы урона и т.д.)
 *
 * Загружается один раз при подключении к миру
 * и используется всеми компонентами для доступа к системным определениям.
 */
export const useSystemDataStore = defineStore('systemData', () => {
  /** Определения свойств оружия */
  const weaponProperties = ref<WeaponPropertyDefinition[]>([]);

  /** Определения базовых типов оружия */
  const weaponBaseTypes = ref<WeaponBaseTypeDefinition[]>([]);

  /** Определения типов урона */
  const damageTypes = ref<DamageTypeDefinition[]>([]);

  /** Определения категорий оружия */
  const weaponCategories = ref<WeaponCategoryDefinition[]>([]);

  /** Определения типов боеприпасов */
  const ammunitionTypes = ref<AmmunitionTypeDefinition[]>([]);

  /** Определения источников контента */
  const sources = ref<SourceDefinition[]>([]);

  /** Определения категорий доспехов */
  const armorCategories = ref<EquipmentCategoryDefinition[]>([]);

  /** Определения базовых типов доспехов */
  const armorBaseTypes = ref<ArmorBaseTypeDefinition[]>([]);

  /** Определения свойств снаряжения */
  const equipmentProperties = ref<EquipmentPropertyDefinition[]>([]);

  /** Определения свойств инструментов */
  const toolProperties = ref<ToolPropertyDefinition[]>([]);

  /** Определения видов (расы) */
  const speciesDefinitions = ref<
    import('@vtt/shared/system/dnd.js').SpeciesDefinition[]
  >([]);

  /**
   * Устанавливает свойства оружия из серверных данных
   * @param properties - массив определений свойств
   */
  function setWeaponProperties(properties: WeaponPropertyDefinition[]): void {
    weaponProperties.value = properties;
  }

  /**
   * Устанавливает базовые типы оружия из серверных данных
   * @param baseTypes - массив определений типов
   */
  function setWeaponBaseTypes(baseTypes: WeaponBaseTypeDefinition[]): void {
    weaponBaseTypes.value = baseTypes;
  }

  /**
   * Устанавливает типы урона из серверных данных
   * @param types - массив определений типов урона
   */
  function setDamageTypes(types: DamageTypeDefinition[]): void {
    damageTypes.value = types;
  }

  /**
   * Устанавливает категории оружия из серверных данных
   * @param categories - массив определений категорий
   */
  function setWeaponCategories(categories: WeaponCategoryDefinition[]): void {
    weaponCategories.value = categories;
  }

  /**
   * Устанавливает типы боеприпасов из серверных данных
   * @param types - массив определений типов боеприпасов
   */
  function setAmmunitionTypes(types: AmmunitionTypeDefinition[]): void {
    ammunitionTypes.value = types;
  }

  /**
   * Устанавливает источники контента из серверных данных
   * @param items - массив определений источников
   */
  function setSources(items: SourceDefinition[]): void {
    sources.value = items;
  }

  /**
   * Устанавливает категории доспехов из серверных данных
   * @param categories - массив определений категорий
   */
  function setArmorCategories(categories: EquipmentCategoryDefinition[]): void {
    armorCategories.value = categories;
  }

  /**
   * Устанавливает базовые типы доспехов из серверных данных
   * @param baseTypes - массив определений базовых типов
   */
  function setArmorBaseTypes(baseTypes: ArmorBaseTypeDefinition[]): void {
    armorBaseTypes.value = baseTypes;
  }

  /**
   * Устанавливает свойства снаряжения из серверных данных
   * @param properties - массив определений свойств
   */
  function setEquipmentProperties(
    properties: EquipmentPropertyDefinition[],
  ): void {
    equipmentProperties.value = properties;
  }

  /**
   * Устанавливает свойства инструментов из серверных данных
   */
  function setToolProperties(properties: ToolPropertyDefinition[]): void {
    toolProperties.value = properties;
  }

  /**
   * Устанавливает виды (расы) из серверных данных
   */
  function setSpeciesDefinitions(
    speciesList: import('@vtt/shared/system/dnd.js').SpeciesDefinition[],
  ): void {
    speciesDefinitions.value = speciesList;
  }

  /**
   * Очищает все данные (при отключении от мира)
   */
  function reset(): void {
    weaponProperties.value = [];
    weaponBaseTypes.value = [];
    damageTypes.value = [];
    weaponCategories.value = [];
    ammunitionTypes.value = [];
    sources.value = [];
    armorCategories.value = [];
    armorBaseTypes.value = [];
    equipmentProperties.value = [];
    toolProperties.value = [];
    speciesDefinitions.value = [];
  }

  return {
    weaponProperties,
    weaponBaseTypes,
    damageTypes,
    weaponCategories,
    ammunitionTypes,
    sources,
    armorCategories,
    armorBaseTypes,
    setWeaponProperties,
    setWeaponBaseTypes,
    setDamageTypes,
    setWeaponCategories,
    setAmmunitionTypes,
    setSources,
    setArmorCategories,
    setArmorBaseTypes,
    setEquipmentProperties,
    setToolProperties,
    setSpeciesDefinitions,
    equipmentProperties,
    toolProperties,
    speciesDefinitions,
    reset,
  };
});
