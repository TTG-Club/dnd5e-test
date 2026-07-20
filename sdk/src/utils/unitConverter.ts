/**
 * Конфигурация единиц измерения расстояния и утилиты конвертации.
 *
 * Все коэффициенты конвертации собраны в одном месте — можно
 * подправить вручную при необходимости точности до миллиметра.
 *
 * Поддерживаемые единицы:
 * - `ft` — футы (по умолчанию для D&D)
 * - `m` — метры
 * - `mi` — мили
 * - `km` — километры
 */

import type { DistanceUnit } from '../types/index.js';

// ============================================================
// Коэффициенты конвертации (КОНФИГ — редактируемый)
// ============================================================

/**
 * Коэффициенты перевода в метры (базовая единица).
 *
 * Чтобы изменить точность — отредактируйте значения ниже.
 * Метр = 1 (эталон), остальные единицы выражены через него.
 *
 * - 1 фут = 0.3048 м (точное значение по стандарту)
 * - 1 миля = 1609.344 м
 * - 1 км = 1000 м
 */
export const CONVERSION_TO_METERS: Record<DistanceUnit, number> = {
  ft: 0.3048,
  m: 1,
  mi: 1609.344,
  km: 1000,
};

// ============================================================
// Метки и опции для UI
// ============================================================

/** Полные локализованные названия единиц */
export const DISTANCE_UNIT_LABELS: Record<DistanceUnit, string> = {
  ft: 'Футы (ft)',
  m: 'Метры (m)',
  mi: 'Мили (mi)',
  km: 'Километры (km)',
};

/** Короткие метки для отображения на сцене и в формулах */
export const DISTANCE_UNIT_SHORT: Record<DistanceUnit, string> = {
  ft: 'фт',
  m: 'м',
  mi: 'мили',
  km: 'км',
};

/** Опции для USelectMenu (dropdown выбора единиц) */
export const DISTANCE_UNIT_OPTIONS: ReadonlyArray<{
  label: string;
  value: DistanceUnit;
}> = [
  { label: 'Футы (ft)', value: 'ft' },
  { label: 'Метры (m)', value: 'm' },
  { label: 'Мили (mi)', value: 'mi' },
  { label: 'Километры (km)', value: 'km' },
];

/** Список допустимых значений DistanceUnit */
const VALID_DISTANCE_UNITS: ReadonlyArray<string> = ['ft', 'm', 'mi', 'km'];

// ============================================================
// Функции конвертации
// ============================================================

/**
 * Конвертирует значение расстояния из одной единицы в другую.
 *
 * Алгоритм: value → метры (через fromUnit) → toUnit
 *
 * @param value - числовое значение расстояния
 * @param fromUnit - исходная единица
 * @param toUnit - целевая единица
 * @returns сконвертированное значение
 */
export function convertDistance(
  value: number,
  fromUnit: DistanceUnit,
  toUnit: DistanceUnit,
): number {
  if (fromUnit === toUnit) {
    return value;
  }

  const valueInMeters = value * CONVERSION_TO_METERS[fromUnit];

  return valueInMeters / CONVERSION_TO_METERS[toUnit];
}

/**
 * Форматирует значение расстояния с локализованной короткой меткой единицы.
 *
 * @param value - числовое значение (округляется до 1 десятичного знака)
 * @param unit - единица измерения
 * @returns строка вида "30 фт", "9.1 м"
 */
export function formatDistance(value: number, unit: DistanceUnit): string {
  const rounded = Math.round(value * 10) / 10;
  const label = DISTANCE_UNIT_SHORT[unit] ?? unit;

  return `${rounded} ${label}`;
}

/**
 * Проверяет, является ли строка допустимой единицей измерения.
 *
 * @param value - строка для проверки
 * @returns true если значение — валидный DistanceUnit
 */
export function isDistanceUnit(value: string): value is DistanceUnit {
  return VALID_DISTANCE_UNITS.includes(value);
}
