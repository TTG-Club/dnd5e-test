/**
 * Автоматизация наложения эффектов: чистые хелперы для применения эффекта при
 * попадании/приземлении с учётом собственного спасброска эффекта (`applySave`)
 * и иммунитета цели к состоянию. Заменяет прежний модуль «райдеров» — теперь
 * спас и урон живут на самом `ActiveEffect`, а не на отдельной обёртке.
 *
 * Все импорты — type-only, чтобы не создавать рантайм-цикл.
 */

import type { ActiveEffect } from './activeEffectTypes.js';
import type { ConditionKey } from './conditionKeys.js';

/**
 * Проверяет, иммунна ли цель к состоянию.
 *
 * @param conditionImmunities - ключи состояний, к которым цель иммунна
 * @param conditionKey - проверяемое состояние
 * @returns `true`, если состояние накладывать нельзя
 */
export function isImmuneToCondition(
  conditionImmunities: readonly string[],
  conditionKey: ConditionKey,
): boolean {
  return conditionImmunities.includes(conditionKey);
}

/**
 * Ключ идентичности статуса для дедупликации: один и тот же статус не
 * стакается. Стандартное состояние сравнивается по `conditionKey`, прочие
 * эффекты — по имени (без регистра), чтобы «Замедление» от разных источников
 * считалось одним статусом.
 *
 * @param effect - эффект
 * @returns стабильный ключ идентичности
 */
function effectIdentityKey(effect: ActiveEffect): string {
  return effect.conditionKey
    ? `condition:${effect.conditionKey}`
    : `name:${effect.name.trim().toLowerCase()}`;
}

/**
 * Сливает накладываемые эффекты в список цели по правилу D&D 5e 2024
 * «Combining Game Effects»: РАЗНЫЕ эффекты складываются (стакаются), а эффекты
 * с тем же именем/`conditionKey` НЕ дублируются — новое наложение ЗАМЕНЯЕТ
 * прежнее (обновляет длительность и берёт более новую/сильную версию,
 * «применяется самый недавний»). Дубли внутри самой пачки тоже схлопываются
 * (побеждает последний). Отключённые эффекты на цели не трогаются.
 *
 * @param current - активные эффекты цели (не мутируется)
 * @param incoming - накладываемые эффекты (уже инстанцированные, со своими id)
 * @returns новый массив активных эффектов цели
 */
export function mergeAppliedEffects(
  current: readonly ActiveEffect[],
  incoming: readonly ActiveEffect[],
): ActiveEffect[] {
  // Схлопываем дубли внутри пачки: при равной идентичности побеждает последний
  const dedupedIncoming: ActiveEffect[] = [];
  const seenIncoming = new Set<string>();

  for (let index = incoming.length - 1; index >= 0; index--) {
    const effect = incoming[index];
    const key = effectIdentityKey(effect);

    if (seenIncoming.has(key)) {
      continue;
    }

    seenIncoming.add(key);
    dedupedIncoming.unshift(effect);
  }

  // Из текущих убираем активные, которые заменяются новыми; отключённые не трогаем
  const replacedKeys = new Set(
    dedupedIncoming.map((effect) => effectIdentityKey(effect)),
  );

  const kept = current.filter(
    (effect) => effect.disabled || !replacedKeys.has(effectIdentityKey(effect)),
  );

  return [...kept, ...dedupedIncoming];
}

/** Результат вычисления применимости эффекта к цели */
export interface EffectApplication {
  /** Вешать ли эффект-состояние на цель */
  applyEffect: boolean;
  /** Множитель урона эффекта (1 = полный, 0.5 = половина, 0 = нет) */
  damageMultiplier: number;
}

/**
 * Определяет, что применяет эффект к цели, по релевантному спасброску.
 *
 * Чистая функция без бросков и IO: броски выполняет оркестратор и передаёт сюда
 * готовые результаты.
 *
 * Релевантный спас:
 * - есть собственный `applySave` → его результат (`applySaveSucceeded`);
 * - иначе → спасбросок уровня действия. `context.landed` уже сворачивает это:
 *   `landed === false` означает «цель прошла спас области», а НЕ «промах»
 *   (промахнувшиеся атаки до этой функции не доходят — оркестратор их не зовёт).
 *
 * Провал спаса → эффект и полный урон. Успех → урон по `onSuccess`
 * (нет/половина), а статус накладывается ТОЛЬКО при `applyOnSuccess`
 * (кейс «по области прокинул, но статус всё равно висит»).
 *
 * @param effect - эффект, накладываемый на цель
 * @param context - результат приземления и (если был) спасброска эффекта
 * @param context.landed - провалена ли защита уровня действия (см. выше)
 * @param context.applySaveSucceeded - прошла ли цель `applySave` (если кидался)
 * @returns применимость эффекта и множитель его урона
 */
export function resolveEffectApplication(
  effect: ActiveEffect,
  context: { landed: boolean; applySaveSucceeded?: boolean },
): EffectApplication {
  // Прошла ли цель релевантный спасбросок?
  const saved = effect.applySave
    ? context.applySaveSucceeded === true
    : !context.landed;

  if (!saved) {
    // Провал спаса: обычно эффект применяется. Исключение — эффект, помеченный
    // «только при успехе» (`applyOnSuccessOnly`): на провале он не накладывается
    // и свой урон не наносит (его место занимает отдельный эффект-на-провал).
    if (effect.applyOnSuccessOnly === true) {
      return { applyEffect: false, damageMultiplier: 0 };
    }

    return { applyEffect: true, damageMultiplier: 1 };
  }

  // Успешный спасбросок. Статус накладывается, если эффект помечен
  // `applyOnSuccess` ИЛИ `applyOnSuccessOnly`. Множитель урона: для
  // «только при успехе» — полный (это его штатный исход), иначе по `onSuccess`
  // ('half' — половина, 'negate' — нет урона).
  const applyEffect =
    effect.applyOnSuccess === true || effect.applyOnSuccessOnly === true;

  let damageMultiplier = 0;

  if (effect.applyOnSuccessOnly === true) {
    damageMultiplier = 1;
  } else if (effect.applySave?.onSuccess === 'half') {
    damageMultiplier = 0.5;
  }

  return { applyEffect, damageMultiplier };
}
