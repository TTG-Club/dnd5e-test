import type { CreatureAction } from '@vtt/shared/system/dnd.js';

import { checkCreatureActionRange } from '@vtt/shared/system/dnd.js';

import { measureTokenDistanceOnScene } from '../../../composables/useSceneRangeCheck';

/** Результат проверки дистанции для действия существа */
export interface CreatureRangeCheckResult {
  /** Разрешена ли атака */
  allowed: boolean;
  /** Атака с помехой (дальняя дистанция) */
  disadvantage: boolean;
  /** Расстояние до цели */
  distance: number;
  /** Метка единицы измерения */
  unitLabel: string;
}

/**
 * Проверяет дистанцию между существом и целью на текущей сцене.
 *
 * Используется в `CreatureActionsBlock.vue` и `dnd5eMacros.ts`.
 *
 * @param action - действие существа
 * @param attackerCreatureId - ID существа-атакующего
 * @param targetTokenId - ID токена-цели
 * @returns результат проверки или null (нет сцены / токенов)
 */
export function checkCreatureActionRangeOnScene(
  action: CreatureAction,
  attackerCreatureId: string,
  targetTokenId: string,
): CreatureRangeCheckResult | null {
  const measurement = measureTokenDistanceOnScene(
    attackerCreatureId,
    targetTokenId,
  );

  if (!measurement) {
    return null;
  }

  const rangeResult = checkCreatureActionRange(action, measurement.distance);

  return {
    ...rangeResult,
    distance: measurement.distance,
    unitLabel: measurement.unitLabel,
  };
}
