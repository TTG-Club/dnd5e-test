/**
 * Контракт макросов (Macros).
 *
 * Определяет метаданные для регистрации макросов,
 * специфичных для игровой системы (быстрые действия на панели).
 *
 * @module contracts/macros
 */

/**
 * Метаданные макроса.
 */
export interface MacroDefinition {
  /** Уникальный ключ макроса (например, 'short-rest', 'death-save') */
  key: string;
  /** Человекочитаемое название */
  label: string;
  /** Иконка (формат: 'tabler:icon-name' или 'ttg:icon-name') */
  icon: string;
  /** Описание действия */
  description: string;
  /** ID системы-владельца */
  systemId: string;
}
