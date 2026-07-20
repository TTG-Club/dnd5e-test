import type { Ref } from 'vue';

import {
  ABILITY_ABBREVIATIONS,
  ABILITY_OPTIONS,
} from '@vtt/shared/system/dnd.js';
import { computed, ref } from 'vue';

/** Полное имя характеристики → короткий код */
const ABILITY_TO_ABBR: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ABILITY_ABBREVIATIONS).map(([abbr, full]) => [full, abbr]),
);

/** Короткие коды характеристик + заклинательная (для регэкспов) */
const MOD_CODES = [...Object.keys(ABILITY_ABBREVIATIONS), 'spell'].join('|');

/** Токен модификатора: @mod.str, @mod.spell и т.д. */
const MOD_TOKEN_RE = new RegExp(`@mod\\.(${MOD_CODES})\\b`, 'i');

/** Удаление токена вместе с предшествующим оператором (глобально) */
const STRIP_RE = new RegExp(`([+\\-])?\\s*@mod\\.(?:${MOD_CODES})\\b`, 'gi');

/**
 * Определяет выбранную характеристику из формулы.
 *
 * @param formula - строка формулы
 * @returns короткий код характеристики ('str'..'cha' | 'spell') или null
 */
function detectAbility(formula: string): string | null {
  const match = formula.match(MOD_TOKEN_RE);

  return match ? match[1].toLowerCase() : null;
}

/**
 * Убирает токен модификатора из формулы.
 *
 * @param formula - строка формулы
 * @returns формула без токена модификатора
 */
function stripModToken(formula: string): string {
  return formula
    .replace(STRIP_RE, '')
    .replace(/^\s*\+\s*/, '')
    .trim();
}

/**
 * Дописывает токен `@mod.<код>` к формуле.
 *
 * @param base - формула без токена модификатора
 * @param ability - короткий код характеристики
 * @returns формула с токеном модификатора
 */
function appendModToken(base: string, ability: string): string {
  return base ? `${base}+@mod.${ability}` : `@mod.${ability}`;
}

/**
 * Composable для двусторонней синхронизации «формула ↔ модификатор характеристики».
 *
 * Универсальный инструмент для любого поля формулы (урон заклинания, значение
 * эффекта и т.д.): галочка «Добавить модификатор характеристики» + селект
 * характеристики связаны со строкой формулы через токен `@mod.<код>`.
 *
 * - Если в формуле есть `@mod.str` — галочка включена, селект показывает
 *   соответствующую характеристику.
 * - Включение галочки дописывает `+@mod.<код>` в конец формулы.
 * - Смена характеристики заменяет токен на новый.
 * - Выключение галочки удаляет токен (вместе со связующим оператором).
 *
 * Канонический источник истины — сама строка формулы; отдельных полей не заводим.
 *
 * @param formula - reactive-ссылка на строку формулы
 * @returns реактивные `modifierEnabled`, `selectedAbility` и список `abilityOptions`
 */
export function useFormulaModifier(formula: Ref<string>) {
  /** Опции селекта: 6 характеристик (короткие коды) + заклинательная */
  const abilityOptions = [
    ...ABILITY_OPTIONS.map((option) => ({
      value: ABILITY_TO_ABBR[option.value],
      label: option.label,
    })),
    { value: 'spell', label: 'Заклинателя' },
  ];

  /** Последняя выбранная характеристика (для повторного включения галочки) */
  const lastAbility = ref(detectAbility(formula.value) ?? 'spell');

  /** Включён ли модификатор (есть ли токен в формуле) */
  const modifierEnabled = computed<boolean>({
    get: () => detectAbility(formula.value) !== null,
    set: (enabled) => {
      const base = stripModToken(formula.value);

      formula.value = enabled ? appendModToken(base, lastAbility.value) : base;
    },
  });

  /** Выбранная характеристика (короткий код или 'spell') */
  const selectedAbility = computed<string>({
    get: () => {
      const detected = detectAbility(formula.value);

      if (detected) {
        lastAbility.value = detected;
      }

      return detected ?? lastAbility.value;
    },
    set: (ability) => {
      lastAbility.value = ability;
      formula.value = appendModToken(stripModToken(formula.value), ability);
    },
  });

  return { abilityOptions, modifierEnabled, selectedAbility };
}
