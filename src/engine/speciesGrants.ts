import type { CreatureSize, MovementType } from '@vtt/shared';
import type { GrantedSpellSource } from './grantedSpells.js';
import type { SpeciesDefinition, SpeciesFeature } from './speciesTypes.js';

/**
 * Хелперы расчёта уровне-зависимых даров вида.
 *
 * Особенности вида могут появляться на разных уровнях персонажа и быть
 * привязаны к выбранному подвиду (`subspecies`). Эти чистые функции используются
 * и мастером настройки вида (применение при добавлении), и листом актёра
 * (пересчёт скорости/тёмного зрения при повышении уровня).
 */

/** Оси скорости движения, которыми оперируют дары вида. */
const MOVEMENT_AXES: ReadonlyArray<
  Extract<MovementType, keyof SpeciesDefinition['speed']>
> = ['walk', 'fly', 'swim', 'climb', 'burrow'];

/**
 * Собирает плоский список особенностей вида с учётом выбранных подвидов:
 * базовые особенности вида плюс особенности выбранных вариантов (подвидов).
 * Уровень НЕ фильтруется — это делает вызывающий код (для применения хранит
 * все, для показа фильтрует по достижению уровня).
 *
 * @param definition - определение вида
 * @param chosenSubspecies - выбранные ключи вариантов-происхождений
 * @returns базовые особенности + особенности выбранных подвидов
 */
export function collectSpeciesFeatures(
  definition: SpeciesDefinition,
  chosenSubspecies: ReadonlyArray<string>,
): SpeciesFeature[] {
  const features: SpeciesFeature[] = [];

  for (const feature of definition.features) {
    features.push(feature);

    for (const choice of feature.choices ?? []) {
      if (!chosenSubspecies.includes(choice.key)) {
        continue;
      }

      for (const subspeciesFeature of choice.features ?? []) {
        features.push(subspeciesFeature);
      }
    }
  }

  return features;
}

/**
 * Активна ли особенность на текущем уровне персонажа.
 *
 * @param feature - особенность вида
 * @param totalLevel - суммарный уровень персонажа
 * @returns true, если особенность уже получена по уровню
 */
export function isSpeciesFeatureActive(
  feature: SpeciesFeature,
  totalLevel: number,
): boolean {
  return (feature.level ?? 1) <= totalLevel;
}

/**
 * Считает итоговую скорость движения вида: базовая скорость плюс «не ниже»
 * прибавки от активных на текущем уровне особенностей (выбранного подвида).
 *
 * @param definition - определение вида
 * @param totalLevel - суммарный уровень персонажа
 * @param chosenSubspecies - выбранные ключи вариантов-происхождений
 * @returns скорость по осям walk/fly/swim/climb/burrow
 */
export function computeSpeciesMovement(
  definition: SpeciesDefinition,
  totalLevel: number,
  chosenSubspecies: ReadonlyArray<string>,
): Record<(typeof MOVEMENT_AXES)[number], number> {
  const movement: Record<(typeof MOVEMENT_AXES)[number], number> = {
    walk: definition.speed.walk,
    fly: definition.speed.fly ?? 0,
    swim: definition.speed.swim ?? 0,
    climb: definition.speed.climb ?? 0,
    burrow: definition.speed.burrow ?? 0,
  };

  for (const feature of collectSpeciesFeatures(definition, chosenSubspecies)) {
    if (!feature.movement || feature.isInformationalOnly) {
      continue;
    }

    if (!isSpeciesFeatureActive(feature, totalLevel)) {
      continue;
    }

    for (const axis of MOVEMENT_AXES) {
      const value = feature.movement[axis];

      if (typeof value === 'number' && value > movement[axis]) {
        movement[axis] = value;
      }
    }
  }

  return movement;
}

/**
 * Считает дальность тёмного зрения вида: максимум из даров `darkvision` и
 * активных на текущем уровне особенностей с полем `darkvision`.
 *
 * @param definition - определение вида
 * @param totalLevel - суммарный уровень персонажа
 * @param chosenSubspecies - выбранные ключи вариантов-происхождений
 * @returns дальность тёмного зрения в футах (0, если нет)
 */
export function computeSpeciesDarkvision(
  definition: SpeciesDefinition,
  totalLevel: number,
  chosenSubspecies: ReadonlyArray<string>,
): number {
  let darkvision = 0;

  for (const grant of definition.grants) {
    if (grant.type === 'darkvision' && grant.range > darkvision) {
      darkvision = grant.range;
    }
  }

  for (const feature of collectSpeciesFeatures(definition, chosenSubspecies)) {
    if (typeof feature.darkvision !== 'number' || feature.isInformationalOnly) {
      continue;
    }

    if (!isSpeciesFeatureActive(feature, totalLevel)) {
      continue;
    }

    if (feature.darkvision > darkvision) {
      darkvision = feature.darkvision;
    }
  }

  return darkvision;
}

/**
 * Собирает связи «заклинание компендиума → особенность-источник» из вида —
 * включая вложенные особенности подвидов. Берёт только связанные с компендиумом
 * (`spellId`) заклинания; дедуп по `spellId`. Используется резолвером granted-
 * заклинаний для подгрузки данных из компендиума.
 *
 * @param definition - определение вида
 * @returns источники granted-заклинаний (только со `spellId`)
 */
export function collectSpeciesGrantedSpellSources(
  definition: SpeciesDefinition,
): GrantedSpellSource[] {
  const sources: GrantedSpellSource[] = [];
  const seenSpellIds = new Set<string>();

  const addFromFeature = (feature: SpeciesFeature): void => {
    if (feature.isInformationalOnly) {
      return;
    }

    for (const ref of feature.grantedSpells ?? []) {
      if (!ref.spellId || seenSpellIds.has(ref.spellId)) {
        continue;
      }

      seenSpellIds.add(ref.spellId);

      sources.push({
        spellId: ref.spellId,
        featureName: feature.name,
        packId: ref.packId,
      });
    }
  };

  for (const feature of definition.features) {
    addFromFeature(feature);

    for (const choice of feature.choices ?? []) {
      for (const choiceFeature of choice.features ?? []) {
        addFromFeature(choiceFeature);
      }
    }
  }

  return sources;
}

/** Карта размера существа в масштаб токена. */
export const SPECIES_SIZE_SCALE_MAP: Record<CreatureSize, number> = {
  tiny: 0.5,
  small: 0.8,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};
