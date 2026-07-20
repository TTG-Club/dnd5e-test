import type {
  AbilityType,
  DamagePartTarget,
  MeasurementTemplate,
  SceneEntity,
  SpellSaveType,
  Token,
  TypedWebSocketClient,
} from '@vtt/shared';
import type {
  ActiveEffect,
  DamageDefenseOutcome,
  DnDSceneEntity,
  Spell,
  TargetHpGate,
} from '@vtt/shared/system/dnd.js';

import { generateId, isCreatureEntity } from '@vtt/shared';
import {
  DAMAGE_TYPE_LABELS,
  resolveEffectApplication,
  stampTurnDuration,
  targetHpGateMatches,
  withInitializedDuration,
} from '@vtt/shared/system/dnd.js';

import { useInitiativeStore } from '@/stores/initiativeStore';

/** Результат спасброска одной цели */
export interface SpellTargetResult {
  /** Имя актора-цели */
  actorName: string;
  /** ID актора */
  actorId: string;
  /** Бросок спасброска (1к20 + modifier) */
  saveRoll?: number;
  /** Модификатор спасброска */
  saveModifier?: number;
  /** Успешен ли спасбросок */
  savePassed?: boolean;
  /** Итоговый урон, применённый к цели */
  damageApplied: number;
  /** Итоговое лечение, применённое к цели (до клампа максимумом HP) */
  healApplied?: number;
  /** HP до применения */
  hpBefore: number;
  /** HP после применения */
  hpAfter: number;
  /** Полученные временные ХП (прирост; 0 — если текущие временные были выше) */
  tempHpGained?: number;
  /** Сработавшая защита от урона (иммунитет/сопротивление/уязвимость) */
  defenseOutcome?: DamageDefenseOutcome;
  /** Названия наложенных эффектов */
  appliedEffects?: string[];
}

/** Контекст для обработки заклинания */
export interface SpellResolutionContext {
  /** Заклинание */
  spell: Spell;
  /** Итоговый урон от броска кастера */
  damageTotal: number;
  /** DC спасброска заклинателя */
  spellSaveDC: number;
  /** Массив сущностей мира (акторы + существа, для поиска по actorId) */
  actors: SceneEntity[];
  /** Сокет для отправки обновлений сущностей */
  socket: TypedWebSocketClient;
  /** Переопределённый тип урона (выбран игроком для заклинаний с damageType: 'choice') */
  overrideDamageType?: string;
  /** ID заклинателя (для маршрутизации частей с target: 'self') */
  casterId?: string;
}

/**
 * Часть урона/лечения с уже разрешённой формулой (вход для броска в модалке).
 */
export interface SpellDamagePartInput {
  /** Формула с подставленными @-переменными (готова для роллера) */
  formula: string;
  /** Основной тип урона (для лечения не используется) */
  type?: string;
  /** Все типы урона части, если их несколько (напр. рубящий+огонь) */
  types?: string[];
  /** Является ли часть лечением */
  isHealing: boolean;
  /** Лечение временными ХП (`@heal.temp`): с текущими временными — большее */
  healTemp?: boolean;
  /** Цель части */
  target: DamagePartTarget;
  /** Применять только если по заклинанию был нанесён урон */
  requiresDamage: boolean;
  /** Гейт по состоянию HP цели (per-target ветка @target.full/@target.notFull) */
  targetGate?: TargetHpGate;
  /** Часть получает усиление высших кругов (слот-скейлинг) при броске */
  applySlotScaling?: boolean;
}

/**
 * Часть урона/лечения с уже брошенным значением (результат броска в модалке).
 */
export interface RolledSpellDamagePart {
  /** Брошенное значение части (сумма) */
  amount: number;
  /** Брошенная формула (после масштабирования/крита), напр. "2к8" */
  formula: string;
  /** Значения отдельных кубиков (для разбивки в чате) */
  values: number[];
  /** Основной тип урона */
  type?: string;
  /** Все типы урона части, если их несколько (напр. рубящий+огонь) */
  types?: string[];
  /** Является ли часть лечением */
  isHealing: boolean;
  /** Лечение временными ХП (`@heal.temp`): с текущими временными — большее */
  healTemp?: boolean;
  /** Цель части */
  target: DamagePartTarget;
  /** Применять только если по заклинанию был нанесён урон */
  requiresDamage: boolean;
  /** Гейт по состоянию HP цели (per-target ветка @target.full/@target.notFull) */
  targetGate?: TargetHpGate;
}

/** Контекст AoE шаблона */
export interface AoeContext {
  /** Шаблон измерения на сцене */
  template: MeasurementTemplate;
  /** Токены сцены */
  tokens: readonly Token[];
  /** Размер клетки в пикселях */
  gridSize: number;
}

/** Результат информации о спасброске актора */
export interface ActorSaveInfo {
  modifier: number;
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  autoFail: boolean;
}

/** Результат броска спасброска */
export interface SavingThrowResult {
  roll: number;
  modifier: number;
  total: number;
  passed: boolean;
}

/**
 * Определяет режим атаки из флагов преимущества/помехи.
 *
 * @param hasAdvantage - есть ли преимущество
 * @param hasDisadvantage - есть ли помеха
 * @returns строковый режим для DiceRollModal
 */
export function determineRollMode(
  hasAdvantage: boolean,
  hasDisadvantage: boolean,
): 'normal' | 'advantage' | 'disadvantage' {
  if (hasAdvantage && !hasDisadvantage) {
    return 'advantage';
  }

  if (hasDisadvantage && !hasAdvantage) {
    return 'disadvantage';
  }

  return 'normal';
}

/**
 * Определяет, использует ли сущность автоматические спасброски.
 *
 * Существа (NPC) по умолчанию всегда используют автоспасброски.
 * Акторы (PC) — только если явно включено `autoSaves === true`.
 *
 * @param entity - сущность-цель
 * @returns true если нужен автоматический спасбросок
 */
export function resolveAutoSaves(entity: SceneEntity): boolean {
  return isCreatureEntity(entity)
    ? (entity.autoSaves ?? true)
    : entity.autoSaves === true;
}

/**
 * Упорядочивает цели для разрешения спасбросков: сначала цели с
 * автоматическим спасброском, затем — с ручным (PC с `autoSaves: false`).
 *
 * Ручные броски открывают DiceRollModal по одному и ждут игрока, поэтому
 * авто-цели обрабатываются первыми — их результаты уходят в чат сразу,
 * не дожидаясь закрытия модалок.
 *
 * @param targets - целевые сущности
 * @param saveType - тип спасброска заклинания
 * @returns цели в порядке «авто → ручные» (без спасброска — исходный порядок)
 */
export function orderTargetsBySaveMode(
  targets: SceneEntity[],
  saveType: SpellSaveType,
): SceneEntity[] {
  if (saveType === 'none') {
    return targets;
  }

  const autoSaveTargets: SceneEntity[] = [];
  const manualSaveTargets: SceneEntity[] = [];

  for (const entity of targets) {
    if (resolveAutoSaves(entity)) {
      autoSaveTargets.push(entity);
    } else {
      manualSaveTargets.push(entity);
    }
  }

  return [...autoSaveTargets, ...manualSaveTargets];
}

/**
 * Возвращает текущее и максимальное HP сущности (для per-target гейтов).
 *
 * @param entity - сущность-цель
 * @returns текущее и максимальное HP
 */
function getEntityHp(entity: SceneEntity): { current: number; max: number } {
  // Ядро видит entity как Base*; в D&D-композабле восстанавливаем D&D-форму
  // (при isCreatureEntity сужается к DnDCreature, иначе — DnDActor).
  const dnd = entity as DnDSceneEntity;

  const current = isCreatureEntity(dnd)
    ? (dnd.system.hitPoints.current ?? 0)
    : dnd.system.hitPoints.current;

  const max = isCreatureEntity(dnd)
    ? (dnd.system.hitPoints.max ?? 0)
    : dnd.system.hitPoints.max;

  return { current, max };
}

/**
 * Определяет, находится ли сущность на полном запасе HP
 * (для per-target гейтов `@target.full`/`@target.notFull`).
 *
 * @param entity - сущность-цель
 * @returns true если текущее HP не меньше максимума
 */
export function isEntityHpFull(entity: SceneEntity): boolean {
  const { current, max } = getEntityHp(entity);

  return current >= max;
}

/**
 * Проверяет, проходит ли часть гейт состояния HP цели.
 *
 * Части без гейта применяются всегда. Гейт `full` пропускает часть только
 * к целям с полным HP, `notFull` — только к раненым, `halfOrLess` — только
 * к целям с HP ≤ половины (отложенное условие «Окровавлен»). Состояние цели
 * оценивается в момент применения, отдельно для каждой цели.
 *
 * @param part - брошенная часть
 * @param entity - сущность-цель
 * @returns true если часть применяется к этой цели
 */
export function partPassesTargetGate(
  part: RolledSpellDamagePart,
  entity: SceneEntity,
): boolean {
  if (!part.targetGate) {
    return true;
  }

  const { current, max } = getEntityHp(entity);

  return targetHpGateMatches(part.targetGate, current, max);
}

/** Подписи гейт-веток состояния HP цели (для чата и описаний выбора цели). */
export const TARGET_GATE_LABELS: Record<TargetHpGate, string> = {
  full: 'при полном HP',
  notFull: 'при неполном HP',
  halfOrLess: 'при HP ≤ половины',
};

/**
 * Формирует суффикс гейт-ветки для строки части в чате.
 *
 * @param targetGate - гейт части (если есть)
 * @returns суффикс вида « (при полном HP)» или пустая строка
 */
export function formatTargetGateSuffix(
  targetGate: TargetHpGate | undefined,
): string {
  return targetGate ? ` (${TARGET_GATE_LABELS[targetGate]})` : '';
}

/**
 * Type guard: является ли тип спасброска характеристикой (не `none`).
 *
 * `SpellSaveType` — это `'none' | AbilityType`, поэтому отсечение `'none'`
 * безопасно сужает значение до `AbilityType` без приведения типов.
 *
 * @param saveType - тип спасброска заклинания
 * @returns true, если это характеристика для спасброска
 */
export function isSaveAbility(
  saveType: SpellSaveType,
): saveType is AbilityType {
  return saveType !== 'none';
}

/**
 * Инициализирует точную turn-длительность эффекта при наложении, подставляя
 * текущий ход энкаунтера. Для не-`turn` эффектов — no-op. Носитель — сущность,
 * на которую ложится эффект; источник — кастер (для якоря `source`).
 *
 * @param effect - накладываемый эффект
 * @param carrierId - id сущности-носителя (цели)
 * @param sourceId - id кастера (если известен)
 * @returns эффект с проставленными sourceActorId/turnSkipFirst (при type 'turn')
 */
export function stampEffectTurnDuration(
  effect: ActiveEffect,
  carrierId: string,
  sourceId?: string,
): ActiveEffect {
  if (effect.duration.type !== 'turn') {
    return effect;
  }

  // Берём текущий ход ТАК ЖЕ, как сервер: сырой entries[currentTurnIndex], а НЕ
  // локально пересортированный список (порядок на сервере и клиенте может
  // разойтись после add/remove участников без переброса инициативы).
  const encounter = useInitiativeStore().encounter;

  const activeTurnActorId =
    encounter && encounter.currentTurnIndex >= 0
      ? (encounter.entries[encounter.currentTurnIndex]?.actorId ?? null)
      : null;

  return stampTurnDuration(effect, { carrierId, sourceId, activeTurnActorId });
}

/**
 * Определяет, нужно ли накладывать эффекты на ЦЕЛЬ заклинания.
 *
 * Накладываются только эффекты, помеченные `effectTarget: 'target'` (эффекты
 * со значением 'self'/без значения предназначены заклинателю — см.
 * `getCasterSpellEffects`). Условие наложения:
 * - У заклинания нет спасброска (saveType === 'none') — атака уже попала
 * - Цель провалила спасбросок
 *
 * @param spell - заклинание
 * @param saveResult - результат спасброска (если был)
 * @returns массив эффектов для наложения на цель или undefined
 */
export function resolveEffectsToApply(
  spell: Spell,
  saveResult: SavingThrowResult | undefined,
): ActiveEffect[] | undefined {
  // На цель кладём только эффекты с effectTarget 'target'; отключённые
  // (тумблер «Отключен» на заклинании) пропускаются.
  const targetEffects = spell.activeEffects?.filter(
    (effect) => !effect.disabled && effect.effectTarget === 'target',
  );

  if (!targetEffects || targetEffects.length === 0) {
    return undefined;
  }

  // Спасбросок уровня заклинания: `landed` = провал спаса (нет спаса → эффект
  // «приземлился», т.к. этот путь зовётся уже по факту попадания/каста). Гейтим
  // ПОЭФФЕКТНО через resolveEffectApplication — иначе ветки «при успехе»
  // (applyOnSuccessOnly) и «при успехе тоже» (applyOnSuccess) не работали бы
  // (старый код слепо отбрасывал ВСЕ эффекты при успешном спасброске).
  const landed = spell.saveType === 'none' || !saveResult?.passed;

  const applied = targetEffects.filter(
    (effect) => resolveEffectApplication(effect, { landed }).applyEffect,
  );

  return applied.length > 0 ? applied : undefined;
}

/**
 * Отбирает «самобафф»-эффекты заклинания, предназначенные самому заклинателю:
 * включённые эффекты с `effectTarget` 'self' (или без значения — это значение
 * по умолчанию). Эффекты, помеченные 'target', исключаются — они ложатся на
 * цель в `resolveEffectsToApply`.
 *
 * Используется для заклинаний без цели-врага (напр. Щит, Доспех мага), у
 * которых эффект должен лечь на кастера.
 *
 * @param spell - заклинание
 * @returns массив эффектов для наложения на заклинателя (может быть пустым)
 */
export function getCasterSpellEffects(spell: Spell): ActiveEffect[] {
  return (spell.activeEffects ?? []).filter(
    (effect) =>
      !effect.disabled && (effect.effectTarget ?? 'self') !== 'target',
  );
}

/**
 * Отбирает эффекты заклинания, предназначенные ЦЕЛИ (`effectTarget: 'target'`):
 * включённые эффекты, которые должны лечь на выбранную цель. В отличие от
 * `resolveEffectsToApply`, не учитывает спасбросок — вызывающий сам решает,
 * когда применять (напр. по попаданию атаки или при касте без броска).
 *
 * @param spell - заклинание
 * @returns массив эффектов для наложения на цель (может быть пустым)
 */
export function getTargetSpellEffects(spell: Spell): ActiveEffect[] {
  return (spell.activeEffects ?? []).filter(
    (effect) => !effect.disabled && effect.effectTarget === 'target',
  );
}

/**
 * Создаёт независимые копии эффектов для наложения на сущность: новый уникальный
 * `id` (чтобы повторные касты не конфликтовали) и `origin: 'spell'`. Применяется
 * к эффектам, накладываемым на заклинателя (target-эффекты идут через
 * `targetStore.applyEffectsToTarget`, у которого свой инстанцирующий хелпер).
 *
 * @param effects - исходные эффекты заклинания
 * @returns новые эффекты, готовые к добавлению в `activeEffects`
 */
export function instantiateSpellEffects(
  effects: ActiveEffect[],
): ActiveEffect[] {
  return effects.map((effect) =>
    withInitializedDuration({
      ...effect,
      id: generateId('effect'),
      origin: 'spell',
    }),
  );
}

/**
 * Возвращает локализованное название типа урона или исходную строку.
 *
 * @param type - тип урона
 * @returns русское название или исходная строка
 */
export function getDamageTypeLabel(
  type: string | undefined,
): string | undefined {
  if (!type) {
    return undefined;
  }

  const labels: Record<string, string> = DAMAGE_TYPE_LABELS;

  return labels[type] ?? type;
}

/**
 * Лейбл вида части: «Лечение» / «Временные ХП» / локализованный тип урона.
 *
 * @param part - часть урона/лечения (брошенная или входная)
 * @param part.isHealing - является ли часть лечением
 * @param part.healTemp - лечение временными ХП (`@heal.temp`)
 * @param part.type - тип урона (для лечения не используется)
 * @param part.types - все типы урона части, если их несколько (рубящий+огонь)
 * @returns подпись вида для чата и описаний
 */
export function getPartKindLabel(part: {
  isHealing: boolean;
  healTemp?: boolean;
  type?: string;
  types?: string[];
}): string {
  if (part.isHealing) {
    return part.healTemp ? 'Временные ХП' : 'Лечение';
  }

  // Несколько типов (напр. рубящий+огонь) — показываем через « и »
  if (part.types && part.types.length > 1) {
    const labels = part.types
      .map((type) => getDamageTypeLabel(type) ?? type)
      .filter(Boolean);

    if (labels.length > 0) {
      return labels.join(' и ');
    }
  }

  return getDamageTypeLabel(part.type) ?? 'Урон';
}

/**
 * Формирует строку разбивки брошенной части для чата: формула, лейбл
 * (тип урона/«Лечение»), гейт-ветка, выпавшие кубики, сумма и маркер защиты.
 *
 * @param rolledPart - брошенная часть
 * @param defenseSuffix - суффикс защиты цели (уязв./сопр./иммун.), если есть
 * @returns строка вида «1к8 Огонь (при полном HP): [5] = 5»
 */
export function formatRolledPartLine(
  rolledPart: RolledSpellDamagePart,
  defenseSuffix = '',
): string {
  const label = getPartKindLabel(rolledPart);

  const gateSuffix = formatTargetGateSuffix(rolledPart.targetGate);

  const diceBreakdown =
    rolledPart.values.length > 0 ? `[${rolledPart.values.join(', ')}] = ` : '';

  return `${rolledPart.formula} ${label}${gateSuffix}: ${diceBreakdown}${rolledPart.amount}${defenseSuffix}`;
}
