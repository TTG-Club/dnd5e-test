/**
 * Утилиты боевой механики заклинаний D&D 5.5e.
 *
 * Содержит чистые функции для расчёта атаки заклинанием,
 * формул урона с учётом усиления и масштабирования заговоров.
 */

import type { AbilityType, MeasurementTemplateType } from '@vtt/shared';
import type {
  DamagePart,
  DamagePartTarget,
  DamageType,
} from '@vtt/shared';
import type { ResolvedActorStats } from './activeEffectTypes.js';
import type { DnDActor, Spell, SpellProjectiles } from './dndEntities.js';

import {
  calculateAbilityModifier,
  calculateProficiencyBonus,
} from './calculations.js';
import { getTotalLevel } from './classTypes.js';
import { getSpellDamageParts } from './damageParts.js';
import {
  buildFormulaContext,
  substituteFormulaVariables,
} from './formulaParser.js';

// ── Расчёт атаки ─────────────────────────────────────────────

/**
 * Определяет характеристику заклинания для актора.
 *
 * Приоритет:
 * 1. `spell.attackAbility` (переопределение на самом заклинании)
 * 2. `actor.system.spellcastingAbility` (глобальное переопределение)
 * 3. `ActorClassEntry.spellcastingAbility` (из класса)
 * 4. Fallback: 'intelligence'
 *
 * @param actor - актор-владелец
 * @param spell - заклинание
 * @returns характеристика заклинания
 */
export function resolveSpellcastingAbility(
  actor: DnDActor,
  spell: Spell,
): AbilityType {
  if (spell.attackAbility) {
    return spell.attackAbility;
  }

  const systemAbility = actor.system?.spellcastingAbility;

  if (systemAbility) {
    return systemAbility;
  }

  const casterClass = actor.system?.classes?.find(
    (entry) => entry.spellcastingAbility != null,
  );

  return casterClass?.spellcastingAbility ?? 'intelligence';
}

/**
 * Рассчитывает модификатор атаки заклинанием.
 *
 * Формула: мод. характеристики + бонус мастерства + attack.spell + доп. бонус
 *
 * @param actor - актор-владелец
 * @param spell - заклинание
 * @param resolvedStats - итоговые статы из пайплайна
 * @returns модификатор атаки заклинанием
 */
export function calculateSpellAttackModifier(
  actor: DnDActor,
  spell: Spell,
  resolvedStats?: ResolvedActorStats,
): number {
  const ability = resolveSpellcastingAbility(actor, spell);

  // Мод характеристики и бонус мастерства берём из ИТОГОВЫХ статов (с учётом
  // Active Effects, в т.ч. бонусов к самому стату), иначе — из базовых значений.
  let modifier: number;

  if (resolvedStats) {
    modifier =
      resolvedStats.abilityMods[ability]
      ?? calculateAbilityModifier(actor.system?.abilities?.[ability] ?? 10);

    modifier += resolvedStats.proficiencyBonus;
  } else {
    modifier = calculateAbilityModifier(
      actor.system?.abilities?.[ability] ?? 10,
    );

    modifier += calculateProficiencyBonus(getTotalLevel(actor.system?.classes));
  }

  // Доп. бонус на заклинании
  if (spell.attackBonus) {
    modifier += spell.attackBonus;
  }

  // Бонусы от Active Effects (attack.spell)
  if (resolvedStats) {
    modifier += resolvedStats.attackBonuses.spell;
  }

  return modifier;
}

/**
 * Тип броска атаки заклинанием, если каст сопровождается броском попадания.
 *
 * Единая точка решения «атака или нет» для всех путей каста (карточка актёра,
 * хотбар-макрос): рукопашная/дальнобойная доставка без авто-попадания.
 * Лечащие заклинания (Молитва исцеления и др. с deliveryType ranged) броска
 * попадания не делают — без этой отсечки снарядный путь запускал бы серию
 * атак по союзникам (одиночный путь спасала проверка isHealing в модалке).
 * Наличие выбранной цели здесь не учитывается — это контекст броска,
 * его проверяет DiceRollModal в момент показа/броска.
 *
 * @param spell - заклинание
 * @returns 'melee'/'ranged' для заклинаний-атак, иначе undefined
 */
export function getSpellAttackType(
  spell: Spell,
): 'melee' | 'ranged' | undefined {
  if (spell.autoHit || spellIsHealing(spell)) {
    return undefined;
  }

  // Заклинание со спасброском и БЕЗ урона — не атака: бросок попадания не
  // делается, исход решает спасбросок цели (Удержание личности, Слепота и т.п.).
  // Атаку с уроном и спасброском-райдером (редкий случай) не трогаем — там
  // бросок попадания нужен, поэтому проверяем отсутствие урона.
  if (spell.saveType && spell.saveType !== 'none' && !spellHasDamage(spell)) {
    return undefined;
  }

  if (spell.deliveryType === 'melee' || spell.deliveryType === 'ranged') {
    return spell.deliveryType;
  }

  return undefined;
}

// ── Снаряды (projectiles) ────────────────────────────────────

/** Контекст расчёта числа снарядов на касте. */
export interface ProjectileCountContext {
  /** Круг ячейки, выбранный на касте (для уровневых заклинаний) */
  slotLevel?: number;
  /** Уровень персонажа-заклинателя (для заговоров) */
  casterLevel?: number;
}

/**
 * Возвращает снарядный режим заклинания.
 *
 * Источник истины — ТОЛЬКО явный блок `spell.projectiles`; `targetCount` —
 * информационное «число целей эффекта» и распределение по целям не включает.
 *
 * @param spell - заклинание
 * @returns снарядный режим или undefined (обычное заклинание)
 */
export function getSpellProjectiles(
  spell: Spell,
): SpellProjectiles | undefined {
  return spell.projectiles;
}

/**
 * Считает число снарядов заклинания для контекста каста.
 *
 * Заговоры масштабируются порогами уровня персонажа (`countByCharacterLevel`:
 * берётся наибольший порог `level ≤` уровня; ниже первого порога — базовое
 * `count`). Уровневые заклинания — линейно: `+perSlotLevel` снарядов за
 * каждый круг ячейки выше базового.
 *
 * @param spell - заклинание
 * @param context - круг ячейки и/или уровень персонажа
 * @returns число снарядов (0 — заклинание не снарядное)
 */
export function getSpellProjectileCount(
  spell: Spell,
  context: ProjectileCountContext = {},
): number {
  const projectiles = getSpellProjectiles(spell);

  if (!projectiles) {
    return 0;
  }

  if (spell.level === 0) {
    const tiers = [...(projectiles.countByCharacterLevel ?? [])].sort(
      (tierA, tierB) => tierA.level - tierB.level,
    );

    let count = projectiles.count;

    for (const tier of tiers) {
      if ((context.casterLevel ?? 1) >= tier.level) {
        count = tier.count;
      }
    }

    return count;
  }

  let count = projectiles.count;

  if (
    projectiles.perSlotLevel
    && context.slotLevel !== undefined
    && context.slotLevel > spell.level
  ) {
    count += (context.slotLevel - spell.level) * projectiles.perSlotLevel;
  }

  return count;
}

// ── Формулы урона ────────────────────────────────────────────

/** Регулярное выражение для поиска кубиков в формуле */
const DICE_FORMULA_REGEX = /^(\d+)(к|d)(\d+)/i;

// ── Условные слагаемые по состоянию цели (@target.full/@target.notFull) ──

/** Регэксп условного токена цели для удаления из слагаемого. */
const TARGET_CONDITION_STRIP_REGEX = /\s*@target\.(?:full|notFull)\b\s*/gi;

/** Регэксп определения ветки условного токена цели в слагаемом. */
const TARGET_CONDITION_DETECT_REGEX = /@target\.(full|notFull)\b/i;

/**
 * Снимает условные токены цели `@target.full`/`@target.notFull` из формулы
 * (для отображения, когда состояние цели неизвестно). Кубиковая нотация не
 * затрагивается.
 *
 * Пример: `"1к8@target.full + 1к12@target.notFull"` → `"1к8 + 1к12"`.
 *
 * @param formula - формула с возможными токенами @target
 * @returns формула без токенов @target
 */
export function stripTargetTokens(formula: string): string {
  if (!formula || !/@target\./i.test(formula)) {
    return formula ?? '';
  }

  return formula
    .replace(TARGET_CONDITION_STRIP_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Применяет условные токены цели к формуле как ГЕЙТ НА СЛАГАЕМОЕ.
 *
 * Слагаемое (между `+`), содержащее `@target.full`, остаётся только если у цели
 * полный запас хитов; `@target.notFull` — только если цель ранена. Неактивное
 * слагаемое удаляется ЦЕЛИКОМ (а не зануляется) — это важно: хвостовые слагаемые
 * без типа (напр. `@mod.spell`) затем прилипают к типу активной ветки в
 * {@link splitFormulaByDamageType}, а не плодят «осиротевший» типизированный урон.
 *
 * Звёздочка не используется: голый токен гасит своё слагаемое.
 *
 * Пример (isFull=true):
 * `"1к8@dmg.psychic@target.full + 1к12@dmg.lightning@target.notFull + @mod.spell"`
 * → `"1к8@dmg.psychic + @mod.spell"`.
 *
 * @param formula - формула с условными токенами @target
 * @param isFull - у цели полный запас хитов
 * @returns формула с оставленными активными слагаемыми (токены сняты)
 */
export function applyTargetConditionals(
  formula: string,
  isFull: boolean,
): string {
  if (!formula || !/@target\./i.test(formula)) {
    return formula ?? '';
  }

  const kept: string[] = [];

  for (const rawTerm of formula.split('+')) {
    const match = rawTerm.match(TARGET_CONDITION_DETECT_REGEX);

    if (!match) {
      const term = rawTerm.trim();

      if (term.length > 0) {
        kept.push(term);
      }

      continue;
    }

    const wantsFull = match[1].toLowerCase() === 'full';
    const include = wantsFull ? isFull : !isFull;

    if (!include) {
      continue;
    }

    const cleaned = rawTerm.replace(TARGET_CONDITION_STRIP_REGEX, '').trim();

    if (cleaned.length > 0) {
      kept.push(cleaned);
    }
  }

  return kept.join(' + ').trim();
}

/**
 * Формирует ОТОБРАЖЕНИЕ формулы с условными ветками `@target` в виде
 * «ветка_полного ИЛИ ветка_раненого + общие_слагаемые».
 *
 * Взаимоисключающие слагаемые (`@target.full` / `@target.notFull`) показываются
 * через «или», а безусловные слагаемые (напр. `@mod.spell`) выносятся один раз
 * после них. Если условных токенов нет — возвращает обычное отображение.
 *
 * Только для UI: строка содержит «или» и НЕ предназначена для роллера (каст
 * использует {@link applyTargetConditionals}). Резолв @-переменных и нотации
 * (@mod → число, d→к) выполняет переданный `resolveTerm` на стороне вызова.
 *
 * Пример (resolveTerm = strip):
 * `"1к8@dmg.psychic@target.full + 1к12@dmg.lightning@target.notFull + @mod.spell"`
 * → `"1к8 или 1к12 + @mod.spell"`.
 *
 * @param formula - формула части (возможно с токенами @target)
 * @param resolveTerm - резолвер набора слагаемых в отображаемую строку
 * @returns строка для отображения
 */
export function formatConditionalDamageDisplay(
  formula: string,
  resolveTerm: (subFormula: string) => string,
): string {
  if (!formula || !/@target\./i.test(formula)) {
    return resolveTerm(stripTargetTokens(formula ?? ''));
  }

  const fullTerms: string[] = [];
  const notFullTerms: string[] = [];
  const commonTerms: string[] = [];

  for (const rawTerm of formula.split('+')) {
    const match = rawTerm.match(TARGET_CONDITION_DETECT_REGEX);
    const cleaned = rawTerm.replace(TARGET_CONDITION_STRIP_REGEX, '').trim();

    if (cleaned.length === 0) {
      continue;
    }

    if (!match) {
      commonTerms.push(cleaned);
    } else if (match[1].toLowerCase() === 'full') {
      fullTerms.push(cleaned);
    } else {
      notFullTerms.push(cleaned);
    }
  }

  const fullStr = resolveTerm(fullTerms.join(' + ')).trim();
  const notFullStr = resolveTerm(notFullTerms.join(' + ')).trim();

  let branch: string;

  if (fullStr && notFullStr) {
    branch = `${fullStr} или ${notFullStr}`;
  } else {
    branch = fullStr || notFullStr;
  }

  const commonStr =
    commonTerms.length > 0 ? resolveTerm(commonTerms.join(' + ')).trim() : '';

  if (commonStr) {
    return branch ? `${branch} + ${commonStr}` : commonStr;
  }

  return branch;
}

/**
 * Разрешает @-переменные в формуле урона/лечения заклинания для конкретного актора.
 *
 * Подставляет числовые значения вместо `@mod.str`, `@mod.spell`, `@prof` и т.д.,
 * оставляя кубиковую нотацию (`1к4`) нетронутой — результат готов для роллера.
 * Токен `@mod.spell` разрешается в модификатор заклинательной характеристики
 * (с учётом возможного переопределения через `spell.attackAbility`).
 *
 * Используется во всех точках броска урона заклинанием (хотбар, лист персонажа),
 * чтобы поведение `@`-переменных было единым.
 *
 * Если переданы `resolvedStats` (итог пайплайна Active Effects), модификаторы
 * характеристик берутся из них — с учётом всех внешних бонусов к стату. Без них
 * используется базовое значение характеристики (legacy-поведение).
 *
 * @param spell - заклинание
 * @param actor - актор-заклинатель
 * @param baseFormula - формула для подстановки (по умолчанию — первая часть
 *   из `getSpellDamageParts`)
 * @param resolvedStats - итоговые статы из пайплайна (для бонусов от эффектов)
 * @returns формула с подставленными значениями @-переменных
 */
export function resolveSpellDamageFormula(
  spell: Spell,
  actor: DnDActor,
  baseFormula?: string,
  resolvedStats?: ResolvedActorStats,
  targetIsFull?: boolean,
): string {
  // Инлайн-токены типа урона @dmg.<type> и лечения @heal/@heal.temp — это
  // метки, НЕ переменные роллера. Снимаем их до подстановки, иначе
  // resolveVariable падает «Неизвестная переменная». (Многочастный путь уже
  // разносит метки по сегментам через splitFormulaByDamageType; здесь strip
  // защищает legacy/одиночные пути.)
  let formula = stripHealTokens(
    stripDamageTypeTokens(
      baseFormula ?? getSpellDamageParts(spell)[0]?.formula ?? '',
    ),
  );

  // Условные слагаемые по состоянию цели (@target.full/@target.notFull):
  // при известном состоянии цели (каст) — гасим неактивные слагаемые целиком;
  // без контекста цели (отображение) — просто снимаем токены, показывая
  // базовые кости. После этого @target в формуле не остаётся.
  if (formula.includes('@target')) {
    formula =
      targetIsFull === undefined
        ? stripTargetTokens(formula)
        : applyTargetConditionals(formula, targetIsFull);
  }

  if (!formula || !formula.includes('@')) {
    return formula;
  }

  const context = buildFormulaContext(actor);
  const spellAbility = resolveSpellcastingAbility(actor, spell);

  // С resolvedStats модификаторы учитывают внешние бонусы (Active Effects),
  // поэтому переопределяем как @mod.spell, так и @mod.<характеристика>.
  if (resolvedStats) {
    const abilities: AbilityType[] = [
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ];

    for (const ability of abilities) {
      const mod = resolvedStats.abilityMods[ability];

      if (mod !== undefined) {
        context.abilities[ability] = {
          value:
            resolvedStats.abilities[ability]
            ?? context.abilities[ability].value,
          mod,
        };
      }
    }

    context.spellMod =
      resolvedStats.abilityMods[spellAbility]
      ?? calculateAbilityModifier(
        actor.system?.abilities?.[spellAbility] ?? 10,
      );
  } else {
    context.spellMod = calculateAbilityModifier(
      actor.system?.abilities?.[spellAbility] ?? 10,
    );
  }

  return substituteFormulaVariables(formula, context);
}

// ── Инлайн-токены типа урона (@dmg.<type>) и лечения (@heal) ─

/** Регэксп инлайн-токена типа урона: `@dmg.fire`, `@dmg.cold` и т.п. */
const DAMAGE_TYPE_TOKEN_REGEX = /@dmg\.([a-z]+)/i;

/**
 * Вид лечения сегмента формулы: обычные хиты (`@heal`) или временные ХП
 * (`@heal.temp`). Временные ХП не суммируются с текущими — берётся большее.
 */
export type HealKind = 'hp' | 'temp';

/**
 * Регэксп инлайн-токена лечения: `@heal` (хиты) или `@heal.temp` (врем. ХП).
 * Лукэхед запрещает хвост (`@heal.spell` НЕ матчится и всплывёт ошибкой
 * парсера формул, а не молча станет лечением).
 */
const HEAL_TOKEN_REGEX = /@heal(\.temp)?(?![\w.])/i;

/** Глобальная версия {@link HEAL_TOKEN_REGEX} для вырезания токенов. */
const HEAL_TOKEN_STRIP_REGEX = /@heal(\.temp)?(?![\w.])/gi;

/** Сегмент формулы урона с привязанным типом (после разбора @dmg.<type>). */
export interface TypedDamageSegment {
  /** Кубиковая формула сегмента (без токенов @dmg/@heal) */
  formula: string;
  /** Основной тип урона сегмента (первый из @dmg или базовый тип части) */
  type?: string;
  /**
   * Все типы урона сегмента, если их несколько (напр. «рубящий и огненный» от
   * `@dmg.slashing@dmg.fire`). Задан только при 2+ типах; иначе используется
   * одиночный `type`. Защиты по нескольким типам — наиболее выгодные цели.
   */
  types?: string[];
  /** Вид лечения сегмента (`@heal`/`@heal.temp`); undefined — сегмент урона */
  healing?: HealKind;
}

/**
 * Удаляет инлайн-токены лечения `@heal`/`@heal.temp` из формулы
 * (для отображения и legacy-путей, где формула идёт в роллер целиком).
 *
 * @param formula - формула с возможными токенами @heal
 * @returns формула без токенов @heal (лишние пробелы схлопнуты)
 */
export function stripHealTokens(formula: string): string {
  if (!formula || !HEAL_TOKEN_REGEX.test(formula)) {
    return formula ?? '';
  }

  return formula
    .replace(HEAL_TOKEN_STRIP_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Определяет вид лечения из первого инлайн-токена `@heal`/`@heal.temp`.
 *
 * Формула — единственный источник истины вида части (legacy-флаг
 * `DamagePart.isHealing` удалён).
 *
 * @param formula - формула с возможным токеном @heal
 * @returns вид лечения или null, если токена нет
 */
export function detectFormulaHealKind(formula: string): HealKind | null {
  const match = formula.match(HEAL_TOKEN_REGEX);

  if (!match) {
    return null;
  }

  return match[1] ? 'temp' : 'hp';
}

/**
 * Проверяет, лечит ли часть урона: токен `@heal`/`@heal.temp` в формуле.
 *
 * @param part - часть урона/лечения заклинания
 * @returns true если часть лечит (хиты или временные ХП)
 */
export function damagePartIsHealing(part: DamagePart): boolean {
  return HEAL_TOKEN_REGEX.test(part.formula);
}

/**
 * Есть ли у заклинания части урона/лечения.
 *
 * Замена проверок устаревшего поля `spell.damageFormula` в гейтах
 * «открывать ли модалку броска» / «применять ли auto-hit».
 *
 * @param spell - заклинание
 * @returns true если есть хотя бы одна часть урона/лечения
 */
export function spellHasDamage(spell: Spell): boolean {
  return getSpellDamageParts(spell).length > 0;
}

/**
 * Лечит ли заклинание по своей первой (базовой) части.
 *
 * Замена устаревшего флага `spell.isHealing` для одноформульных путей
 * (списки, карточки, single-target резолюция).
 *
 * @param spell - заклинание
 * @returns true если базовая часть лечит (хиты или временные ХП)
 */
export function spellIsHealing(spell: Spell): boolean {
  const primaryPart = getSpellDamageParts(spell)[0];

  return primaryPart !== undefined && damagePartIsHealing(primaryPart);
}

/**
 * Лечит ли заклинание ВРЕМЕННЫМИ ХП по своей первой (базовой) части
 * (токен `@heal.temp` в формуле).
 *
 * Используется одноформульными путями (снаряды, одиночная цель), чтобы
 * применить правило temp-хитов «не суммируются — берётся большее» вместо
 * прибавления к текущим хитам.
 *
 * @param spell - заклинание
 * @returns true если базовая часть даёт временные ХП
 */
export function spellHealsTempHp(spell: Spell): boolean {
  const primaryPart = getSpellDamageParts(spell)[0];

  return (
    primaryPart !== undefined
    && detectFormulaHealKind(primaryPart.formula) === 'temp'
  );
}

/**
 * Тип урона первой (базовой) части заклинания.
 *
 * Замена устаревшего поля `spell.damageType` для одноформульных путей.
 * Для лечащей базовой части возвращает undefined (как и legacy-поле,
 * которое не заполнялось у лечащих заклинаний).
 *
 * @param spell - заклинание
 * @returns тип урона базовой части или undefined
 */
export function getSpellPrimaryDamageType(
  spell: Spell,
): DamageType | undefined {
  const primaryPart = getSpellDamageParts(spell)[0];

  if (!primaryPart || damagePartIsHealing(primaryPart)) {
    return undefined;
  }

  return (primaryPart.type
    ?? detectFormulaDamageType(primaryPart.formula)
    ?? undefined) as DamageType | undefined;
}

/**
 * Устанавливает/заменяет токен `@heal`/`@heal.temp` на ПЕРВОМ слагаемом формулы
 * (аналог {@link setFormulaDamageType}): первое слагаемое — «базовое», его вид
 * наследуют последующие слагаемые без собственного токена.
 *
 * Используется миграцией формы: устаревший флаг `isHealing` переносится в
 * формулу. Пустой `kind` — удаляет токен с первого слагаемого.
 *
 * @param formula - исходная формула
 * @param kind - вид лечения (или пустая строка для удаления)
 * @returns формула с обновлённым токеном лечения на первом слагаемом
 */
export function setFormulaHealKind(
  formula: string,
  kind: HealKind | '',
): string {
  const terms = formula.split('+').map((term) => term.trim());

  const firstBase = (terms[0] ?? '').replace(HEAL_TOKEN_STRIP_REGEX, '').trim();

  if (kind) {
    const token = kind === 'temp' ? '@heal.temp' : '@heal';

    terms[0] = `${firstBase}${token}`;
  } else {
    terms[0] = firstBase;
  }

  return terms.filter((term) => term.length > 0).join(' + ');
}

/**
 * Удаляет инлайн-токены типа урона `@dmg.<type>` из формулы (для отображения).
 *
 * @param formula - формула с возможными токенами @dmg
 * @returns формула без токенов @dmg (лишние пробелы схлопнуты)
 */
export function stripDamageTypeTokens(formula: string): string {
  if (!formula || !/@dmg\./i.test(formula)) {
    return formula ?? '';
  }

  return formula
    .replace(/@dmg\.[a-z]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Определяет тип урона из первого инлайн-токена `@dmg.<type>` в формуле.
 *
 * Используется как канонический источник типа части (формула — источник истины).
 *
 * @param formula - формула с возможным токеном @dmg
 * @returns тип урона (lowercase) или null, если токена нет
 */
export function detectFormulaDamageType(formula: string): string | null {
  const match = formula.match(DAMAGE_TYPE_TOKEN_REGEX);

  return match ? match[1].toLowerCase() : null;
}

/**
 * Устанавливает/заменяет токен `@dmg.<type>` на ПЕРВОМ слагаемом формулы.
 *
 * Первое слагаемое — «базовое»; его тип задаёт тип всех последующих слагаемых
 * без собственного токена (см. поток типов в `splitFormulaByDamageType`).
 * Пустой `type` — удаляет токен с первого слагаемого.
 *
 * Примеры: `setFormulaDamageType("1к8", "fire")` → `"1к8@dmg.fire"`;
 * `setFormulaDamageType("1к8@dmg.fire + @mod.spell", "cold")`
 * → `"1к8@dmg.cold + @mod.spell"`.
 *
 * @param formula - исходная формула
 * @param type - тип урона (или пустая строка для удаления)
 * @returns формула с обновлённым токеном типа на первом слагаемом
 */
export function setFormulaDamageType(formula: string, type: string): string {
  const terms = formula.split('+').map((term) => term.trim());

  const firstBase = (terms[0] ?? '')
    .replace(DAMAGE_TYPE_TOKEN_REGEX, '')
    .trim();

  terms[0] = type ? `${firstBase}@dmg.${type}` : firstBase;

  return terms.filter((term) => term.length > 0).join(' + ');
}

/**
 * Разбивает формулу урона на сегменты по инлайн-токенам вида:
 * `@dmg.<type>` (тип урона) и `@heal`/`@heal.temp` (лечение/временные ХП).
 *
 * Слагаемые верхнего уровня (разделённые `+`) группируются по виду с ПОТОКОМ
 * вида слева направо: токен `@dmg.cold` (или `@heal`) задаёт «текущий вид» для
 * своего слагаемого и всех последующих слагаемых без собственного токена.
 * Стартовое значение — `defaultType`. Токены вида взаимоисключающие: `@heal`
 * сбрасывает тип урона (сегмент лечения не типизирован), `@dmg` — лечение.
 * Токен вырезается из формулы (роллер его не видит), гейты `@target.*` и
 * вычитания остаются внутри слагаемого.
 *
 * Примеры (defaultType=fire):
 * - `"1к6 + 1к4@dmg.cold"` → `[{1к6, fire}, {1к4, cold}]`
 * - `"1к8@dmg.fire + @mod.spell"` → `[{"1к8 + @mod.spell", fire}]`
 * - `"2к4@heal + @mod.spell"` → `[{"2к4 + @mod.spell", heal:hp}]`
 * - `"1к8@dmg.fire + 2к4@heal.temp"` → `[{1к8, fire}, {2к4, heal:temp}]`
 *
 * Если токенов нет — возвращается один сегмент с исходной формулой
 * (нулевое изменение для обычных формул).
 *
 * @param formula - формула урона (возможно с @dmg.<type>/@heal)
 * @param defaultType - базовый тип части (стартовый «текущий тип»)
 * @returns массив сегментов с типом/видом лечения
 */
export function splitFormulaByDamageType(
  formula: string,
  defaultType?: string,
): TypedDamageSegment[] {
  if (
    !formula
    || (!/@dmg\./i.test(formula) && !HEAL_TOKEN_REGEX.test(formula))
  ) {
    return [{ formula: formula ?? '', type: defaultType }];
  }

  /** Ключ-маркер для слагаемых без явного вида (базовый тип/лечение части). */
  const DEFAULT_KEY = ' default';

  interface SegmentGroup {
    type?: string;
    types?: string[];
    healing?: HealKind;
    terms: string[];
  }

  const groupOrder: SegmentGroup[] = [];
  const groupByKey = new Map<string, SegmentGroup>();

  // «Текущий вид» течёт слева направо: токен меняет его, безтокенные
  // слагаемые наследуют последний установленный вид (так @mod после базового
  // типа остаётся в той же группе урона/лечения, а не отделяется в безвидовую).
  // Слагаемое может нести НЕСКОЛЬКО токенов @dmg → несколько типов сразу.
  let currentTypes: string[] = defaultType ? [defaultType] : [];
  let currentHealing: HealKind | undefined;

  for (const term of formula.split('+')) {
    const healMatch = term.match(HEAL_TOKEN_REGEX);
    const typeMatches = [...term.matchAll(/@dmg\.([a-z]+)/gi)];

    if (healMatch) {
      currentHealing = healMatch[1] ? 'temp' : 'hp';
      currentTypes = [];
    } else if (typeMatches.length > 0) {
      currentTypes = typeMatches.map((match) => match[1].toLowerCase());
      currentHealing = undefined;
    }

    const cleaned = term
      .replace(HEAL_TOKEN_STRIP_REGEX, '')
      .replace(/@dmg\.[a-z]+/gi, '')
      .trim();

    if (cleaned.length === 0) {
      continue;
    }

    const key = currentHealing
      ? `heal:${currentHealing}`
      : currentTypes.join('+') || DEFAULT_KEY;

    let group = groupByKey.get(key);

    if (!group) {
      group = {
        type: currentTypes[0],
        types: currentTypes.length > 1 ? [...currentTypes] : undefined,
        healing: currentHealing,
        terms: [],
      };

      groupByKey.set(key, group);
      groupOrder.push(group);
    }

    group.terms.push(cleaned);
  }

  return groupOrder.map((group) => ({
    formula: group.terms.join(' + '),
    type: group.type,
    types: group.types,
    healing: group.healing,
  }));
}

/** Сводка одной части урона/лечения для read-only отображения. */
export interface DamagePartInfo {
  /**
   * Формула для показа: без инлайн-токенов `@dmg`/`@heal`, условные ветки
   * `@target.*` через «или», кости в русском виде (`1d8` → `1к8`).
   * @-переменные НЕ подставляются (это «определение», не каст).
   */
  formula: string;
  /** Является ли часть лечением */
  isHealing: boolean;
  /** Лечение временными ХП (`@heal.temp`) */
  isTemp: boolean;
  /** Уникальные типы урона части (ключи; пусто для чистого лечения) */
  types: string[];
}

/**
 * Единое описание части урона/лечения для отображения (списки, карточки,
 * детали — и заклинаний, и оружия). Источник истины — формула: типы и вид
 * лечения берутся из инлайн-токенов `@dmg`/`@heal` (с fallback на `part.type`),
 * несколько типов на одной кости поддерживаются.
 *
 * @param part - часть урона/лечения
 * @returns формула без токенов, флаги лечения и список типов урона
 */
export function describeDamagePart(part: DamagePart): DamagePartInfo {
  const segments = splitFormulaByDamageType(part.formula, part.type);

  const typeList = segments.flatMap(
    (segment) => segment.types ?? (segment.type ? [segment.type] : []),
  );

  return {
    formula: formatConditionalDamageDisplay(part.formula, (subFormula) =>
      stripHealTokens(stripDamageTypeTokens(subFormula)),
    ).replace(/(\d+)d(\d+)/gi, '$1к$2'),
    isHealing: segments.some((segment) => segment.healing !== undefined),
    isTemp: segments.some((segment) => segment.healing === 'temp'),
    types: [...new Set(typeList)],
  };
}

/**
 * Гейт части по состоянию HP цели. `full`/`notFull` — из токенов
 * `@target.full`/`@target.notFull`; `halfOrLess` («Окровавлен», HP ≤ половины) —
 * из отложенного условия `target.hp.*` change-а бонус-урона, когда единой цели
 * на касте нет (AoE / снаряды) и условие оценивается per-target при применении.
 */
export type TargetHpGate = 'full' | 'notFull' | 'halfOrLess';

/**
 * Формула бонус-урона из Active Effect, прошедшая сбор условий.
 * Выход `collectBonusDamageFormulas` (effectPipeline) и вход
 * {@link resolveBonusDamageParts}.
 */
export interface BonusDamageFormula {
  /** Формула костей из значения change (напр. «2к6@dmg.fire@target.full») */
  formula: string;
  /**
   * Отложенный гейт условия `target.hp.*`: на касте единой цели нет (AoE /
   * снаряды), поэтому условие change не оценено, а превращено в per-target
   * гейт — оркестратор проверит HP каждой цели в момент применения.
   */
  conditionGate?: TargetHpGate;
}

/**
 * Сводит отложенный гейт условия change и гейт-ветку токенов `@target.*`
 * в один гейт части.
 *
 * Ветки токенов бывают только `full`/`notFull`. Несовместимая комбинация
 * (условие «полное HP» с веткой `notFull` и наоборот) означает, что часть
 * не применится ни к одной цели — возвращается `null` (ветка отбрасывается).
 * `halfOrLess` уточняет `notFull` (HP ≤ половины всегда «не полное»).
 *
 * @param conditionGate - гейт из условия change (если был отложен)
 * @param branchGate - гейт ветки токенов @target.* (если есть)
 * @returns итоговый гейт (возможно undefined — без гейта) или null (отбросить)
 */
function combineTargetGates(
  conditionGate: TargetHpGate | undefined,
  branchGate: TargetHpGate | undefined,
): { gate: TargetHpGate | undefined } | null {
  if (!conditionGate) {
    return { gate: branchGate };
  }

  if (!branchGate) {
    return { gate: conditionGate };
  }

  if (branchGate === 'full') {
    return conditionGate === 'full' ? { gate: 'full' } : null;
  }

  // branchGate === 'notFull': условие полного HP несовместимо,
  // notFull/halfOrLess — берём более узкий гейт условия.
  return conditionGate === 'full' ? null : { gate: conditionGate };
}

/** Разрешённая часть урона/лечения, готовая к броску в модалке. */
export interface ResolvedDamagePartInput {
  /** Формула с подставленными @-переменными (готова для роллера) */
  formula: string;
  /** Основной тип урона (для лечения не используется) */
  type?: string;
  /** Все типы урона части, если их несколько (напр. рубящий+огонь) */
  types?: string[];
  /** Является ли часть лечением */
  isHealing: boolean;
  /**
   * Лечение временными ХП (`@heal.temp`): значение не прибавляется к текущим
   * хитам, а становится временными ХП цели (с текущими временными — большее).
   * Имеет смысл только при `isHealing: true`.
   */
  healTemp?: boolean;
  /** Цель части */
  target: DamagePartTarget;
  /** Применять только если по заклинанию был нанесён урон */
  requiresDamage: boolean;
  /**
   * Гейт по состоянию HP цели: часть применяется только к целям в этом
   * состоянии. Появляется, когда состояние цели на касте неизвестно
   * (AoE / цель не выбрана) и формула содержит `@target.*` — оркестратор
   * выбирает ветку отдельно для каждой цели (per-target).
   */
  targetGate?: TargetHpGate;
  /**
   * Часть получает усиление высших кругов (слот-скейлинг) в модалке броска.
   * Помечается первый сегмент КАЖДОЙ гейт-ветки первой урон-части: к цели
   * применяется только одна из веток, поэтому двойного усиления нет.
   */
  applySlotScaling: boolean;
}

/**
 * Разворачивает части урона заклинания в готовые к броску части с разрешёнными
 * формулами и разнесёнными по типам сегментами (@dmg.<type>).
 *
 * Для каждой части:
 * 1. условные слагаемые `@target.*` раскладываются по веткам состояния цели:
 *    при известном состоянии (одиночная цель) остаётся одна ветка без гейта;
 *    при неизвестном (AoE / цель не выбрана) — обе ветки с `targetGate`,
 *    оркестратор применит к каждой цели только ветку её состояния (per-target);
 * 2. формула ветки разбивается на типизированные сегменты
 *    (`splitFormulaByDamageType`);
 * 3. @-переменные (@mod.*) разрешаются (`resolveSpellDamageFormula`).
 *
 * Каждый сегмент становится отдельной частью со своим типом — переиспользует
 * существующий многочастный пайплайн (свои защиты/сопротивления на тип).
 *
 * @param spell - заклинание
 * @param actor - заклинатель
 * @param parts - части урона заклинания (из getSpellDamageParts)
 * @param resolvedStats - итоговые статы (для @mod.* с учётом эффектов)
 * @param targetIsFull - состояние HP цели для @target.* (одиночная цель);
 *   undefined — состояние неизвестно, ветки раскладываются per-target
 * @returns массив разрешённых частей (по сегментам)
 */
export function resolveDamagePartsForCast(
  spell: Spell,
  actor: DnDActor,
  parts: DamagePart[],
  resolvedStats?: ResolvedActorStats,
  targetIsFull?: boolean,
): ResolvedDamagePartInput[] {
  return expandDamageParts(
    parts,
    targetIsFull,
    (formula) =>
      resolveSpellDamageFormula(
        spell,
        actor,
        formula,
        resolvedStats,
        targetIsFull,
      ),
    { assignScaling: true },
  );
}

/**
 * Разворачивает части урона существа (`CreatureAction.damageParts`) в готовые к
 * броску части — тот же движок сегментации/гейтов/лечения, что и у заклинаний и
 * оружия, без `DnDActor`.
 *
 * Формулы существ плоские (модификатор уже вшит, напр. «1к8 + 3»), поэтому
 * @-переменные обычно отсутствуют. Если они всё же есть (homebrew с `@mod.str`),
 * подставляются из характеристик самого существа; невалидный токен (напр.
 * `@mod.spell` — у существа нет заклинательной характеристики) не валит бросок:
 * сегмент возвращается как есть. Слот-скейлинг существам не применяется.
 *
 * @param parts - части урона/лечения действия существа
 * @param targetIsFull - состояние HP цели для @target.* (undefined — per-target)
 * @param creature - существо-источник (для редких @-переменных в формуле)
 * @returns массив разрешённых частей (по сегментам)
 */
export function resolveCreatureDamageParts(
  parts: DamagePart[],
  targetIsFull?: boolean,
  creature?: import('./dndEntities.js').Creature,
): ResolvedDamagePartInput[] {
  return expandDamageParts(parts, targetIsFull, (formula) => {
    if (!formula.includes('@') || !creature) {
      return formula;
    }

    try {
      return substituteFormulaVariables(formula, buildFormulaContext(creature));
    } catch {
      return formula;
    }
  });
}

/**
 * Подпись кнопки броска при касте заклинания существа.
 *
 * @param usesAttack - есть ли бросок попадания (атакующее заклинание)
 * @param isHealing - лечащее ли заклинание
 * @returns текст кнопки («Атаковать» / «Бросить лечение» / «Бросить урон»)
 */
export function getCreatureSpellRollButtonText(
  usesAttack: boolean,
  isHealing: boolean,
): string {
  if (usesAttack) {
    return 'Атаковать';
  }

  return isHealing ? 'Бросить лечение' : 'Бросить урон';
}

/**
 * Модификатор заклинательной характеристики существа (для токена `@mod.spell`).
 * Если заклинательная характеристика не задана — 0.
 *
 * @param creature - существо
 * @returns модификатор `floor((значение - 10) / 2)` или 0
 */
export function getCreatureSpellMod(
  creature: import('./dndEntities.js').Creature,
): number {
  const ability = creature.system.spellcasting?.ability;

  if (!ability) {
    return 0;
  }

  const score = creature.system.abilities[ability] ?? 10;

  return Math.floor((score - 10) / 2);
}

/**
 * Эффективная сложность спасброска заклинаний существа.
 *
 * Если значение задано вручную (`spellcasting.saveDC`) — берётся как есть.
 * Иначе, если выбрана заклинательная характеристика, выводится автоматически:
 * `8 + бонус мастерства + модификатор характеристики` (как у актёров). Без
 * ручного значения и без характеристики — `undefined` (показывать нечего).
 *
 * @param creature - существо
 * @returns DC спасброска или undefined
 */
export function getCreatureSpellSaveDC(
  creature: import('./dndEntities.js').Creature,
): number | undefined {
  const block = creature.system.spellcasting;

  if (block?.saveDC !== undefined) {
    return block.saveDC;
  }

  if (!block?.ability) {
    return undefined;
  }

  return 8 + creature.system.proficiencyBonus + getCreatureSpellMod(creature);
}

/**
 * Эффективный бонус к атаке заклинаниями существа.
 *
 * Если значение задано вручную (`spellcasting.attackBonus`) — берётся как есть.
 * Иначе, если выбрана заклинательная характеристика, выводится автоматически:
 * `бонус мастерства + модификатор характеристики`. Без ручного значения и без
 * характеристики — `undefined`.
 *
 * @param creature - существо
 * @returns бонус к атаке или undefined
 */
export function getCreatureSpellAttackBonus(
  creature: import('./dndEntities.js').Creature,
): number | undefined {
  const block = creature.system.spellcasting;

  if (block?.attackBonus !== undefined) {
    return block.attackBonus;
  }

  if (!block?.ability) {
    return undefined;
  }

  return creature.system.proficiencyBonus + getCreatureSpellMod(creature);
}

/**
 * Разворачивает части урона/лечения ЗАКЛИНАНИЯ существа в готовые к броску.
 *
 * В отличие от {@link resolveCreatureDamageParts}, токен `@mod.spell`
 * подставляется из модификатора заклинательной характеристики существа —
 * заклинания из компендиума несут `@mod.spell` в формулах (напр. лечение
 * «2к8 + @mod.spell»). Слот-скейлинг существам не применяется.
 *
 * @param parts - части урона/лечения заклинания
 * @param targetIsFull - состояние HP цели для @target.* (undefined — per-target)
 * @param creature - существо-заклинатель
 * @param spellMod - модификатор заклинательной характеристики (см. {@link getCreatureSpellMod})
 * @returns массив разрешённых частей (по сегментам)
 */
export function resolveCreatureSpellDamageParts(
  parts: DamagePart[],
  targetIsFull: boolean | undefined,
  creature: import('./dndEntities.js').Creature,
  spellMod: number,
): ResolvedDamagePartInput[] {
  const context = { ...buildFormulaContext(creature), spellMod };

  return expandDamageParts(parts, targetIsFull, (formula) => {
    if (!formula.includes('@')) {
      return formula;
    }

    try {
      return substituteFormulaVariables(formula, context);
    } catch {
      return formula;
    }
  });
}

/**
 * Универсальное ядро развёртывания частей урона: ветки `@target.*` → сегменты
 * `@dmg`/`@heal` → разрешение формулы переданным резолвером. Носитель (заклинание/
 * оружие/существо) задаёт только способ резолва @-переменных и нужен ли
 * слот-скейлинг — остальная механика общая (единый знаменатель).
 *
 * @param parts - части урона/лечения
 * @param targetIsFull - состояние HP цели для @target.* (undefined — per-target)
 * @param resolveFormula - резолвер сегмента (подстановка @-переменных)
 * @param options - опции развёртывания
 * @param options.assignScaling - помечать ли получателя слот-скейлинга (заклинания)
 * @returns массив разрешённых частей (по сегментам)
 */
export function expandDamageParts(
  parts: DamagePart[],
  targetIsFull: boolean | undefined,
  resolveFormula: (formula: string) => string,
  options: { assignScaling?: boolean } = {},
): ResolvedDamagePartInput[] {
  const result: ResolvedDamagePartInput[] = [];

  // Метаданные сегментов для пост-назначения слот-скейлинга: лечение теперь
  // определяется на уровне СЕГМЕНТА (@heal в формуле), поэтому получатель
  // усиления выбирается после полного развёртывания.
  const segmentMeta: {
    partIndex: number;
    branchIndex: number;
    isHealing: boolean;
  }[] = [];

  for (const [partIndex, part] of parts.entries()) {
    // Гасим условные слагаемые @target.* ДО разбиения по типам: удалённые
    // слагаемые не оставляют «осиротевших» типизированных модификаторов, а
    // хвостовой @mod.spell прилипает к типу активной ветки.
    const branches: { gate?: TargetHpGate; formula: string }[] = [];

    if (!part.formula.includes('@target')) {
      branches.push({ formula: part.formula });
    } else if (targetIsFull !== undefined) {
      branches.push({
        formula: applyTargetConditionals(part.formula, targetIsFull),
      });
    } else {
      branches.push(
        { gate: 'full', formula: applyTargetConditionals(part.formula, true) },
        {
          gate: 'notFull',
          formula: applyTargetConditionals(part.formula, false),
        },
      );
    }

    for (const [branchIndex, branch] of branches.entries()) {
      if (branch.formula.trim().length === 0) {
        continue;
      }

      const segments = splitFormulaByDamageType(branch.formula, part.type);

      for (const segment of segments) {
        const resolved = resolveFormula(segment.formula);

        if (resolved.trim().length === 0) {
          continue;
        }

        result.push({
          formula: resolved,
          type: segment.healing ? undefined : segment.type,
          types: segment.healing ? undefined : segment.types,
          isHealing: segment.healing !== undefined,
          healTemp: segment.healing === 'temp' || undefined,
          target: part.target ?? 'selected',
          requiresDamage: part.requiresDamage ?? false,
          targetGate: branch.gate,
          applySlotScaling: false,
        });

        segmentMeta.push({
          partIndex,
          branchIndex,
          isHealing: segment.healing !== undefined,
        });
      }
    }
  }

  if (options.assignScaling) {
    assignSlotScaling(result, segmentMeta);
  }

  return result;
}

/**
 * Помечает части-получатели усиления высших кругов (слот-скейлинг).
 *
 * Получатель — первая часть, породившая урон-сегмент; в каждой её гейт-ветке
 * помечается первый урон-сегмент (к цели применяется только одна ветка —
 * двойного усиления нет). Если урон-сегментов нет вообще (чисто лечащее
 * заклинание, напр. «Лечение ран») — усиление достаётся первому лечащему
 * сегменту каждой ветки первой части, иначе апкаст лечения терялся бы.
 *
 * @param result - развёрнутые части (мутируются: applySlotScaling)
 * @param segmentMeta - метаданные сегментов (параллельны result)
 */
function assignSlotScaling(
  result: ResolvedDamagePartInput[],
  segmentMeta: { partIndex: number; branchIndex: number; isHealing: boolean }[],
): void {
  const hasDamageSegment = segmentMeta.some((meta) => !meta.isHealing);

  const recipientMeta = segmentMeta.find(
    (meta) => !hasDamageSegment || !meta.isHealing,
  );

  if (!recipientMeta) {
    return;
  }

  const markedBranches = new Set<number>();

  for (const [index, meta] of segmentMeta.entries()) {
    if (meta.partIndex !== recipientMeta.partIndex) {
      continue;
    }

    if (hasDamageSegment && meta.isHealing) {
      continue;
    }

    if (markedBranches.has(meta.branchIndex)) {
      continue;
    }

    markedBranches.add(meta.branchIndex);
    result[index].applySlotScaling = true;
  }
}

/**
 * Разворачивает формулы бонус-урона из Active Effects в готовые к броску части.
 *
 * Вход — формулы костей из `collectBonusDamageFormulas` (effectPipeline),
 * напр. «2к6@dmg.fire@target.full». Логика веток/сегментов повторяет
 * {@link resolveDamagePartsForCast}:
 * 1. `@target.*` — гейт на слагаемое: при известном состоянии цели остаётся
 *    одна ветка, при неизвестном — обе с `targetGate` (per-target фильтр
 *    в оркестраторе);
 * 2. `@dmg.<type>` разносит формулу на типизированные сегменты
 *    ({@link splitFormulaByDamageType}); сегменты без токена получают
 *    `defaultType` (для оружия — его тип урона);
 * 3. остальные @-переменные разрешает переданный `resolveFormula`.
 *
 * Бонус-части не лечат, идут текущей цели и не получают слот-скейлинг.
 * Отложенный гейт условия change (`conditionGate`, см. {@link BonusDamageFormula})
 * сводится с гейт-веткой токенов в один `targetGate` части
 * ({@link combineTargetGates}); несовместимые ветки отбрасываются.
 *
 * @param formulas - формулы бонус-урона из эффектов (с отложенными гейтами условий)
 * @param defaultType - тип урона для сегментов без токена @dmg
 * @param targetIsFull - состояние HP цели (undefined — неизвестно, ветки per-target)
 * @param resolveFormula - резолвер @-переменных сегмента (контекст вызова)
 * @returns массив разрешённых бонус-частей
 */
export function resolveBonusDamageParts(
  formulas: BonusDamageFormula[],
  defaultType: string | undefined,
  targetIsFull: boolean | undefined,
  resolveFormula: (subFormula: string) => string,
): ResolvedDamagePartInput[] {
  const result: ResolvedDamagePartInput[] = [];

  for (const { formula: rawFormula, conditionGate } of formulas) {
    const branches: { gate?: TargetHpGate; formula: string }[] = [];

    if (!rawFormula.includes('@target')) {
      branches.push({ formula: rawFormula });
    } else if (targetIsFull !== undefined) {
      branches.push({
        formula: applyTargetConditionals(rawFormula, targetIsFull),
      });
    } else {
      branches.push(
        { gate: 'full', formula: applyTargetConditionals(rawFormula, true) },
        {
          gate: 'notFull',
          formula: applyTargetConditionals(rawFormula, false),
        },
      );
    }

    for (const branch of branches) {
      if (branch.formula.trim().length === 0) {
        continue;
      }

      const combined = combineTargetGates(conditionGate, branch.gate);

      if (combined === null) {
        continue;
      }

      for (const segment of splitFormulaByDamageType(
        branch.formula,
        defaultType,
      )) {
        const resolved = resolveFormula(segment.formula);

        if (resolved.trim().length === 0) {
          continue;
        }

        result.push({
          formula: resolved,
          type: segment.healing ? undefined : segment.type,
          types: segment.healing ? undefined : segment.types,
          isHealing: segment.healing !== undefined,
          healTemp: segment.healing === 'temp' || undefined,
          target: 'selected',
          requiresDamage: false,
          targetGate: combined.gate,
          applySlotScaling: false,
        });
      }
    }
  }

  return result;
}

/**
 * Выбирает набор частей урона заговора по уровню заклинателя.
 *
 * Возвращает `parts` тира с наибольшим `level ≤ casterLevel`. Если тиров нет или
 * уровень заклинателя ниже первого тира — возвращает `null` (используются базовые
 * `spell.damageParts`). Авто-умножение кубиков по уровню отключено — масштабирование
 * заговора задаётся ТОЛЬКО явными тирами.
 *
 * @param spell - заклинание (заговор)
 * @param casterLevel - суммарный уровень заклинателя
 * @returns части активного тира или null (использовать базовые)
 */
export function pickCantripTierParts(
  spell: Spell,
  casterLevel: number,
): DamagePart[] | null {
  const tiers = spell.cantripScalingTiers;

  if (!tiers || tiers.length === 0) {
    return null;
  }

  const active = tiers
    .filter((tier) => tier.level <= casterLevel)
    .sort((first, second) => second.level - first.level)[0];

  return active ? active.parts : null;
}

/**
 * Масштабирует формулу урона при усилении заклинания.
 *
 * Чистая функция, работающая с примитивами (без привязки к Spell).
 *
 * @param baseFormula - базовая формула урона
 * @param scalingDice - формула дополнительных кубиков за каждый круг (напр. "1к8")
 * @param spellLevel - базовый круг заклинания
 * @param castLevel - круг, из которого кастуется
 * @returns масштабированная формула урона
 */
export function scaleDamageFormula(
  baseFormula: string,
  scalingDice: string,
  spellLevel: number,
  castLevel: number,
): string {
  const levelDiff = castLevel - spellLevel;

  if (levelDiff <= 0) {
    return baseFormula;
  }

  const scalingMatch = scalingDice.match(DICE_FORMULA_REGEX);

  if (!scalingMatch) {
    const flatMatch = scalingDice.match(/^(\d+)/);

    if (flatMatch) {
      const flatValue = Number(flatMatch[1]) * levelDiff;

      return `${baseFormula} + ${flatValue}`;
    }

    return baseFormula;
  }

  const scalingCount = Number(scalingMatch[1]) * levelDiff;
  const scalingSeparator = scalingMatch[2];
  const scalingSides = scalingMatch[3];

  return `${baseFormula}+${scalingCount}${scalingSeparator}${scalingSides}`;
}

// ── Маппинг AoE ──────────────────────────────────────────────

/**
 * Маппит область заклинания на параметры MeasurementTemplate.
 *
 * @param spell - заклинание с областью воздействия
 * @returns параметры шаблона или null если нет области
 */
export function mapSpellAreaToTemplate(
  spell: Spell,
): { type: MeasurementTemplateType; size: number } | null {
  if (!spell.areaOfEffect) {
    return null;
  }

  return { type: spell.areaOfEffect.shape, size: spell.areaOfEffect.size };
}

// ── Лейблы для чата ──────────────────────────────────────────

/**
 * Формирует лейбл для каста заклинания в чате.
 *
 * @param spellName - название заклинания
 * @param castLevel - круг, из которого кастуется
 * @param spellLevel - базовый круг заклинания
 * @returns текст лейбла
 */
export function buildSpellCastLabel(
  spellName: string,
  castLevel: number,
  spellLevel: number,
): string {
  let label = `Заклинание\u00A0—\u00A0${spellName}`;

  if (castLevel > spellLevel) {
    label += `\u00A0(${castLevel}-й круг)`;
  }

  return label;
}

/**
 * Формирует лейбл для урона заклинания с результатом применения.
 *
 * @param spellName - название заклинания
 * @param applyResult - результат применения урона (может отсутствовать)
 * @returns текст лейбла
 */
export function buildSpellDamageLabel(
  spellName: string,
  applyResult?: { actorName: string; hpBefore: number; hpAfter: number } | null,
): string {
  let label = `Урон\u00A0—\u00A0${spellName}`;

  if (applyResult) {
    label += `\u00A0→\u00A0${applyResult.actorName}:\u00A0-${applyResult.hpBefore - applyResult.hpAfter}\u00A0HP`;
  }

  return label;
}

/**
 * Формирует лейбл для спасброска от заклинания.
 *
 * @param spellName - название заклинания
 * @param saveAbility - характеристика спасброска
 * @param saveDC - сложность спасброска
 * @returns текст лейбла
 */
export function buildSpellSaveLabel(
  spellName: string,
  saveAbility: string,
  saveDC: number,
): string {
  return `${spellName}\u00A0—\u00A0Спасбросок\u00A0${saveAbility}\u00A0(DC\u00A0${saveDC})`;
}
