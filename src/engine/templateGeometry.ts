/**
 * Геометрические утилиты для проверки попадания точек
 * в области шаблонов измерений (AoE).
 *
 * Используются как на клиенте (рендеринг), так и для определения,
 * какие токены попали в область заклинания.
 */

import type {
  DiagonalRule,
  MeasurementTemplate,
  Token,
} from '@vtt/shared';

import { isPointInCircle } from '@vtt/shared';

/**
 * Половинный угол конуса D&D 5e (радианы).
 * Ширина конуса на конце равна его длине → половинный угол arctan(0.5)
 * ≈ 26.57° (полный ≈ 53.13°).
 */
const MEASUREMENT_CONE_HALF_ANGLE = Math.atan(0.5);

/**
 * Сеточная норма вектора в пикселях — «выпрямленное» расстояние по правилу
 * диагоналей. Равна евклидовой длине вектора, направленного строго вдоль оси,
 * который имеет то же расстояние в клетках, что и исходный вектор.
 *
 * Для шаблонов используется непрерывная форма правила `alternating`
 * (каждая диагональная клетка стоит 1.5), без «лесенки» округления,
 * чтобы форма области была непрерывной.
 *
 * @param deltaX - смещение по X (пиксели)
 * @param deltaY - смещение по Y (пиксели)
 * @param rule - правило расчёта диагоналей
 * @returns сеточное расстояние в пикселях
 */
export function getTemplateGridNorm(
  deltaX: number,
  deltaY: number,
  rule: DiagonalRule,
): number {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  switch (rule) {
    case 'chebyshev': {
      // D&D 5e: диагональ стоит как прямая клетка
      return Math.max(absX, absY);
    }
    case 'alternating': {
      // D&D 3.5e/PF: диагональ в среднем стоит 1.5 клетки
      return Math.max(absX, absY) + Math.min(absX, absY) / 2;
    }
    case 'euclidean':
    default: {
      return Math.hypot(absX, absY);
    }
  }
}

/**
 * Коэффициент стоимости направления: во сколько раз сеточное расстояние
 * вдоль направления `angle` больше евклидова. Евклидов радиус изолинии
 * сеточного расстояния `R` в направлении `angle` равен `R / factor`.
 *
 * @param angle - направление (радианы)
 * @param rule - правило расчёта диагоналей
 * @returns коэффициент (для euclidean всегда 1)
 */
export function getDiagonalDirectionFactor(
  angle: number,
  rule: DiagonalRule,
): number {
  return getTemplateGridNorm(Math.cos(angle), Math.sin(angle), rule);
}

/**
 * Порог (квадрат расстояния в пикселях), при котором точка считается
 * совпадающей с вершиной конуса. `Math.atan2(0, 0)` возвращает 0, из-за чего
 * угловая проверка ложно отсекала точку-источник для конусов, направленных
 * не вдоль оси X.
 */
const CONE_APEX_EPSILON_SQ = 1;

/**
 * Угловой допуск (радианы) для точек на рёбрах конуса. Центры клеток,
 * лежащие точно на ребре (например, боковые клетки осевого конуса),
 * без допуска включаются или выпадают по погрешности последнего бита:
 * `π/2 − atan(2)` отличается от `atan(0.5)` на 1 ulp, поэтому конус вправо
 * захватывал боковые клетки, а такой же конус вниз — нет.
 */
const CONE_EDGE_ANGLE_EPSILON = 1e-9;

/**
 * Проверяет, попадает ли вектор (deltaX, deltaY) в угловой сектор конуса.
 * Вершина конуса (нулевой вектор) всегда внутри — иначе `atan2(0,0)=0`
 * ложно отсекал бы точку-источник для конусов, направленных не вдоль оси X.
 *
 * @param deltaX - смещение точки от вершины по X
 * @param deltaY - смещение точки от вершины по Y
 * @param direction - угол направления конуса (радианы)
 * @param halfAngle - половинный угол конуса (радианы)
 * @returns true если направление внутри сектора
 */
function isDirectionWithinCone(
  deltaX: number,
  deltaY: number,
  direction: number,
  halfAngle: number,
): boolean {
  if (deltaX * deltaX + deltaY * deltaY < CONE_APEX_EPSILON_SQ) {
    return true;
  }

  const angle = Math.atan2(deltaY, deltaX);

  let diff = angle - direction;

  while (diff > Math.PI) {
    diff -= 2 * Math.PI;
  }

  while (diff < -Math.PI) {
    diff += 2 * Math.PI;
  }

  return Math.abs(diff) <= halfAngle + CONE_EDGE_ANGLE_EPSILON;
}

/**
 * Проверяет, находится ли точка внутри конуса (сектора).
 *
 * @param pointX - X координата точки
 * @param pointY - Y координата точки
 * @param originX - X начала конуса
 * @param originY - Y начала конуса
 * @param direction - угол направления конуса (радианы)
 * @param halfAngle - половинный угол конуса (радианы)
 * @param radius - длина конуса
 * @returns true если точка внутри конуса
 */
export function isPointInCone(
  pointX: number,
  pointY: number,
  originX: number,
  originY: number,
  direction: number,
  halfAngle: number,
  radius: number,
): boolean {
  const dx = pointX - originX;
  const dy = pointY - originY;
  const adjustedRadius = radius + 0.1;

  if (dx * dx + dy * dy > adjustedRadius * adjustedRadius) {
    return false;
  }

  return isDirectionWithinCone(dx, dy, direction, halfAngle);
}

/**
 * Проверяет, находится ли точка внутри повёрнутого прямоугольника (луча).
 *
 * @param pointX - X координата точки
 * @param pointY - Y координата точки
 * @param originX - X начала луча
 * @param originY - Y начала луча
 * @param direction - угол направления (радианы)
 * @param length - длина луча
 * @param width - ширина луча
 * @returns true если точка внутри луча
 */
export function isPointInRay(
  pointX: number,
  pointY: number,
  originX: number,
  originY: number,
  direction: number,
  length: number,
  width: number,
): boolean {
  const dx = pointX - originX;
  const dy = pointY - originY;
  const cos = Math.cos(-direction);
  const sin = Math.sin(-direction);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const halfWidth = width / 2;

  // Epsilon для компенсации ошибок тригонометрии при повороте координат.
  // Без него cos(-π/2) ≈ 6.12e-17 вместо 0, что при boundary check
  // приводит к пропуску клеток на одной из сторон луча.
  const epsilon = 0.5;

  return (
    localX >= -epsilon
    && localX <= length + epsilon
    && localY >= -halfWidth - epsilon
    && localY <= halfWidth + epsilon
  );
}

/**
 * Проверяет, находится ли точка внутри axis-aligned прямоугольника.
 *
 * @param pointX - X координата точки
 * @param pointY - Y координата точки
 * @param originX - X первого угла
 * @param originY - Y первого угла
 * @param targetX - X противоположного угла
 * @param targetY - Y противоположного угла
 * @returns true если точка внутри прямоугольника
 */
export function isPointInRect(
  pointX: number,
  pointY: number,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
): boolean {
  const minX = Math.min(originX, targetX);
  const maxX = Math.max(originX, targetX);
  const minY = Math.min(originY, targetY);
  const maxY = Math.max(originY, targetY);

  return pointX >= minX && pointX <= maxX && pointY >= minY && pointY <= maxY;
}

/**
 * Проверяет, попадает ли точка внутрь области шаблона.
 *
 * @param pointX - X координата точки
 * @param pointY - Y координата точки
 * @param gridSize - размер клетки в пикселях (дефолтная ширина луча)
 * @param template - шаблон измерения
 * @returns true если точка внутри области
 */
export function isPointInTemplate(
  pointX: number,
  pointY: number,
  gridSize: number,
  template: MeasurementTemplate,
): boolean {
  const dx = template.targetX - template.originX;
  const dy = template.targetY - template.originY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 1) {
    return false;
  }

  const direction = Math.atan2(dy, dx);

  switch (template.type) {
    case 'circle':
      return isPointInCircle(
        pointX,
        pointY,
        template.originX,
        template.originY,
        distance,
      );
    case 'cone':
      return isPointInCone(
        pointX,
        pointY,
        template.originX,
        template.originY,
        direction,
        MEASUREMENT_CONE_HALF_ANGLE,
        distance,
      );
    case 'rect':
      return isPointInRect(
        pointX,
        pointY,
        template.originX,
        template.originY,
        template.targetX,
        template.targetY,
      );
    case 'ray': {
      const rayWidth = template.width ?? gridSize;

      return isPointInRay(
        pointX,
        pointY,
        template.originX,
        template.originY,
        direction,
        distance,
        rayWidth,
      );
    }
    case 'cylinder':
      return isPointInCircle(
        pointX,
        pointY,
        template.originX,
        template.originY,
        distance,
      );
    default:
      return false;
  }
}

/**
 * Проверяет, попадает ли центр токена в область шаблона.
 *
 * @param tokenX - X позиция токена (левый верхний угол)
 * @param tokenY - Y позиция токена (левый верхний угол)
 * @param tokenScale - масштаб токена (1 = 1 клетка)
 * @param gridSize - размер клетки в пикселях
 * @param template - шаблон измерения
 * @returns true если центр токена попадает в область
 */
export function isTokenInTemplate(
  tokenX: number,
  tokenY: number,
  tokenScale: number,
  gridSize: number,
  template: MeasurementTemplate,
): boolean {
  const halfSize = (tokenScale * gridSize) / 2;

  return isPointInTemplate(
    tokenX + halfSize,
    tokenY + halfSize,
    gridSize,
    template,
  );
}

/**
 * Находит все токены, центры которых попадают в область шаблона.
 *
 * По правилам D&D 5e, AoE поражает **всех** в области, включая кастера.
 *
 * @param template - шаблон измерения (область заклинания)
 * @param tokens - массив токенов сцены
 * @param gridSize - размер клетки в пикселях
 * @returns массив токенов, попавших в область
 */
export function findTokensInTemplate(
  template: MeasurementTemplate,
  tokens: readonly Token[],
  gridSize: number,
): Token[] {
  return tokens.filter((token) => {
    // Пропускаем скрытые токены
    if (token.hidden) {
      return false;
    }

    return isTokenInTemplate(token.x, token.y, token.scale, gridSize, template);
  });
}
