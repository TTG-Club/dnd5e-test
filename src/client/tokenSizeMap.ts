/**
 * Маппинг масштаба токена → размер существа D&D 5e.
 *
 * D&D-специфичная таблица (tiny/medium/large/huge/gargantuan) — живёт В СИСТЕМЕ,
 * а не в ядре: ядровый `core/tokenConsts` знает только нейтральные числовые
 * масштабы токена, а перевод их в игровые «размеры существа» — правило D&D.
 *
 * @module systems/dnd5e/tokenSizeMap
 */

import type { CreatureSize } from '@vtt/shared/system/dnd.js';

/** Масштаб токена (клетки) → размер существа D&D 5e. */
export const SCALE_TO_SIZE: Record<number, CreatureSize> = {
  0.5: 'tiny',
  1: 'medium',
  2: 'large',
  3: 'huge',
  4: 'gargantuan',
};
