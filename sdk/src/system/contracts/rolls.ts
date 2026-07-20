/**
 * Контракт системного броска (Roll).
 *
 * Определяет метаданные для регистрации формул бросков,
 * специфичных для игровой системы (атака, спасбросок, проверка навыка).
 *
 * @module contracts/rolls
 */

/**
 * Тип броска.
 * Расширяется системами (D&D: 'attack', 'saving-throw', 'ability-check', 'skill-check').
 */
export type RollType = string;

/**
 * Метаданные регистрации типа броска.
 */
export interface RollDefinition {
  /** Уникальный тип броска (например, 'attack', 'saving-throw') */
  rollType: RollType;
  /** Человекочитаемое название */
  label: string;
  /** Формула по умолчанию (например, '1d20') */
  defaultFormula: string;
  /** ID системы-владельца */
  systemId: string;
}
