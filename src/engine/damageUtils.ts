/**
 * Утилиты расчёта урона с учётом защит D&D 5e.
 *
 * Универсальный модуль: содержит только чистые функции и не зависит от
 * конкретного типа сущности. Сбор защит выполняется в `effectPipeline`
 * (из статического `system.defenses` и флагов активных эффектов), а здесь —
 * применение защит к числу урона и разбор «сырых» списков защит.
 *
 * Благодаря этому любая сущность (актор, существо, будущие типы), прошедшая
 * через `resolveActorStats`, автоматически учитывает иммунитеты,
 * сопротивления и уязвимости.
 */

import type { DefensibleDamageType } from '@vtt/shared';
// DamageApplyResult / DamageDefenseOutcome — нейтральные контрактные типы (живут в
// system/contracts/combat), D&D их лишь реэкспортит для своих потребителей.
import type {
  DamageApplyResult,
  DamageDefenseOutcome,
} from '@vtt/shared';

import { DEFENSIBLE_DAMAGE_TYPES } from './damageConstants.js';

export type { DamageApplyResult, DamageDefenseOutcome };

/** Урон при иммунитете (полностью игнорируется) */
const IMMUNITY_DAMAGE = 0;

/** Множитель урона при сопротивлении (урон уменьшается вдвое) */
const RESISTANCE_MULTIPLIER = 0.5;

/** Множитель урона при уязвимости (урон удваивается) */
const VULNERABILITY_MULTIPLIER = 2;

/**
 * Набор защит сущности от урона по типам.
 *
 * Каждое множество содержит ключи типов урона `DefensibleDamageType`.
 * Используется как `ReadonlySet`, чтобы расчётные функции не мутировали вход.
 */
export interface DamageDefenses {
  /** Иммунитеты: урон игнорируется (множитель 0) */
  readonly immunities: ReadonlySet<DefensibleDamageType>;
  /** Сопротивления: урон уменьшается вдвое (множитель 0.5) */
  readonly resistances: ReadonlySet<DefensibleDamageType>;
  /** Уязвимости: урон удваивается (множитель 2) */
  readonly vulnerabilities: ReadonlySet<DefensibleDamageType>;
}

/** Результат применения защит к урону */
export interface DamageDefenseResult {
  /** Итоговый урон после учёта защит (целое число, не меньше 0) */
  finalDamage: number;
  /** Какая защита сработала (для подписи в чате) */
  outcome: DamageDefenseOutcome;
}

/** Результат применения урона/лечения к хитам с учётом временных ХП */
export interface HpChangeResult {
  /** Текущие ХП после применения */
  hpAfter: number;
  /** Временные ХП после применения (до начисления новых временных) */
  tempAfter: number;
  /** Урон, поглощённый временными ХП */
  tempAbsorbed: number;
}

/**
 * Применяет урон и лечение к хитам с учётом временных ХП (правило 5e):
 * урон сначала снимает временные хиты, остаток вычитается из текущих;
 * лечение восстанавливает только текущие ХП (не выше максимума) и
 * не затрагивает временные.
 *
 * @param params - параметры применения
 * @param params.hpBefore - текущие ХП до применения
 * @param params.maxHp - максимальные ХП
 * @param params.tempBefore - временные ХП до применения
 * @param params.damage - суммарный урон (после защит/спасброска)
 * @param params.heal - суммарное лечение
 * @returns текущие/временные ХП после применения и поглощённый урон
 */
export function applyHpChange(params: {
  hpBefore: number;
  maxHp: number;
  tempBefore: number;
  damage: number;
  heal: number;
}): HpChangeResult {
  const damage = Math.max(0, params.damage);
  const tempAbsorbed = Math.min(Math.max(0, params.tempBefore), damage);
  const damageToHp = damage - tempAbsorbed;

  const hpAfter = Math.max(
    0,
    Math.min(
      params.maxHp,
      params.hpBefore - damageToHp + Math.max(0, params.heal),
    ),
  );

  return {
    hpAfter,
    tempAfter: Math.max(0, params.tempBefore) - tempAbsorbed,
    tempAbsorbed,
  };
}

/**
 * Формирует короткую русскую пометку о сработавшей защите для меток и сводок.
 *
 * @param outcome - сработавшая категория защиты
 * @returns суффикс вида ` (иммун.)` или пустая строка
 */
export function formatDamageDefenseSuffix(
  outcome: DamageDefenseOutcome | undefined,
): string {
  switch (outcome) {
    case 'immunity':
      return ' (иммун.)';
    case 'resistance':
      return ' (сопр.)';
    case 'vulnerability':
      return ' (уязв.)';
    default:
      return '';
  }
}

/**
 * Приводит произвольную строку к ключу типа урона `DefensibleDamageType`.
 *
 * @param value - сырое значение (тип урона заклинания/оружия или из БД)
 * @returns корректный ключ типа урона или `null`, если не распознан
 */
export function normalizeDamageType(
  value: string | undefined | null,
): DefensibleDamageType | null {
  if (!value) {
    return null;
  }

  const matched = DEFENSIBLE_DAMAGE_TYPES.find((entry) => entry === value);

  return matched ?? null;
}

/**
 * Разбирает «сырой» список защит (массив строк) в множество ключей урона.
 *
 * Неизвестные значения (`bypass-*`, пользовательские записи) отбрасываются,
 * так как они не относятся к моделируемым типам урона.
 *
 * @param raw - значение из `system.defenses.*` (SQL↔TS boundary: может быть не массивом)
 * @returns множество распознанных типов урона
 */
export function parseDamageDefenseList(
  raw: unknown,
): Set<DefensibleDamageType> {
  const result = new Set<DefensibleDamageType>();

  if (!Array.isArray(raw)) {
    return result;
  }

  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue;
    }

    const normalized = normalizeDamageType(entry);

    if (normalized !== null) {
      result.add(normalized);
    }
  }

  return result;
}

/**
 * Собирает статические защиты из объекта `system` сущности.
 *
 * Универсально работает с любой сущностью, у которой есть поле `defenses`
 * (существа и любые будущие типы). У акторов поле отсутствует — вернётся
 * пустой набор, а их защиты придут из флагов активных эффектов.
 *
 * @param system - объект `actor.system` (актор/существо)
 * @returns набор статических защит сущности
 */
export function collectStaticDamageDefenses(system: object): {
  immunities: Set<DefensibleDamageType>;
  resistances: Set<DefensibleDamageType>;
  vulnerabilities: Set<DefensibleDamageType>;
} {
  if (!('defenses' in system)) {
    return {
      immunities: new Set(),
      resistances: new Set(),
      vulnerabilities: new Set(),
    };
  }

  const defenses = system.defenses;

  if (typeof defenses !== 'object' || defenses === null) {
    return {
      immunities: new Set(),
      resistances: new Set(),
      vulnerabilities: new Set(),
    };
  }

  return {
    immunities:
      'immunities' in defenses
        ? parseDamageDefenseList(defenses.immunities)
        : new Set(),
    resistances:
      'resistances' in defenses
        ? parseDamageDefenseList(defenses.resistances)
        : new Set(),
    vulnerabilities:
      'vulnerabilities' in defenses
        ? parseDamageDefenseList(defenses.vulnerabilities)
        : new Set(),
  };
}

/**
 * Применяет защиты сущности к числу урона по правилам D&D 5e.
 *
 * Порядок:
 * 1. Иммунитет → урон 0.
 * 2. Иначе множитель: уязвимость (×2) и сопротивление (×0.5).
 *    При одновременном наличии — взаимно компенсируются (итог ×1).
 * 3. Результат округляется вниз и не может быть меньше 0.
 *
 * Лечение и урон без типа должны обрабатываться вызывающей стороной
 * (защиты к ним не применяются).
 *
 * @param baseDamage - исходный урон до учёта защит
 * @param damageType - тип урона (строка; нераспознанный трактуется как «без типа»)
 * @param defenses - набор защит цели
 * @returns итоговый урон и сработавшая категория защиты
 */
export function applyDamageDefenses(
  baseDamage: number,
  damageType: string | undefined | null,
  defenses: DamageDefenses,
): DamageDefenseResult {
  const normalizedType = normalizeDamageType(damageType);

  if (normalizedType === null) {
    return {
      finalDamage: Math.max(0, Math.floor(baseDamage)),
      outcome: 'normal',
    };
  }

  if (defenses.immunities.has(normalizedType)) {
    return { finalDamage: IMMUNITY_DAMAGE, outcome: 'immunity' };
  }

  const isResistant = defenses.resistances.has(normalizedType);
  const isVulnerable = defenses.vulnerabilities.has(normalizedType);

  let multiplier = 1;

  if (isVulnerable) {
    multiplier *= VULNERABILITY_MULTIPLIER;
  }

  if (isResistant) {
    multiplier *= RESISTANCE_MULTIPLIER;
  }

  const finalDamage = Math.max(0, Math.floor(baseDamage * multiplier));

  let outcome: DamageDefenseOutcome = 'normal';

  if (isResistant && !isVulnerable) {
    outcome = 'resistance';
  } else if (isVulnerable && !isResistant) {
    outcome = 'vulnerability';
  }

  return { finalDamage, outcome };
}

/**
 * Применяет защиты к урону, который имеет НЕСКОЛЬКО типов одновременно
 * (напр. «рубящий и огненный» от одной кости). Выбирается результат, наиболее
 * выгодный для защищающегося: итоговый урон = минимум по всем типам (иммунитет
 * к любому → 0; сопротивление любому → половина; уязвимость учитывается только
 * если она по всем типам и ни по одному нет нормального/сопротивления).
 *
 * Один тип (или пустой список) сводится к {@link applyDamageDefenses}.
 *
 * @param baseDamage - исходный урон до учёта защит
 * @param damageTypes - типы урона части (может быть один или несколько)
 * @param defenses - набор защит цели
 * @returns наименьший итоговый урон и соответствующая категория защиты
 */
export function applyMultiTypeDamageDefenses(
  baseDamage: number,
  damageTypes: readonly (string | undefined | null)[] | undefined,
  defenses: DamageDefenses,
): DamageDefenseResult {
  const types = (damageTypes ?? []).filter((type): type is string => !!type);

  if (types.length <= 1) {
    return applyDamageDefenses(baseDamage, types[0], defenses);
  }

  let best: DamageDefenseResult | null = null;

  for (const type of types) {
    const result = applyDamageDefenses(baseDamage, type, defenses);

    if (best === null || result.finalDamage < best.finalDamage) {
      best = result;
    }
  }

  return (
    best ?? {
      finalDamage: Math.max(0, Math.floor(baseDamage)),
      outcome: 'normal',
    }
  );
}
