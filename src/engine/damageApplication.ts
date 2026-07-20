/**
 * Применение урона/лечения и наложение эффектов на сущность-цель по правилам
 * D&D 5e (защиты от урона, временные ХП, иммунитеты к состояниям, слияние
 * эффектов) плюс производные боевые характеристики цели (КД, активные флаги).
 *
 * Логика системо-зависима, поэтому живёт в системе D&D и вызывается Ядром
 * (нейтральный `targetStore`) через контракт `VttSystem`:
 * `applyDamageToEntity` / `applyEffectsToEntity` / `getEntityArmorClass` /
 * `getEntityActiveFlags`. Стор отвечает лишь за выбор цели и WS-отправку.
 *
 * @module system/dnd/damageApplication
 */

import type { ActiveEffect, EffectOrigin } from './activeEffectTypes.js';
import type { ConditionKey } from './consts.js';
import type { DamageApplyResult, DamageDefenseOutcome } from './damageUtils.js';
import type { DnDSceneEntity } from './dndEntities.js';
import type { IncomingAttackContext } from './effectPipeline.js';

import { isActorEntity, isCreatureEntity } from '@vtt/shared';
import { generateId } from '@vtt/shared';
import { buildConditionActiveEffect } from './conditionTemplates.js';
import { CONDITIONS } from './consts.js';
import { applyDamageDefenses, applyHpChange } from './damageUtils.js';
import {
  isImmuneToCondition,
  mergeAppliedEffects,
} from './effectAutomation.js';
import {
  collectActiveEffects,
  evaluateDefensiveACBonus,
  getEntityConditionImmunities,
  resolveActorStats,
} from './effectPipeline.js';
import { withInitializedDuration } from './turnEffects.js';

/**
 * Опознаёт ключ состояния эффекта: по явному `conditionKey` либо по совпадению
 * `id`/имени с записью состояния (легаси-данные без `conditionKey`).
 *
 * @param effect - эффект
 * @returns ключ состояния или `undefined`, если эффект не является состоянием
 */
function resolveEffectConditionKey(
  effect: ActiveEffect,
): ConditionKey | undefined {
  if (effect.conditionKey) {
    return effect.conditionKey;
  }

  const entry = CONDITIONS.find(
    (conditionEntry) =>
      conditionEntry.key === effect.id
      || conditionEntry.nameRu === effect.name
      || conditionEntry.nameEn === effect.name,
  );

  return entry?.key;
}

/**
 * Строит `ActiveEffect` для наложения на цель.
 *
 * Если эффект опознан как состояние D&D 5e — собирает полноценный
 * condition-эффект через общий хелпер `buildConditionActiveEffect`, СОХРАНЯЯ
 * авторскую длительность и цель применения (а не хардкодя «постоянно»).
 * Иначе — копирует эффект как есть с переданным `origin`.
 *
 * @param effect - исходный эффект из действия/оружия
 * @param fallbackOrigin - origin для не-condition эффектов
 * @returns готовый `ActiveEffect` для добавления в `activeEffects`
 */
function buildEffectForTarget(
  effect: ActiveEffect,
  fallbackOrigin: EffectOrigin,
): ActiveEffect {
  const conditionKey = resolveEffectConditionKey(effect);

  if (!conditionKey) {
    return withInitializedDuration({
      ...effect,
      id: generateId('effect'),
      origin: fallbackOrigin,
    });
  }

  const conditionEffect = buildConditionActiveEffect(conditionKey, {
    duration: effect.duration,
    effectTarget: effect.effectTarget,
  });

  return withInitializedDuration(
    conditionEffect ?? {
      ...effect,
      id: generateId('effect'),
      origin: fallbackOrigin,
    },
  );
}

/**
 * Извлекает текущие ХП из сущности (актор или существо).
 * У обоих типов HP хранятся в `system.hitPoints.current`.
 *
 * @param entity - сущность (актор или существо)
 * @returns текущие ХП
 */
function getEntityCurrentHp(entity: DnDSceneEntity): number {
  if (isCreatureEntity(entity)) {
    return entity.system.hitPoints.current ?? 0;
  }

  return entity.system.hitPoints.current;
}

/**
 * Извлекает максимальные ХП из сущности (актор или существо).
 *
 * @param entity - сущность (актор или существо)
 * @returns максимальные ХП
 */
function getEntityMaxHp(entity: DnDSceneEntity): number {
  if (isCreatureEntity(entity)) {
    return entity.system.hitPoints.max ?? 0;
  }

  return entity.system.hitPoints.max;
}

/**
 * Устанавливает текущие ХП для сущности (мутация).
 *
 * @param entity - сущность (актор или существо)
 * @param hp - новое значение текущих ХП
 */
function setEntityCurrentHp(entity: DnDSceneEntity, hp: number): void {
  if (isCreatureEntity(entity)) {
    entity.system.hitPoints.current = hp;
  } else if (isActorEntity(entity)) {
    entity.system.hitPoints.current = hp;
  }
}

/**
 * Устанавливает временные ХП для сущности (мутация).
 *
 * @param entity - сущность (актор или существо)
 * @param temp - новое значение временных ХП
 */
function setEntityTempHp(entity: DnDSceneEntity, temp: number): void {
  if (isCreatureEntity(entity)) {
    entity.system.hitPoints.temp = temp;
  } else if (isActorEntity(entity)) {
    entity.system.hitPoints.temp = temp;
  }
}

/**
 * Применяет урон или лечение к сущности (мутирует её ХП) с учётом защит от урона
 * (иммунитет/сопротивление/уязвимость) и правила временных ХП (урон снимает temp
 * первым, лечение их не трогает). Возвращает сводку изменения для UI/чата.
 *
 * @param entity - сущность-цель (обычно глубокая копия для безопасной WS-отправки)
 * @param amount - величина изменения ХП (положительное число)
 * @param isHealing - true = лечение (прибавить), false = урон (вычесть)
 * @param damageType - тип урона (для проверки защит); только для урона
 * @returns сводка результата применения
 */
export function applyTargetDamage(
  entity: DnDSceneEntity,
  amount: number,
  isHealing: boolean,
  damageType?: string,
): DamageApplyResult {
  const hpBefore = getEntityCurrentHp(entity);
  const maxHp = getEntityMaxHp(entity);

  let finalAmount = amount;
  let defenseOutcome: DamageDefenseOutcome = 'normal';

  // Учитываем защиты цели: иммунитет (урон 0), сопротивление (½), уязвимость (×2)
  if (!isHealing && damageType) {
    const stats = resolveActorStats(entity);

    const defenseResult = applyDamageDefenses(
      amount,
      damageType,
      stats.damageDefenses,
    );

    finalAmount = defenseResult.finalDamage;
    defenseOutcome = defenseResult.outcome;
  }

  const tempBefore = entity.system.hitPoints.temp ?? 0;

  // Урон сначала снимает временные ХП (правило 5e), лечение их не трогает
  const hpChange = applyHpChange({
    hpBefore,
    maxHp,
    tempBefore,
    damage: isHealing ? 0 : finalAmount,
    heal: isHealing ? finalAmount : 0,
  });

  setEntityCurrentHp(entity, hpChange.hpAfter);
  setEntityTempHp(entity, hpChange.tempAfter);

  return {
    actorName: entity.name,
    hpBefore,
    hpAfter: hpChange.hpAfter,
    tempAbsorbed: hpChange.tempAbsorbed,
    defenseOutcome,
  };
}

/**
 * Накладывает эффекты на сущность (мутирует список эффектов копии): отсеивает
 * состояния, к которым цель иммунна, собирает полноценные condition-эффекты и
 * сливает с текущими (один и тот же статус ЗАМЕНЯЕТ прежний — 5e 2024). Вызывающий
 * заранее отфильтровал отключённые эффекты.
 *
 * @param entity - сущность-цель (обычно глубокая копия)
 * @param effects - накладываемые эффекты (уже без отключённых)
 * @param origin - источник эффекта (метка в `activeEffects`)
 * @returns обновлённый массив `activeEffects` для записи в сущность
 */
export function applyEffectsToEntity(
  entity: DnDSceneEntity,
  effects: ActiveEffect[],
  origin: EffectOrigin,
): ActiveEffect[] {
  const existing = entity.activeEffects ?? [];

  // Иммунитеты к состояниям: у существ — статические + от активных эффектов,
  // у актёров — от активных эффектов (виды/предметы дают через них). К таким
  // состояниям эффект не накладывается.
  const conditionImmunities = getEntityConditionImmunities(entity);

  // Иммунные состояния отсеиваем
  const applicableEffects = effects.filter((effect) => {
    const conditionKey = resolveEffectConditionKey(effect);

    return !(
      conditionKey && isImmuneToCondition(conditionImmunities, conditionKey)
    );
  });

  // Один и тот же статус не стакается: повтор ЗАМЕНЯЕТ прежний (5e 2024);
  // разные эффекты складываются.
  return mergeAppliedEffects(
    existing,
    applicableEffects.map((effect) => buildEffectForTarget(effect, origin)),
  );
}

/**
 * Возвращает итоговый класс доспеха (КД) сущности с учётом модификаторов.
 * Если передан контекст входящей атаки — учитывает условные бонусы к КД
 * (например, Щит ловли стрел даёт +2 КД от дальнобойных атак).
 *
 * @param entity - сущность-цель
 * @param attackContext - опциональный контекст входящей атаки (melee/ranged/spell)
 * @returns эффективное значение КД
 */
export function getEntityArmorClass(
  entity: DnDSceneEntity,
  attackContext?: IncomingAttackContext,
): number {
  const stats = resolveActorStats(entity);

  let totalAC = stats.armorClass;

  if (attackContext) {
    const effects = collectActiveEffects(entity);

    totalAC += evaluateDefensiveACBonus(effects, attackContext);
  }

  return totalAC;
}

/**
 * Возвращает набор активных флагов сущности (производных от активных эффектов) —
 * используется механикой попаданий/спасбросков для проверки условий.
 *
 * @param entity - сущность-цель
 * @returns множество активных флагов
 */
export function getEntityActiveFlags(
  entity: DnDSceneEntity,
): ReadonlySet<string> {
  return resolveActorStats(entity).activeFlags;
}
