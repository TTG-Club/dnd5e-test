/**
 * Type-guard: значение — объект (не `null`).
 *
 * Используется для безопасного чтения полей из данных типа `unknown`
 * (легаси/кросс-поля систем, внешние данные) без приведения через `any`.
 * Примечание: массивы тоже проходят проверку (`typeof [] === 'object'`),
 * поэтому при необходимости отсеять их используйте `Array.isArray` отдельно.
 *
 * @param value - проверяемое значение
 * @returns true, если value — объект и не `null`
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
