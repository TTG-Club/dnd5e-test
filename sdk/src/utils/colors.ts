/** Палитра цветов для курсоров игроков и элементов UI */
export const CURSOR_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
  '#f97316',
] as const;

/**
 * Возвращает цвет курсора для пользователя по его ID
 * Использует хэш-формулу для стабильного закрепления цвета за пользователем
 * @param userId - ID пользователя
 * @returns hex-цвет из палитры
 */
export function getCursorColor(userId: string): string {
  let colorHash = 0;

  for (let i = 0; i < userId.length; i++) {
    colorHash = ((colorHash << 5) - colorHash + userId.charCodeAt(i)) | 0;
  }

  return CURSOR_COLORS[Math.abs(colorHash) % CURSOR_COLORS.length];
}
