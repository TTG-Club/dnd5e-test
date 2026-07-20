/**
 * Контракт состояний (Conditions).
 *
 * Определяет метаданные для регистрации состояний/эффектов,
 * специфичных для игровой системы (отравлен, оглушён, невидим).
 *
 * @module contracts/conditions
 */

/**
 * Метаданные состояния (condition).
 */
export interface ConditionDefinition {
  /** Уникальный ключ состояния (например, 'poisoned', 'stunned') */
  key: string;
  /** Человекочитаемое название */
  label: string;
  /** Иконка (формат: 'tabler:icon-name' or 'ttg:icon-name') */
  icon: string;
  /** Описание эффекта */
  description: string;
  /** ID системы-владельца */
  systemId: string;
  /** Путь к кастомной SVG-иконке (имеет приоритет над icon) */
  customImage?: string;
}
