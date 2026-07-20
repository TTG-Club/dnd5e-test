/**
 * Проверяет, находится ли точка внутри полигона (алгоритм ray casting).
 *
 * @param pointX - координата X проверяемой точки
 * @param pointY - координата Y проверяемой точки
 * @param vertices - массив вершин полигона
 * @returns true, если точка внутри полигона
 */
export function isPointInPolygon(
  pointX: number,
  pointY: number,
  vertices: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  let inside = false;

  const vertexCount = vertices.length;

  for (let i = 0, j = vertexCount - 1; i < vertexCount; j = i++) {
    const vertexI = vertices[i];
    const vertexJ = vertices[j];

    if (
      vertexI.y > pointY !== vertexJ.y > pointY
      && pointX
        < ((vertexJ.x - vertexI.x) * (pointY - vertexI.y))
          / (vertexJ.y - vertexI.y)
          + vertexI.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Проверяет, находится ли точка внутри круга (с малым допуском на границе).
 * Чистая геометрия (используется и для UI-хиттеста ручек, и для круговых
 * шаблонов), системо-нейтральна.
 *
 * @param pointX - X координата проверяемой точки
 * @param pointY - Y координата проверяемой точки
 * @param centerX - X центра круга
 * @param centerY - Y центра круга
 * @param radius - радиус круга
 * @returns true, если точка внутри круга
 */
export function isPointInCircle(
  pointX: number,
  pointY: number,
  centerX: number,
  centerY: number,
  radius: number,
): boolean {
  const dx = pointX - centerX;
  const dy = pointY - centerY;
  const adjustedRadius = radius + 0.1;

  return dx * dx + dy * dy <= adjustedRadius * adjustedRadius;
}
