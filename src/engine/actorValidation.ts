/**
 * Валидация и нормализация данных актёра D&D 5e (форма создания/редактирования).
 *
 * Логика системо-зависима (характеристики, ХП, опыт, границы `ABILITY_SCORE_*`),
 * поэтому живёт в системе D&D и вызывается Ядром через контракт `VttSystem`
 * (`validateActorData` / `normalizeActorData`), а не напрямую из клиентских сторов.
 *
 * @module system/dnd/actorValidation
 */

import type { DnDActor } from './dndEntities.js';
import type { DnDActorSystem } from './types.js';

import { ABILITY_SCORE_MAX, ABILITY_SCORE_MIN } from './consts.js';

/**
 * Валидирует данные актора D&D 5e перед сохранением.
 *
 * @param actor - частичные данные актора
 * @throws Error если данные невалидны
 */
export function validateActorData(actor: Partial<DnDActor>): void {
  // Проверка имени
  if (actor.name !== undefined && actor.name.trim() === '') {
    throw new Error('Имя персонажа обязательно');
  }

  const system = actor.system as Partial<DnDActorSystem> | undefined;

  if (!system) {
    return;
  }

  // Проверка характеристик (ability scores)
  if (system.abilities) {
    const abilityKeys = [
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ] as const;

    for (const ability of abilityKeys) {
      const value = system.abilities[ability];

      if (value !== undefined) {
        if (value < ABILITY_SCORE_MIN || value > ABILITY_SCORE_MAX) {
          throw new Error(
            `Значение характеристики должно быть от ${ABILITY_SCORE_MIN} до ${ABILITY_SCORE_MAX}`,
          );
        }
      }
    }
  }

  // Проверка здоровья
  if (system.hitPoints) {
    if (
      system.hitPoints.current !== undefined
      && system.hitPoints.current < 0
    ) {
      throw new Error('Текущее здоровье не может быть отрицательным');
    }

    if (system.hitPoints.max !== undefined && system.hitPoints.max < 0) {
      throw new Error('Максимальное здоровье не может быть отрицательным');
    }

    if (
      system.hitPoints.current !== undefined
      && system.hitPoints.max !== undefined
    ) {
      if (system.hitPoints.current > system.hitPoints.max) {
        throw new Error('Текущее здоровье не может превышать максимальное');
      }
    }
  }

  // Проверка опыта
  if (system.experience !== undefined && system.experience < 0) {
    throw new Error('Опыт не может быть отрицательным');
  }
}

/**
 * Нормализует данные актора D&D 5e (исправляет некорректные значения).
 *
 * @param actor - частичные данные актора
 * @returns нормализованные данные актора
 */
export function normalizeActorData(
  actor: Partial<DnDActor>,
): Partial<DnDActor> {
  const normalized = { ...actor };

  const system = normalized.system ? { ...normalized.system } : undefined;

  if (!system) {
    return normalized;
  }

  // Нормализация характеристик
  if (system.abilities) {
    const abilities = { ...system.abilities };

    const abilityKeys = [
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ] as const;

    for (const ability of abilityKeys) {
      const value = abilities[ability];

      if (value !== undefined) {
        if (value < ABILITY_SCORE_MIN) {
          abilities[ability] = ABILITY_SCORE_MIN;
        } else if (value > ABILITY_SCORE_MAX) {
          abilities[ability] = ABILITY_SCORE_MAX;
        }
      }
    }

    system.abilities = abilities;
  }

  // Нормализация здоровья
  if (system.hitPoints) {
    const hitPoints = { ...system.hitPoints };

    if (hitPoints.current !== undefined && hitPoints.current < 0) {
      hitPoints.current = 0;
    }

    if (hitPoints.max !== undefined && hitPoints.max < 0) {
      hitPoints.max = 0;
    }

    if (hitPoints.current !== undefined && hitPoints.max !== undefined) {
      if (hitPoints.current > hitPoints.max) {
        hitPoints.current = hitPoints.max;
      }
    }

    system.hitPoints = hitPoints;
  }

  // Нормализация опыта
  if (system.experience !== undefined && system.experience < 0) {
    system.experience = 0;
  }

  normalized.system = system;

  return normalized;
}
