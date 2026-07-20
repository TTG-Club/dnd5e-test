/**
 * Боевая обработка активных эффектов D&D 5e на границах хода: тик длительностей,
 * точные turn-эффекты, периодический урон (DoT) и повторные спасброски, а также
 * разовое срабатывание эффектов области/ауры.
 *
 * Логика системо-зависима (спасброски по характеристикам, типы урона, HP-модель
 * D&D), поэтому живёт в `system/dnd/`. Ядро вызывает её через контракт
 * `VttSystem` (`runTurnEffects`/`expireTurnEffects`/`decrementEffectDurations`),
 * не импортируя этот файл напрямую — см. `docs/MULTI_SYSTEM_ARCHITECTURE.md`, Фаза 0.
 */

import type { AbilityType, DamagePart } from '@vtt/shared';
import type {
  ActiveEffect,
  EffectSaveTiming,
  ResolvedActorStats,
} from './activeEffectTypes.js';
import type { DnDSceneEntity } from './dndEntities.js';

import { isActorEntity, isCreatureEntity } from '@vtt/shared';
import { generateId } from '@vtt/shared';
import { DAMAGE_TYPE_LABELS } from './damageConstants.js';
import { applyHpChange, applyMultiTypeDamageDefenses } from './damageUtils.js';
import { rollDamageFormula } from './diceFormula.js';
import { resolveActorStats } from './effectPipeline.js';
import { expandDamageParts } from './spellUtils.js';

/**
 * Уменьшает длительность (в раундах) всех эффектов на сущности (актёре или существе).
 * Удаляет эффекты, чьё время вышло.
 * @param entity - сущность, чьи эффекты нужно обновить
 * @returns true, если сущность была модифицирована
 */
export function decrementActorEffectDurations(entity: DnDSceneEntity): boolean {
  if (!entity.activeEffects || entity.activeEffects.length === 0) {
    return false;
  }

  let hasChanges = false;

  const initialLength = entity.activeEffects.length;

  entity.activeEffects = entity.activeEffects.filter((effect) => {
    if (
      effect.duration.type === 'rounds'
      && typeof effect.duration.remaining === 'number'
    ) {
      effect.duration.remaining -= 1;
      hasChanges = true;

      if (effect.duration.remaining <= 0) {
        return false; // Эффект истек, не оставляем в массиве
      }
    }

    return true;
  });

  return hasChanges || entity.activeEffects.length !== initialLength;
}

/**
 * Готовит эффект к наложению на цель: при длительности в раундах инициализирует
 * `remaining` из `value`, если он ещё не задан. Без этого rounds-эффект не
 * тикает в бою — `decrementActorEffectDurations` уменьшает только заданный
 * `remaining`, и эффект висел бы до ручного снятия.
 *
 * @param effect - накладываемый эффект
 * @returns эффект с инициализированным `remaining` (или исходный)
 */
export function withInitializedDuration(effect: ActiveEffect): ActiveEffect {
  const duration = effect.duration;

  if (
    duration.type === 'rounds'
    && typeof duration.value === 'number'
    && typeof duration.remaining !== 'number'
  ) {
    return {
      ...effect,
      duration: { ...duration, remaining: duration.value },
    };
  }

  return effect;
}

/** Контекст наложения эффекта для инициализации точной длительности `type: 'turn'` */
export interface TurnDurationContext {
  /** id носителя — сущности, на которую ложится эффект */
  carrierId: string;
  /** id источника (кастера/атакующего), если известен */
  sourceId?: string;
  /** id участника, чей сейчас ход в активном энкаунтере (null/undefined вне боя) */
  activeTurnActorId?: string | null;
}

/**
 * Инициализирует точную длительность `type: 'turn'` в момент наложения эффекта.
 *
 * Проставляет `sourceActorId` (для якоря `source` — «до хода кастера») и флаг
 * `turnSkipFirst`: если эффект наложен ВО ВРЕМЯ хода якоря и истекает в КОНЦЕ
 * хода, то конец текущего хода — это «этот», а не «следующий» ход, поэтому
 * первую границу пропускаем (семантика D&D «до конца твоего СЛЕДУЮЩЕГО хода»).
 * Для начала хода пропуск не нужен — начало текущего хода уже прошло.
 *
 * Для не-`turn` длительностей возвращает эффект без изменений.
 *
 * @param effect - накладываемый эффект
 * @param context - контекст наложения (носитель/источник/текущий ход)
 * @returns эффект с инициализированной turn-длительностью
 */
export function stampTurnDuration(
  effect: ActiveEffect,
  context: TurnDurationContext,
): ActiveEffect {
  const duration = effect.duration;

  if (duration.type !== 'turn') {
    return effect;
  }

  const anchor = duration.turnAnchor ?? 'carrier';
  const timing = duration.turnTiming ?? 'end';

  const anchorId = anchor === 'source' ? context.sourceId : context.carrierId;

  const skipFirst =
    timing === 'end'
    && context.activeTurnActorId != null
    && anchorId === context.activeTurnActorId;

  return {
    ...effect,
    sourceActorId:
      anchor === 'source'
        ? (context.sourceId ?? effect.sourceActorId)
        : effect.sourceActorId,
    duration: { ...duration, turnTiming: timing, turnSkipFirst: skipFirst },
  };
}

/**
 * Снимает с сущности точные turn-эффекты, чья граница хода наступила. Должна
 * вызываться на старте/в конце хода участника `turnActorId` для КАЖДОГО
 * участника энкаунтера (источник-якорь живёт на чужой сущности).
 *
 * Уважает `turnSkipFirst`: первая подходящая граница только снимает флаг, эффект
 * остаётся; следующая граница — снимает эффект.
 *
 * @param entity - сущность, чьи эффекты проверяем
 * @param turnActorId - id участника, чей ход сейчас обрабатывается
 * @param timing - граница: начало или конец хода
 * @returns true, если эффекты сущности изменились
 */
export function expireTurnEffects(
  entity: DnDSceneEntity,
  turnActorId: string,
  timing: 'start' | 'end',
): boolean {
  if (!entity.activeEffects || entity.activeEffects.length === 0) {
    return false;
  }

  let changed = false;

  entity.activeEffects = entity.activeEffects.filter((effect) => {
    const duration = effect.duration;

    if (duration.type !== 'turn' || (duration.turnTiming ?? 'end') !== timing) {
      return true;
    }

    const anchor = duration.turnAnchor ?? 'carrier';

    // Якорь источника без проставленного sourceActorId (наложен по пути без
    // контекста кастера) деградирует к носителю — иначе эффект не истёк бы
    // никогда (anchorId === undefined не совпал бы ни с чьим ходом).
    const anchorId =
      anchor === 'source' ? (effect.sourceActorId ?? entity.id) : entity.id;

    if (anchorId !== turnActorId) {
      return true; // граница не нашего якоря
    }

    if (duration.turnSkipFirst) {
      // Пропускаем первую границу (ход наложения), снимаем флаг — эффект живёт.
      effect.duration = { ...duration, turnSkipFirst: false };
      changed = true;

      return true;
    }

    changed = true;

    return false; // граница «следующего» хода — снимаем эффект
  });

  return changed;
}

/** Исход одного повторного спасброска эффекта (начало/конец хода) */
export interface TurnSaveOutcome {
  /** Название эффекта */
  effectName: string;
  /** Характеристика спасброска */
  ability: AbilityType;
  /** Сложность */
  dc: number;
  /** Выпавшее на кости значение (1–20) */
  roll: number;
  /** Итог с модификатором */
  total: number;
  /** Успешен ли спас (эффект снят) */
  passed: boolean;
}

/** Исход периодического урона (DoT) одного эффекта за тик */
export interface TurnDamageOutcome {
  /** Название эффекта */
  effectName: string;
  /** Итог урона после защит цели */
  total: number;
  /** Типы урона (для подписи в чате) */
  types: string[];
  /** Выпавшие значения кубиков (для отображения) */
  values: number[];
}

/** Результат обработки периодических эффектов по сущности за один тик хода */
export interface TurnEffectsResult {
  /** Были ли изменения (снят эффект и/или нанесён урон) */
  changed: boolean;
  /** Суммарный нанесённый DoT-урон */
  damageTotal: number;
  /** Исходы повторных спасбросков */
  saveOutcomes: TurnSaveOutcome[];
  /** Исходы периодического урона */
  damageOutcomes: TurnDamageOutcome[];
}

/** Русские подписи характеристик для сообщений о тиках эффектов */
const ABILITY_SHORT_LABELS: Record<AbilityType, string> = {
  strength: 'Сила',
  dexterity: 'Ловкость',
  constitution: 'Телосложение',
  intelligence: 'Интеллект',
  wisdom: 'Мудрость',
  charisma: 'Харизма',
};

/**
 * Применяет чистый урон к сущности ОДНИМ изменением HP (сначала временные
 * хиты, затем текущие — правило 5e). Мутирует `entity.system.hitPoints`.
 *
 * Используется и периодическим уроном (DoT при смене хода), и разовым уроном
 * эффектов области/ауры (при входе/выходе).
 *
 * @param entity - сущность
 * @param damage - суммарный урон
 */
export function applyDamageToEntity(
  entity: DnDSceneEntity,
  damage: number,
): void {
  const hitPoints = entity.system.hitPoints;
  const hpBefore = hitPoints.current ?? 0;
  const maxHp = hitPoints.max ?? 0;
  const tempBefore = hitPoints.temp ?? 0;

  const hpChange = applyHpChange({
    hpBefore,
    maxHp,
    tempBefore,
    damage,
    heal: 0,
  });

  // Узкая запись по типу сущности — иначе union `system` не сужается для присваивания
  if (isCreatureEntity(entity)) {
    entity.system.hitPoints.current = hpChange.hpAfter;
    entity.system.hitPoints.temp = hpChange.tempAfter;
  } else if (isActorEntity(entity)) {
    entity.system.hitPoints.current = hpChange.hpAfter;
    entity.system.hitPoints.temp = hpChange.tempAfter;
  }
}

/**
 * Катает урон одной нагрузки `DamagePart[]` с учётом защит цели и возвращает
 * исход для подписи в чате. Сегментирует части (`@dmg.<type>`), кидает кости и
 * применяет иммунитеты/сопротивления/уязвимости. Лечащие части и контекстные
 * `@`-формулы пропускаются (сервер их не катает). Возвращает `null`, если урона
 * не получилось (нет ненулевых сегментов).
 *
 * @param effectName - название эффекта (для подписи)
 * @param damageParts - части урона эффекта
 * @param stats - resolved-статы цели (нужны защиты от урона)
 * @returns исход урона или `null`
 */
export function rollEffectDamage(
  effectName: string,
  damageParts: DamagePart[],
  stats: ResolvedActorStats,
): TurnDamageOutcome | null {
  const segments = expandDamageParts(
    damageParts,
    undefined,
    (formula) => formula,
  );

  let effectTotal = 0;

  const effectValues: number[] = [];
  const effectTypes: string[] = [];

  for (const segment of segments) {
    // Урон не лечит; @-формулы (контекстные) сервер не катает
    if (segment.isHealing || segment.formula.includes('@')) {
      continue;
    }

    const rolled = rollDamageFormula(segment.formula);
    const types = segment.types ?? (segment.type ? [segment.type] : []);

    let damage = rolled.total;

    if (types.length > 0) {
      damage = applyMultiTypeDamageDefenses(
        damage,
        types,
        stats.damageDefenses,
      ).finalDamage;

      for (const type of types) {
        if (!effectTypes.includes(type)) {
          effectTypes.push(type);
        }
      }
    }

    effectTotal += damage;
    effectValues.push(...rolled.values);
  }

  if (effectTotal <= 0) {
    return null;
  }

  return {
    effectName,
    total: effectTotal,
    types: effectTypes,
    values: effectValues,
  };
}

/** Исход срабатывания эффекта области/ауры при входе/выходе */
export interface EntryEffectResult {
  /** Исход урона (если был) — для подписи в чате */
  damageOutcome: TurnDamageOutcome | null;
  /** Исход спасброска при наложении (если был) — для подписи в чате */
  saveOutcome: TurnSaveOutcome | null;
  /** Повешена ли длящаяся копия-статус на цель (мутация `activeEffects`) */
  statusApplied: boolean;
}

/**
 * Срабатывание разового эффекта области/ауры (`enter`/`exit`): при наличии
 * `applySave` катает спасбросок цели, затем наносит урон `damageParts` (полный
 * при провале/без спаса; половина или 0 при успехе по `onSuccess`) и, если у
 * эффекта есть длящаяся нагрузка (флаги/changes/состояние), вешает её копию как
 * самостоятельный эффект со своей длительностью.
 *
 * Мутирует `entity.system.hitPoints` (урон) и `entity.activeEffects` (статус).
 *
 * @param entity - сущность, на которую действует эффект
 * @param effect - эффект области/ауры (с `areaTrigger` `enter`/`exit`)
 * @returns исходы урона и спасброска для подписи в чате
 */
export function resolveEntryEffect(
  entity: DnDSceneEntity,
  effect: ActiveEffect,
): EntryEffectResult {
  const stats = resolveActorStats(entity);

  let saveOutcome: TurnSaveOutcome | null = null;
  let savePassed = false;

  if (effect.applySave) {
    const { ability, dc } = effect.applySave;
    const modifier = stats.saves[ability] ?? 0;
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + modifier;

    savePassed = total >= dc;

    saveOutcome = {
      effectName: effect.name,
      ability,
      dc,
      roll,
      total,
      passed: savePassed,
    };
  }

  // Урон: полный при провале/без спаса; по onSuccess при успехе
  let damageOutcome: TurnDamageOutcome | null = null;

  const onSuccess = effect.applySave?.onSuccess;
  const damageNegated = savePassed && onSuccess === 'negate';

  if (effect.damageParts && effect.damageParts.length > 0 && !damageNegated) {
    const rolled = rollEffectDamage(effect.name, effect.damageParts, stats);

    if (rolled) {
      const halved = savePassed && onSuccess === 'half';
      const total = halved ? Math.floor(rolled.total / 2) : rolled.total;

      if (total > 0) {
        applyDamageToEntity(entity, total);
        damageOutcome = { ...rolled, total };
      }
    }
  }

  // Длящаяся нагрузка (статус): вешаем самостоятельной копией, живущей по своей
  // длительности (не привязана к области, так как триггер разовый). При успешном
  // спасе со снятием нагрузки (`negate` без `applyOnSuccess`) — не вешаем.
  const hasStatusPayload =
    effect.flags.length > 0
    || effect.changes.length > 0
    || Boolean(effect.conditionKey)
    || Boolean(effect.recurringDamage)
    || Boolean(effect.recurringSave);

  const statusNegated =
    savePassed && onSuccess === 'negate' && !effect.applyOnSuccess;

  let statusApplied = false;

  if (hasStatusPayload && !statusNegated) {
    if (!entity.activeEffects) {
      entity.activeEffects = [];
    }

    entity.activeEffects.push(
      withInitializedDuration({
        ...effect,
        id: generateId('ae'),
        origin: 'condition',
        originId: undefined,
        areaTrigger: undefined,
        transfer: false,
        // Разовая нагрузка уже отыграна — на длящейся копии её не оставляем
        damageParts: undefined,
        applySave: undefined,
      }),
    );

    statusApplied = true;
  }

  return { damageOutcome, saveOutcome, statusApplied };
}

/**
 * Прогоняет периодические эффекты сущности для указанного момента хода
 * (начало/конец): сперва наносит DoT-урон (`recurringDamage`), затем катает
 * повторные спасброски (`recurringSave`) — успех снимает эффект.
 *
 * Бросает прямой спас 1к20 + модификатор спасброска цели против `dc` (без
 * преим./помехи). Мутирует `entity.activeEffects` и `entity.system.hitPoints`.
 *
 * @param entity - сущность, чей момент хода обрабатывается
 * @param timing - момент: начало или конец хода
 * @returns урон, исходы бросков и были ли изменения
 */
export function processTurnEffects(
  entity: DnDSceneEntity,
  timing: EffectSaveTiming,
): TurnEffectsResult {
  const empty: TurnEffectsResult = {
    changed: false,
    damageTotal: 0,
    saveOutcomes: [],
    damageOutcomes: [],
  };

  if (!entity.activeEffects || entity.activeEffects.length === 0) {
    return empty;
  }

  const stats = resolveActorStats(entity);

  // 1. Периодический урон (DoT) по таймингу
  const damageOutcomes: TurnDamageOutcome[] = [];

  let damageTotal = 0;

  for (const effect of entity.activeEffects) {
    const recurringDamage = effect.recurringDamage;

    if (!recurringDamage || recurringDamage.timing !== timing) {
      continue;
    }

    const outcome = rollEffectDamage(
      effect.name,
      recurringDamage.damageParts,
      stats,
    );

    if (outcome) {
      damageTotal += outcome.total;
      damageOutcomes.push(outcome);
    }
  }

  if (damageTotal > 0) {
    applyDamageToEntity(entity, damageTotal);
  }

  // 2. Повторные спасброски по таймингу — успех снимает эффект
  const saveOutcomes: TurnSaveOutcome[] = [];
  const initialLength = entity.activeEffects.length;

  const remaining = entity.activeEffects.filter((effect) => {
    const recurring = effect.recurringSave;

    if (!recurring || recurring.timing !== timing) {
      return true;
    }

    const modifier = stats.saves[recurring.ability] ?? 0;
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + modifier;
    const passed = total >= recurring.dc;

    saveOutcomes.push({
      effectName: effect.name,
      ability: recurring.ability,
      dc: recurring.dc,
      roll,
      total,
      passed,
    });

    // Успех снимает эффект, провал — оставляет
    return !passed;
  });

  const effectsRemoved = remaining.length !== initialLength;

  if (effectsRemoved) {
    entity.activeEffects = remaining;
  }

  return {
    changed: damageTotal > 0 || effectsRemoved,
    damageTotal,
    saveOutcomes,
    damageOutcomes,
  };
}

/**
 * Форматирует сводку периодических эффектов за тик хода в текст для чата.
 *
 * @param entityName - имя сущности
 * @param timing - момент хода (начало/конец)
 * @param result - результат `processTurnEffects`
 * @returns строка для чата или `null`, если показывать нечего
 */
export function formatTurnEffectsMessage(
  entityName: string,
  timing: EffectSaveTiming,
  result: TurnEffectsResult,
): string | null {
  const when = timing === 'startOfTurn' ? 'начало хода' : 'конец хода';

  return formatEffectsSummary(
    entityName,
    when,
    result.damageOutcomes,
    result.saveOutcomes,
    (save) => (save.passed ? '✓ снят' : '✗ держится'),
  );
}

/**
 * Общий форматтер сводки сработавших эффектов в строку чата.
 *
 * @param entityName - имя сущности
 * @param whenLabel - подпись момента (напр. «начало хода», «вход в область»)
 * @param damageOutcomes - исходы урона
 * @param saveOutcomes - исходы спасбросков
 * @param formatSaveStatus - как подписать итог спасброска (зависит от контекста:
 *   периодический спас снимает эффект, спас при наложении отменяет/уменьшает урон)
 * @returns строка для чата или `null`, если показывать нечего
 */
export function formatEffectsSummary(
  entityName: string,
  whenLabel: string,
  damageOutcomes: TurnDamageOutcome[],
  saveOutcomes: TurnSaveOutcome[],
  formatSaveStatus: (save: TurnSaveOutcome) => string,
): string | null {
  if (damageOutcomes.length === 0 && saveOutcomes.length === 0) {
    return null;
  }

  const lines = [`Эффекты (${whenLabel}): ${entityName}`];
  const damageLabels: Record<string, string> = DAMAGE_TYPE_LABELS;

  for (const damage of damageOutcomes) {
    const typeLabel =
      damage.types.map((type) => damageLabels[type] ?? type).join('/')
      || 'урон';

    const breakdown =
      damage.values.length > 0 ? `[${damage.values.join(', ')}] = ` : '';

    lines.push(
      `${damage.effectName}: ${breakdown}−${damage.total} HP (${typeLabel})`,
    );
  }

  for (const save of saveOutcomes) {
    const abilityLabel = ABILITY_SHORT_LABELS[save.ability];

    lines.push(
      `${save.effectName}: спас ${abilityLabel} [${save.roll}] = ${save.total} vs ${save.dc} — ${formatSaveStatus(save)}`,
    );
  }

  return lines.join('\n');
}
