import type { DiagonalRule, GridSettings } from '../types/index.js';

/** Размер клетки по умолчанию (в пикселях) */
const DEFAULT_CELL_SIZE = 50;

/** Масштаб клетки по умолчанию (единиц на клетку) */
const DEFAULT_SCALE = 5;

/** Правило расчёта диагоналей по умолчанию (D&D 5e) */
export const DEFAULT_DIAGONAL_RULE: DiagonalRule = 'chebyshev';

/**
 * Извлекает размер клетки из настроек сетки.
 *
 * @param gridSettings - настройки сетки сцены
 * @returns размер клетки в пикселях
 */
export function resolveGridCellSize(gridSettings: GridSettings): number {
  return gridSettings.type === 'fixed'
    ? DEFAULT_CELL_SIZE
    : gridSettings.cellSize;
}

/**
 * Вычисляет расстояние в клетках между двумя величинами по осям.
 *
 * @param cellsX - расстояние по оси X (в клетках)
 * @param cellsY - расстояние по оси Y (в клетках)
 * @param rule - правило расчёта диагонали
 * @returns расстояние в клетках
 */
function computeDistanceInCells(
  cellsX: number,
  cellsY: number,
  rule: GridSettings['diagonalRule'],
): number {
  switch (rule) {
    case 'chebyshev': {
      // D&D 5e: диагональ = 1 клетка (max из двух осей)
      return Math.max(cellsX, cellsY);
    }
    case 'alternating': {
      // D&D 3.5e / Pathfinder: каждая вторая диагональ стоит 2 клетки
      const straight = Math.abs(cellsX - cellsY);
      const diagonal = Math.min(cellsX, cellsY);
      const doubleDiagonals = Math.floor(diagonal / 2);

      return straight + diagonal + doubleDiagonals;
    }
    case 'euclidean':
    default: {
      // Геометрическое расстояние
      return Math.sqrt(cellsX * cellsX + cellsY * cellsY);
    }
  }
}

/**
 * Вычисляет расстояние между двумя точками на сцене в единицах сетки.
 *
 * Универсальная pure-функция, не зависит от системы правил.
 * Результат в тех же единицах, что задан в gridSettings (футы, метры и т.д.).
 *
 * Поддерживает три режима расчёта диагонали (`diagonalRule`):
 * - `chebyshev` (по умолчанию в D&D 5e): диагональ = 1 клетка
 * - `alternating` (D&D 3.5e/PF): 5-10-5-10 за каждую диагональную клетку
 * - `euclidean`: реальное геометрическое расстояние
 *
 * @param pointA - координаты первой точки (в пикселях сцены)
 * @param pointA.x - координата X первой точки
 * @param pointA.y - координата Y первой точки
 * @param pointB - координаты второй точки (в пикселях сцены)
 * @param pointB.x - координата X второй точки
 * @param pointB.y - координата Y второй точки
 * @param gridSettings - настройки сетки сцены
 * @returns расстояние в единицах сетки (например, в футах)
 */
export function getTokenDistance(
  pointA: { x: number; y: number },
  pointB: { x: number; y: number },
  gridSettings: GridSettings,
): number {
  const cellSize = resolveGridCellSize(gridSettings);
  const scale = gridSettings.scale ?? DEFAULT_SCALE;
  const rule = gridSettings.diagonalRule ?? DEFAULT_DIAGONAL_RULE;

  const cellsX = Math.abs(pointB.x - pointA.x) / cellSize;
  const cellsY = Math.abs(pointB.y - pointA.y) / cellSize;

  return computeDistanceInCells(cellsX, cellsY, rule) * scale;
}

/** Токен с координатами и размером для расчёта досягаемости */
export interface TokenBounds {
  /** Координата X верхнего левого угла (в пикселях) */
  x: number;
  /** Координата Y верхнего левого угла (в пикселях) */
  y: number;
  /** Масштаб токена (1 = 1×1 клетка, 2 = Large (2×2), 3 = Huge (3×3) и т.д.) */
  scale: number;
}

/**
 * Вычисляет расстояние между ближайшими краями двух токенов в единицах сетки.
 *
 * В D&D 5e расстояние между существами измеряется от ближайшего края
 * одного существа до ближайшего края другого. Для больших (Large, 2×2)
 * и более крупных существ это критически важно: досягаемость атаки
 * отмеряется от края занимаемой области, а не от одной точки.
 *
 * Алгоритм: вычисляет зазор между прямоугольниками двух токенов
 * по каждой оси (в клетках), затем применяет правило диагонали.
 *
 * @param tokenA - первый токен (с координатами и масштабом)
 * @param tokenB - второй токен (с координатами и масштабом)
 * @param gridSettings - настройки сетки сцены
 * @returns расстояние в единицах сетки (например, в футах). Возвращает 0 если токены смежны или перекрываются.
 */
export function getTokenEdgeDistance(
  tokenA: TokenBounds,
  tokenB: TokenBounds,
  gridSettings: GridSettings,
): number {
  const cellSize = resolveGridCellSize(gridSettings);
  const scale = gridSettings.scale ?? DEFAULT_SCALE;
  const rule = gridSettings.diagonalRule ?? DEFAULT_DIAGONAL_RULE;

  // Определяем количество клеток, которые занимают токены
  // Используем Math.round для scale, так как токен D&D занимает целое число клеток
  const sizeA = Math.max(1, Math.round(tokenA.scale));
  const sizeB = Math.max(1, Math.round(tokenB.scale));

  const gridOffsetX = gridSettings.offsetX ?? 0;
  const gridOffsetY = gridSettings.offsetY ?? 0;

  // Определяем индексы ячеек, которые занимают токены
  // Вычитаем смещение сетки и используем Math.round для надежного определения клетки,
  // даже если координаты имеют небольшую погрешность или токен отцентрирован (scale < 1)
  const startColA = Math.round((tokenA.x - gridOffsetX) / cellSize);
  const startRowA = Math.round((tokenA.y - gridOffsetY) / cellSize);
  const endColA = startColA + sizeA - 1;
  const endRowA = startRowA + sizeA - 1;

  const startColB = Math.round((tokenB.x - gridOffsetX) / cellSize);
  const startRowB = Math.round((tokenB.y - gridOffsetY) / cellSize);
  const endColB = startColB + sizeB - 1;
  const endRowB = startRowB + sizeB - 1;

  // Расстояние в ячейках по каждой оси
  // Если токены пересекаются по оси, разница будет 0
  const cellsX = Math.max(
    0,
    Math.max(startColA, startColB) - Math.min(endColA, endColB),
  );

  const cellsY = Math.max(
    0,
    Math.max(startRowA, startRowB) - Math.min(endRowA, endRowB),
  );

  return computeDistanceInCells(cellsX, cellsY, rule) * scale;
}
