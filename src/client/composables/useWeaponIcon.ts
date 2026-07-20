import { computed } from 'vue';

import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

import clubSvg from '../ui/actor/icons/club.svg?raw';
import maceSvg from '../ui/actor/icons/mace.svg?raw';
import sickleSvg from '../ui/actor/icons/sickle.svg?raw';
import spearSvg from '../ui/actor/icons/spear.svg?raw';
import stickSvg from '../ui/actor/icons/stick.svg?raw';

/**
 * Словарь кастомных SVG-иконок (ttg:name → raw SVG из файлов).
 * SVG загружаются через Vite ?raw — при изменении файла иконка обновляется автоматически.
 */
const CUSTOM_SVG_MAP: Record<string, string> = {
  'ttg:spear': spearSvg,
  'ttg:club': clubSvg,
  'ttg:mace': maceSvg,
  'ttg:sickle': sickleSvg,
  'ttg:stick': stickSvg,
};

/** Иконка по умолчанию для оружия без baseType */
export const DEFAULT_WEAPON_ICON = 'tabler:sword';

/**
 * Тип результата getWeaponIcon.
 * iconName — для стандартных Iconify-иконок (UIcon :name).
 * svgContent — для кастомных SVG (v-html рендеринг).
 */
export interface WeaponIconResult {
  iconName?: string;
  svgContent?: string;
}

/**
 * Композабл для получения иконки оружия по baseType.
 *
 * Поддерживает как стандартные Iconify-иконки (tabler:*),
 * так и кастомные SVG (ttg:*), зарегистрированные в CUSTOM_SVG_MAP.
 *
 * @returns getWeaponIcon
 */
export function useWeaponIcon() {
  const systemDataStore = useSystemDataStore();

  /**
   * Карта baseType → icon из системных данных (weapon-base-types.json)
   */
  const weaponIconMap = computed(() => {
    const map = new Map<string, string>();

    for (const baseType of systemDataStore.weaponBaseTypes) {
      map.set(baseType.key, baseType.icon);
    }

    return map;
  });

  /**
   * Возвращает иконку оружия по baseType.
   *
   * @param baseType - ключ базового типа
   * @returns объект с iconName (Iconify) или svgContent (кастомный SVG)
   */
  function getWeaponIcon(baseType?: string): WeaponIconResult {
    if (!baseType) {
      return { iconName: DEFAULT_WEAPON_ICON };
    }

    const iconKey = weaponIconMap.value.get(baseType) ?? DEFAULT_WEAPON_ICON;

    // Кастомная SVG-иконка
    if (iconKey.startsWith('ttg:')) {
      const svgContent = CUSTOM_SVG_MAP[iconKey];

      if (svgContent) {
        return { svgContent };
      }

      return { iconName: DEFAULT_WEAPON_ICON };
    }

    return { iconName: iconKey };
  }

  return {
    weaponIconMap,
    getWeaponIcon,
  };
}
