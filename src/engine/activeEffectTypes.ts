/**
 * Типы данных системы Active Effects (D&D 5e)
 *
 * Система активных эффектов с формульным парсером,
 * числовыми модификаторами (changes) и булевыми флагами (flags).
 *
 * Используется в трёхфазном пайплайне:
 * prepareBaseData → applyActiveEffects → prepareDerivedData
 */

import type {
  AbilityType,
  DamagePart,
  DefensibleDamageType,
  MovementType,
  SkillType,
} from '@vtt/shared';
// Нейтральные контрактные типы эффекта (провенанс, длительность, аура, триггер
// области, база `BaseActiveEffect`) живут в ядре системного контракта
// (`../contracts/*`); D&D наследует базу и реэкспортит формы для своих потребителей.
import type {
  AreaEffectTrigger,
  BaseActiveEffect,
  EffectAura,
  EffectDuration,
  EffectDurationType,
  EffectTurnAnchor,
  EffectTurnTiming,
} from '@vtt/shared';
import type { EffectOrigin } from '@vtt/shared';
import type { ConditionKey } from './conditionKeys.js';

import { z } from 'zod';

import { DAMAGE_TYPE_LABELS } from './damageConstants.js';

export type {
  AreaEffectTrigger,
  BaseActiveEffect,
  EffectAura,
  EffectDuration,
  EffectDurationType,
  EffectOrigin,
  EffectTurnAnchor,
  EffectTurnTiming,
};

// ── Режимы изменений ─────────────────────────────────────────

/**
 * Режим применения числового изменения.
 *
 * Определяет, как `value` взаимодействует с базовым значением актора.
 * Порядок применения зависит от `priority` в `EffectChange`.
 */
export type EffectChangeMode =
  | 'add'
  | 'multiply'
  | 'override'
  | 'upgrade'
  | 'downgrade'
  | 'custom';

/** Локализованные названия режимов (для UI) */
export const EFFECT_CHANGE_MODE_LABELS: Record<EffectChangeMode, string> = {
  add: 'Добавить',
  multiply: 'Умножить',
  override: 'Заменить',
  upgrade: 'Повысить до',
  downgrade: 'Понизить до',
  custom: 'Особое',
} as const;

// ── Ключи числовых изменений ──────────────────────────────────

/**
 * Типобезопасный ключ для числовых модификаций актора.
 *
 * В отличие от строковой dot-нотации,
 * использует типизированные template literal types для автокомплита и проверки.
 */
export type EffectTargetKey =
  | `ability.${AbilityType}`
  | `save.${AbilityType}`
  | `skill.${SkillType}`
  | 'attack.melee'
  | 'attack.ranged'
  | 'attack.spell'
  | 'damage.melee'
  | 'damage.ranged'
  | 'damage.spell'
  | 'armorClass'
  | `movement.${MovementType}`
  | 'hitPoints.max'
  | 'hitPoints.temp'
  | 'initiative'
  | 'proficiencyBonus'
  | 'spellSaveDC';

/**
 * Популярные ключи для подсказок в UI при настройке эффекта
 */
export const EFFECT_TARGET_SUGGESTIONS: Array<{
  value: string;
  label: string;
}> = [
  // Базовые параметры
  { value: 'armorClass', label: 'Класс доспеха (AC)' },
  { value: 'initiative', label: 'Инициатива (Бонус)' },
  { value: 'proficiencyBonus', label: 'Бонус мастерства' },
  { value: 'spellSaveDC', label: 'Сложность спасброска от заклинаний' },
  { value: 'hitPoints.max', label: 'Макс. здоровье (HP)' },
  { value: 'hitPoints.temp', label: 'Временные хиты (Temp HP)' },

  // Скорости
  { value: 'movement.walk', label: 'Скорость (Ходьба)' },
  { value: 'movement.fly', label: 'Скорость (Полет)' },
  { value: 'movement.swim', label: 'Скорость (Плавание)' },
  { value: 'movement.climb', label: 'Скорость (Лазание)' },

  // Характеристики (Скрытые/Явные)
  { value: 'ability.strength', label: 'Сила (Очки)' },
  { value: 'ability.dexterity', label: 'Ловкость (Очки)' },
  { value: 'ability.constitution', label: 'Телосложение (Очки)' },
  { value: 'ability.intelligence', label: 'Интеллект (Очки)' },
  { value: 'ability.wisdom', label: 'Мудрость (Очки)' },
  { value: 'ability.charisma', label: 'Харизма (Очки)' },

  // Спасброски
  { value: 'save.strength', label: 'Спасбросок (Сила)' },
  { value: 'save.dexterity', label: 'Спасбросок (Ловкость)' },
  { value: 'save.constitution', label: 'Спасбросок (Телосложение)' },
  { value: 'save.intelligence', label: 'Спасбросок (Интеллект)' },
  { value: 'save.wisdom', label: 'Спасбросок (Мудрость)' },
  { value: 'save.charisma', label: 'Спасбросок (Харизма)' },

  // Бонусы Атак
  { value: 'attack.melee', label: 'Атака: Рукопашное оружие' },
  { value: 'attack.ranged', label: 'Атака: Дальнобойное оружие' },
  { value: 'attack.spell', label: 'Атака: Заклинание' },

  // Бонусы Урона
  { value: 'damage.melee', label: 'Урон: Рукопашное оружие' },
  { value: 'damage.ranged', label: 'Урон: Дальнобойное оружие' },
  { value: 'damage.spell', label: 'Урон: Заклинание' },

  // Навыки
  { value: 'skill.acrobatics', label: 'Навык (Акробатика)' },
  { value: 'skill.animalHandling', label: 'Навык (Уход за животными)' },
  { value: 'skill.arcana', label: 'Навык (Аркана)' },
  { value: 'skill.athletics', label: 'Навык (Атлетика)' },
  { value: 'skill.deception', label: 'Навык (Обман)' },
  { value: 'skill.history', label: 'Навык (История)' },
  { value: 'skill.insight', label: 'Навык (Проницательность)' },
  { value: 'skill.investigation', label: 'Навык (Анализ)' },
  { value: 'skill.intimidation', label: 'Навык (Запугивание)' },
  { value: 'skill.medicine', label: 'Навык (Медицина)' },
  { value: 'skill.nature', label: 'Навык (Природа)' },
  { value: 'skill.perception', label: 'Навык (Внимательность)' },
  { value: 'skill.performance', label: 'Навык (Выступление)' },
  { value: 'skill.persuasion', label: 'Навык (Убеждение)' },
  { value: 'skill.religion', label: 'Навык (Религия)' },
  { value: 'skill.sleightOfHand', label: 'Навык (Ловкость рук)' },
  { value: 'skill.stealth', label: 'Навык (Скрытность)' },
  { value: 'skill.survival', label: 'Навык (Выживание)' },
];

/**
 * Шаблоны логических условий для эффектов (condition field).
 * Позволяют фильтровать применение эффекта по различным обстоятельствам.
 */
export const EFFECT_CONDITION_SUGGESTIONS: Array<{
  value: string;
  label: string;
}> = [
  // === БРОСКИ ===
  {
    value: 'roll.hasAdvantage === true',
    label: 'Бросок: Решение с Преимуществом',
  },
  {
    value: 'roll.hasDisadvantage === true',
    label: 'Бросок: Решение с Помехой',
  },
  {
    value: 'roll.isCritical === true',
    label: 'Бросок: Критическое попадание (Крит)',
  },

  // === ЦЕЛЬ (TARGET) ===
  {
    value: 'target.creatureType === "undead"',
    label: 'Цель: Нежить (Тип существа)',
  },
  {
    value: 'target.creatureType === "fiend"',
    label: 'Цель: Исчадие (Тип существа)',
  },
  { value: 'target.hasCondition("prone")', label: 'Цель: Сбита с ног' },
  { value: 'target.hasCondition("poisoned")', label: 'Цель: Отравлена' },
  {
    value: 'target.hp.value === target.hp.max',
    label: 'Цель: Имеет Макс. Хиты (Убийца / Полное HP)',
  },
  {
    value: 'target.hp.value < target.hp.max',
    label: 'Цель: Ранена (Неполное HP)',
  },
  {
    value: 'target.hp.value <= (target.hp.max / 2)',
    label: 'Цель: Меньше половины HP (Окровавлен)',
  },

  // === ОРУЖИЕ / ЗАКЛИНАНИЕ (ITEM) ===
  {
    value: 'item.system.actionType === "mwak"',
    label: 'Атака: Рукопашное оружие',
  },
  {
    value: 'item.system.actionType === "rwak"',
    label: 'Атака: Дальнобойное оружие',
  },
  { value: 'item.type === "spell"', label: 'Атака: Заклинанием' },
  {
    value: 'item.properties.includes("finesse")',
    label: 'Оружие: Фехтовальное',
  },
  { value: 'item.properties.includes("heavy")', label: 'Оружие: Тяжелое' },
  {
    value: 'item.properties.includes("versatile")',
    label: 'Оружие: Универсальное',
  },

  // === ДИСТАНЦИЯ ===
  {
    value: 'target.distance <= 5',
    label: 'Дистанция: В пределах 5 футов (Вплотную)',
  },
  { value: 'target.distance > 30', label: 'Дистанция: Дальше 30 футов' },

  // === ЗАЩИТА (УСЛОВНЫЙ AC) ===
  {
    value: 'incoming.attackType === "melee"',
    label: 'Защита: От рукопашных атак',
  },
  {
    value: 'incoming.attackType === "ranged"',
    label: 'Защита: От дальнобойных атак',
  },
  {
    value: 'incoming.attackType === "spell"',
    label: 'Защита: От атак заклинаниями',
  },

  // === ПЕРСОНАЖ (ACTOR) ===
  {
    value: 'actor.hp.value <= (actor.hp.max / 2)',
    label: 'Сам Персонаж: Меньше 50% HP',
  },
  {
    value: 'actor.hasCondition("invisible")',
    label: 'Сам Персонаж: Невидимый',
  },

  // === ОКРУЖЕНИЕ ===
  { value: 'scene.isDark === true', label: 'Окружение: Темнота' },
];

/**
 * Популярные формулы, типы урона, лечение и переменные для подсказок значения эффекта.
 */
export const EFFECT_VALUE_SUGGESTIONS: Array<{
  value: string;
  label: string;
}> = [
  // Характеристики и модификаторы
  { value: '@mod.spell', label: 'Модификатор заклинательной характеристики' },
  { value: '@mod.str', label: 'Модификатор Силы' },
  { value: '@mod.dex', label: 'Модификатор Ловкости' },
  { value: '@mod.con', label: 'Модификатор Телосложения' },
  { value: '@mod.int', label: 'Модификатор Интеллекта' },
  { value: '@mod.wis', label: 'Модификатор Мудрости' },
  { value: '@mod.cha', label: 'Модификатор Харизмы' },
  { value: '@prof', label: 'Бонус мастерства актора (@prof)' },
  { value: '@level', label: 'Общий уровень персонажа (@level)' },

  // Типы урона (с токенами)
  { value: '1к6@dmg.fire', label: 'Урон: Огонь (например, 1к6)' },
  { value: '1к6@dmg.cold', label: 'Урон: Холод' },
  { value: '1к6@dmg.lightning', label: 'Урон: Электричество' },
  { value: '1к6@dmg.thunder', label: 'Урон: Звук' },
  { value: '1к6@dmg.acid', label: 'Урон: Кислота' },
  { value: '1к6@dmg.poison', label: 'Урон: Яд' },
  { value: '1к6@dmg.necrotic', label: 'Урон: Некроз' },
  { value: '1к6@dmg.radiant', label: 'Урон: Излучение' },
  { value: '1к6@dmg.force', label: 'Урон: Силовое поле' },
  { value: '1к6@dmg.psychic', label: 'Урон: Психический' },
  { value: '1к6@dmg.bludgeoning', label: 'Урон: Дробящий' },
  { value: '1к6@dmg.piercing', label: 'Урон: Колющий' },
  { value: '1к6@dmg.slashing', label: 'Урон: Рубящий' },

  // Лечение
  { value: '1к8@heal', label: 'Лечение (например, 1к8)' },
  { value: '1к8@heal.temp', label: 'Временные хиты (Temp HP)' },

  // Условия по цели в формуле
  {
    value: '1к6@target.full',
    label: 'Формула: Урон только при полном HP цели',
  },
  {
    value: '1к6@target.notFull',
    label: 'Формула: Урон только по раненой цели',
  },
];

// ── Ключи булевых флагов ──────────────────────────────────────

/** Флаг сопротивления конкретному типу урона (урон уменьшается вдвое) */
export type DamageResistanceFlagKey = `resistance.${DefensibleDamageType}`;

/** Флаг иммунитета к конкретному типу урона (урон игнорируется) */
export type DamageImmunityFlagKey = `immunity.${DefensibleDamageType}`;

/** Флаг уязвимости к конкретному типу урона (урон удваивается) */
export type DamageVulnerabilityFlagKey =
  `vulnerability.${DefensibleDamageType}`;

/**
 * Все флаги защит от урона по типам (сопротивление/иммунитет/уязвимость).
 * Генерируются по списку `DEFENSIBLE_DAMAGE_TYPES`.
 */
export type DamageDefenseFlagKey =
  | DamageResistanceFlagKey
  | DamageImmunityFlagKey
  | DamageVulnerabilityFlagKey;

/**
 * Нечисловые эффекты: помеха, преимущество, иммунитеты.
 *
 * Флаги не имеют числового значения — они либо активны, либо нет.
 * Собираются в `Set<EffectFlagKey>` внутри `ResolvedActorStats.activeFlags`.
 */
export type EffectFlagKey =
  | 'attack.disadvantage'
  | 'attack.advantage'
  | 'attack.melee.advantage'
  | 'attack.melee.disadvantage'
  | 'attack.ranged.advantage'
  | 'attack.ranged.disadvantage'
  | 'attack.spell.advantage'
  | 'attack.spell.disadvantage'
  | 'attacksAgainst.advantage'
  | 'attacksAgainst.disadvantage'
  | 'abilityCheck.disadvantage'
  | 'abilityCheck.advantage'
  | 'abilityCheck.advantage.strength'
  | 'abilityCheck.advantage.dexterity'
  | 'abilityCheck.advantage.constitution'
  | 'abilityCheck.advantage.intelligence'
  | 'abilityCheck.advantage.wisdom'
  | 'abilityCheck.advantage.charisma'
  | 'abilityCheck.disadvantage.strength'
  | 'abilityCheck.disadvantage.dexterity'
  | 'abilityCheck.disadvantage.constitution'
  | 'abilityCheck.disadvantage.intelligence'
  | 'abilityCheck.disadvantage.wisdom'
  | 'abilityCheck.disadvantage.charisma'
  | 'skill.stealth.disadvantage'
  | 'save.advantage'
  | 'save.disadvantage'
  | 'save.advantage.strength'
  | 'save.advantage.dexterity'
  | 'save.advantage.constitution'
  | 'save.advantage.intelligence'
  | 'save.advantage.wisdom'
  | 'save.advantage.charisma'
  | 'save.disadvantage.strength'
  | 'save.disadvantage.dexterity'
  | 'save.disadvantage.constitution'
  | 'save.disadvantage.intelligence'
  | 'save.disadvantage.wisdom'
  | 'save.disadvantage.charisma'
  | 'save.autoFail.strength'
  | 'save.autoFail.dexterity'
  | 'save.autoFail.constitution'
  | 'save.autoFail.intelligence'
  | 'save.autoFail.wisdom'
  | 'save.autoFail.charisma'
  | 'speed.zero'
  | 'incapacitated'
  | 'initiative.advantage'
  | 'initiative.disadvantage'
  | 'vision.blinded'
  | 'vision.invisible'
  | 'defense.critImmunity'
  | DamageDefenseFlagKey;

/**
 * Локализованные названия статических флагов (без флагов защит от урона).
 * Флаги защит генерируются отдельно — см. `buildDamageDefenseFlagLabels`.
 */
const BASE_EFFECT_FLAG_LABELS: Record<
  Exclude<EffectFlagKey, DamageDefenseFlagKey>,
  string
> = {
  // Атаки
  'attack.disadvantage': 'Помеха на все атаки',
  'attack.advantage': 'Преимущество на все атаки',
  'attack.melee.advantage': 'Преимущество на рукопашные атаки',
  'attack.melee.disadvantage': 'Помеха на рукопашные атаки',
  'attack.ranged.advantage': 'Преимущество на дальнобойные атаки',
  'attack.ranged.disadvantage': 'Помеха на дальнобойные атаки',
  'attack.spell.advantage': 'Преимущество на атаки заклинаниями',
  'attack.spell.disadvantage': 'Помеха на атаки заклинаниями',
  'attacksAgainst.advantage': 'Преимущество атак по этому существу',
  'attacksAgainst.disadvantage': 'Помеха атак по этому существу',

  // Проверки характеристик
  'abilityCheck.disadvantage': 'Помеха на ВСЕ проверки характеристик',
  'abilityCheck.advantage': 'Преимущество на ВСЕ проверки характеристик',
  'abilityCheck.advantage.strength': 'Преимущество на проверки: Сила',
  'abilityCheck.advantage.dexterity': 'Преимущество на проверки: Ловкость',
  'abilityCheck.advantage.constitution':
    'Преимущество на проверки: Телосложение',
  'abilityCheck.advantage.intelligence': 'Преимущество на проверки: Интеллект',
  'abilityCheck.advantage.wisdom': 'Преимущество на проверки: Мудрость',
  'abilityCheck.advantage.charisma': 'Преимущество на проверки: Харизма',
  'abilityCheck.disadvantage.strength': 'Помеха на проверки: Сила',
  'abilityCheck.disadvantage.dexterity': 'Помеха на проверки: Ловкость',
  'abilityCheck.disadvantage.constitution': 'Помеха на проверки: Телосложение',
  'abilityCheck.disadvantage.intelligence': 'Помеха на проверки: Интеллект',
  'abilityCheck.disadvantage.wisdom': 'Помеха на проверки: Мудрость',
  'abilityCheck.disadvantage.charisma': 'Помеха на проверки: Харизма',

  // Навыки (специфические помехи отдельных навыков)
  'skill.stealth.disadvantage': 'Помеха на проверки: Скрытность',

  // Спасброски
  'save.advantage': 'Преимущество на ВСЕ спасброски',
  'save.disadvantage': 'Помеха на ВСЕ спасброски',
  'save.advantage.strength': 'Преимущество на спасброски: Сила',
  'save.advantage.dexterity': 'Преимущество на спасброски: Ловкость',
  'save.advantage.constitution': 'Преимущество на спасброски: Телосложение',
  'save.advantage.intelligence': 'Преимущество на спасброски: Интеллект',
  'save.advantage.wisdom': 'Преимущество на спасброски: Мудрость',
  'save.advantage.charisma': 'Преимущество на спасброски: Харизма',
  'save.disadvantage.strength': 'Помеха на спасброски: Сила',
  'save.disadvantage.dexterity': 'Помеха на спасброски: Ловкость',
  'save.disadvantage.constitution': 'Помеха на спасброски: Телосложение',
  'save.disadvantage.intelligence': 'Помеха на спасброски: Интеллект',
  'save.disadvantage.wisdom': 'Помеха на спасброски: Мудрость',
  'save.disadvantage.charisma': 'Помеха на спасброски: Харизма',

  // Автопровалы
  'save.autoFail.strength': 'Автопровал спасбросков: Сила',
  'save.autoFail.dexterity': 'Автопровал спасбросков: Ловкость',
  'save.autoFail.constitution': 'Автопровал спасбросков: Телосложение',
  'save.autoFail.intelligence': 'Автопровал спасбросков: Интеллект',
  'save.autoFail.wisdom': 'Автопровал спасбросков: Мудрость',
  'save.autoFail.charisma': 'Автопровал спасбросков: Харизма',

  // Прочее
  'speed.zero': 'Скорость равна нулю',
  'incapacitated': 'Недееспособен (Не может совершать действия/реакции)',
  'initiative.advantage': 'Преимущество на бросок инициативы',
  'initiative.disadvantage': 'Помеха на бросок инициативы',
  'vision.blinded': 'Ослеплен (Ничего не видит, автопровал проверок зрения)',
  'vision.invisible': 'Невидимый (Скрыт от глаз, преимущество на атаки)',

  // Специфические флаги предметов
  'defense.critImmunity': 'Защита: Иммунитет к критическим попаданиям',
};

/**
 * Подписи флагов защит от урона (сопротивление/иммунитет/уязвимость).
 *
 * Тип `Record<DamageDefenseFlagKey, string>` гарантирует полноту на этапе
 * компиляции, а значения переиспользуют единый `DAMAGE_TYPE_LABELS`,
 * чтобы не дублировать русские названия типов урона.
 */
const DAMAGE_DEFENSE_FLAG_LABELS: Record<DamageDefenseFlagKey, string> = {
  'resistance.slashing': `Сопротивление: ${DAMAGE_TYPE_LABELS.slashing}`,
  'resistance.piercing': `Сопротивление: ${DAMAGE_TYPE_LABELS.piercing}`,
  'resistance.bludgeoning': `Сопротивление: ${DAMAGE_TYPE_LABELS.bludgeoning}`,
  'resistance.fire': `Сопротивление: ${DAMAGE_TYPE_LABELS.fire}`,
  'resistance.cold': `Сопротивление: ${DAMAGE_TYPE_LABELS.cold}`,
  'resistance.lightning': `Сопротивление: ${DAMAGE_TYPE_LABELS.lightning}`,
  'resistance.thunder': `Сопротивление: ${DAMAGE_TYPE_LABELS.thunder}`,
  'resistance.poison': `Сопротивление: ${DAMAGE_TYPE_LABELS.poison}`,
  'resistance.acid': `Сопротивление: ${DAMAGE_TYPE_LABELS.acid}`,
  'resistance.necrotic': `Сопротивление: ${DAMAGE_TYPE_LABELS.necrotic}`,
  'resistance.radiant': `Сопротивление: ${DAMAGE_TYPE_LABELS.radiant}`,
  'resistance.force': `Сопротивление: ${DAMAGE_TYPE_LABELS.force}`,
  'resistance.psychic': `Сопротивление: ${DAMAGE_TYPE_LABELS.psychic}`,
  'immunity.slashing': `Иммунитет: ${DAMAGE_TYPE_LABELS.slashing}`,
  'immunity.piercing': `Иммунитет: ${DAMAGE_TYPE_LABELS.piercing}`,
  'immunity.bludgeoning': `Иммунитет: ${DAMAGE_TYPE_LABELS.bludgeoning}`,
  'immunity.fire': `Иммунитет: ${DAMAGE_TYPE_LABELS.fire}`,
  'immunity.cold': `Иммунитет: ${DAMAGE_TYPE_LABELS.cold}`,
  'immunity.lightning': `Иммунитет: ${DAMAGE_TYPE_LABELS.lightning}`,
  'immunity.thunder': `Иммунитет: ${DAMAGE_TYPE_LABELS.thunder}`,
  'immunity.poison': `Иммунитет: ${DAMAGE_TYPE_LABELS.poison}`,
  'immunity.acid': `Иммунитет: ${DAMAGE_TYPE_LABELS.acid}`,
  'immunity.necrotic': `Иммунитет: ${DAMAGE_TYPE_LABELS.necrotic}`,
  'immunity.radiant': `Иммунитет: ${DAMAGE_TYPE_LABELS.radiant}`,
  'immunity.force': `Иммунитет: ${DAMAGE_TYPE_LABELS.force}`,
  'immunity.psychic': `Иммунитет: ${DAMAGE_TYPE_LABELS.psychic}`,
  'vulnerability.slashing': `Уязвимость: ${DAMAGE_TYPE_LABELS.slashing}`,
  'vulnerability.piercing': `Уязвимость: ${DAMAGE_TYPE_LABELS.piercing}`,
  'vulnerability.bludgeoning': `Уязвимость: ${DAMAGE_TYPE_LABELS.bludgeoning}`,
  'vulnerability.fire': `Уязвимость: ${DAMAGE_TYPE_LABELS.fire}`,
  'vulnerability.cold': `Уязвимость: ${DAMAGE_TYPE_LABELS.cold}`,
  'vulnerability.lightning': `Уязвимость: ${DAMAGE_TYPE_LABELS.lightning}`,
  'vulnerability.thunder': `Уязвимость: ${DAMAGE_TYPE_LABELS.thunder}`,
  'vulnerability.poison': `Уязвимость: ${DAMAGE_TYPE_LABELS.poison}`,
  'vulnerability.acid': `Уязвимость: ${DAMAGE_TYPE_LABELS.acid}`,
  'vulnerability.necrotic': `Уязвимость: ${DAMAGE_TYPE_LABELS.necrotic}`,
  'vulnerability.radiant': `Уязвимость: ${DAMAGE_TYPE_LABELS.radiant}`,
  'vulnerability.force': `Уязвимость: ${DAMAGE_TYPE_LABELS.force}`,
  'vulnerability.psychic': `Уязвимость: ${DAMAGE_TYPE_LABELS.psychic}`,
};

/** Локализованные названия флагов эффектов (статические + защиты от урона) */
export const EFFECT_FLAG_LABELS: Record<EffectFlagKey, string> = {
  ...BASE_EFFECT_FLAG_LABELS,
  ...DAMAGE_DEFENSE_FLAG_LABELS,
};

// ── Источник эффекта ──────────────────────────────────────────
// Тип `EffectOrigin` вынесен в нейтральный контракт (`../contracts/effects`) и
// реэкспортится выше. Здесь — только D&D-специфичные ярлыки для UI.

/** Локализованные названия источников (для UI) */
export const EFFECT_ORIGIN_LABELS: Record<EffectOrigin, string> = {
  item: 'Предмет',
  spell: 'Заклинание',
  feature: 'Особенность',
  condition: 'Состояние',
  manual: 'Вручную',
  area: 'Область',
} as const;

// ── Структуры данных ──────────────────────────────────────────

/**
 * Одно числовое изменение, вносимое Active Effect.
 *
 * Примеры:
 * - `{ key: 'ability.strength', mode: 'add', value: '2', priority: 20 }`
 * - `{ key: 'armorClass', mode: 'add', value: '@mod.cha', priority: 20 }`
 */
export interface EffectChange {
  /** Какой параметр модифицировать */
  key: EffectTargetKey;
  /** Как модифицировать */
  mode: EffectChangeMode;
  /** Числовое значение или формула с @-переменными */
  value: string;
  /** Опциональное условие (например: roll.hasAdvantage === true) */
  condition?: string;
  /** Приоритет применения (меньше = раньше, по умолчанию 20) */
  priority: number;
}

/** Локализованные названия длительности (для UI) */
export const EFFECT_DURATION_LABELS: Record<EffectDurationType, string> = {
  permanent: 'Постоянно',
  rounds: 'Раунды',
  minutes: 'Минуты',
  hours: 'Часы',
  days: 'Дни',
  turn: 'До хода (точно)',
  special: 'Особое',
} as const;

/** Локализованные названия якоря хода (для UI) */
export const EFFECT_TURN_ANCHOR_LABELS: Record<EffectTurnAnchor, string> = {
  carrier: 'носителя (цели)',
  source: 'источника (кастера)',
} as const;

/** Локализованные названия момента хода (для UI) */
export const EFFECT_TURN_TIMING_LABELS: Record<EffectTurnTiming, string> = {
  start: 'в начале хода',
  end: 'в конце хода',
} as const;

/** Что делает успешный спасбросок эффекта с его нагрузкой */
export type EffectSaveOutcome = 'negate' | 'half';

/**
 * Спасбросок при наложении эффекта: цель кидает спас в момент применения (напр.
 * при попадании атакой). Провал — эффект применяется (и наносится его урон);
 * успех — отменяет нагрузку (`negate`) или уменьшает урон вдвое (`half`).
 */
export interface EffectSave {
  /** Характеристика спасброска */
  ability: AbilityType;
  /** Сложность спасброска */
  dc: number;
  /** Эффект успешного спасброска */
  onSuccess: EffectSaveOutcome;
}

/** Момент периодического спасброска для снятия эффекта */
export type EffectSaveTiming = 'startOfTurn' | 'endOfTurn';

/**
 * Периодический спасбросок для снятия эффекта (правило «спас в начале/конце
 * хода прекращает действие»). И конец, и начало хода обрабатываются на сервере
 * при смене хода в энкаунтере.
 *
 * `dc === 0` — особый случай «использовать Сл кастера»: при наложении эффекта
 * заклинанием клиент проставляет сюда динамическую Сл спасброска заклинателя
 * (у заклинаний персонажей Сл зависит от билда). У существ Сл фиксирована.
 */
export interface RecurringSave {
  /** Характеристика спасброска */
  ability: AbilityType;
  /** Сложность спасброска (`0` = подставить Сл кастера при наложении) */
  dc: number;
  /** Момент броска */
  timing: EffectSaveTiming;
}

/**
 * Периодический урон (DoT): наносится в начале/конце хода носителя, пока эффект
 * активен (напр. «Горение» от огненной области — урон каждый ход, даже если
 * цель прошла исходный спасбросок). Обрабатывается на сервере при смене хода.
 */
export interface RecurringDamage {
  /** Части урона (формат `DamagePart`, поддерживают токен `@dmg.<type>`) */
  damageParts: DamagePart[];
  /** Момент нанесения урона */
  timing: EffectSaveTiming;
}

/** Локализованные названия триггеров области (для UI) */
export const AREA_TRIGGER_LABELS: Record<AreaEffectTrigger, string> = {
  stay: 'Пока внутри',
  enter: 'При входе',
  exit: 'При выходе',
} as const;

/**
 * Триггер «сгорания» одноразового эффекта на броске атаки.
 *
 * - `carrierAttack` — эффект снимается, когда НОСИТЕЛЬ совершает бросок атаки
 *   (помеха/преимущество ровно на одну следующую атаку самого носителя:
 *   Злая насмешка, Луч слабости);
 * - `attackOnCarrier` — эффект снимается, когда по НОСИТЕЛЮ совершают бросок
 *   атаки (преимущество следующей атаки ПО цели: Направляющий снаряд).
 *
 * В обоих случаях эффект ещё и ограничен своей `duration` (потолок «до конца
 * следующего хода») — что наступит раньше, то и снимает эффект.
 */
export type EffectAttackTrigger = 'carrierAttack' | 'attackOnCarrier';

/** Локализованные названия триггеров расхода на атаке (для UI) */
export const EFFECT_ATTACK_TRIGGER_LABELS: Record<EffectAttackTrigger, string> =
  {
    carrierAttack: 'Снять после своей атаки',
    attackOnCarrier: 'Снять после атаки по цели',
  } as const;

/**
 * Active Effect — полная D&D 5e структура. Наследует нейтральную
 * `BaseActiveEffect` (кросс-катные поля: id/имя/иконка/провенанс/длительность/
 * аура/триггер области) и уточняет `changes`/`flags`/`conditionKey` D&D-типами,
 * добавляя боевые поля (спасброски/урон/периодику/иммунитеты к состояниям).
 *
 * Основной документ активного эффекта.
 * Содержит числовые модификаторы (`changes`) и булевые флаги (`flags`).
 */
export interface ActiveEffect extends BaseActiveEffect {
  /** Уникальный идентификатор эффекта */
  id: string;
  /** Название эффекта */
  name: string;
  /** Описание эффекта */
  description: string;
  /** Путь к иконке (формат tabler:icon-name) */
  icon?: string;
  /** Отключён ли эффект (временно деактивирован, но не удалён) */
  disabled: boolean;

  /** Источник эффекта */
  origin: EffectOrigin;
  /** ID объекта-источника (предмета, заклинания и т.д.) */
  originId?: string;
  /**
   * ID сущности-источника (кастера/атакующего), наложившей эффект. Нужен для
   * точной длительности `type: 'turn'` с якорем `source` («до конца хода
   * кастера») и для провенанса. Проставляется при наложении.
   */
  sourceActorId?: string;

  /** Переносится ли эффект с предмета на актора при экипировке */
  transfer: boolean;

  /** Длительность эффекта */
  duration: EffectDuration;

  /** Числовые модификаторы (key + mode + value) */
  changes: EffectChange[];
  /** Булевые флаги (помеха, преимущество, автопровал спасбросков) */
  flags: EffectFlagKey[];

  /** Настройки ауры (если эффект транслируется на других) */
  aura?: EffectAura;

  /**
   * Триггер для эффектов области/ауры. Если не задан — `stay` (эффект висит,
   * пока сущность внутри). `enter`/`exit` — разовое срабатывание нагрузки
   * (урон `damageParts` и/или статус) в момент входа/выхода.
   */
  areaTrigger?: AreaEffectTrigger;

  /**
   * Цель применения эффекта.
   * - `'self'` (по умолчанию) — применяется к владельцу при экипировке
   * - `'target'` — применяется к цели при попадании атакой
   */
  effectTarget?: 'self' | 'target';

  /**
   * Ключ состояния D&D 5e, если эффект представляет стандартное состояние
   * (Испуганный, Отравленный и т.п.). Используется для проверки иммунитета цели
   * к состоянию и устойчивого опознания состояния (надёжнее сопоставления по
   * имени). Для обычных числовых баффов не задаётся.
   */
  conditionKey?: ConditionKey;

  /**
   * Спасбросок при наложении: если задан, цель кидает спас в момент применения
   * эффекта (напр. при попадании атакой). Провал — эффект и его урон
   * применяются; успех — отменяет/уменьшает по `onSuccess`. Заменяет прежний
   * механизм «райдеров».
   */
  applySave?: EffectSave;

  /**
   * Накладывать эффект-состояние ДАЖЕ при успешном спасброске (собственный
   * `applySave` либо спасбросок уровня действия для области). Урон при этом
   * считается по `onSuccess` (нет/половина). Покрывает кейс «по области:
   * прокинул спас, но статус всё равно висит». По умолчанию `false`.
   */
  applyOnSuccess?: boolean;

  /**
   * Накладывать эффект ТОЛЬКО при успешном спасброске уровня действия и НЕ
   * накладывать при провале (зеркало `applyOnSuccess`). Нужно для заклинаний
   * с разными исходами «успех/провал» (Луч слабости: при успехе — помеха на
   * одну атаку; при провале — длительные штрафы отдельным эффектом). По
   * умолчанию `false`.
   */
  applyOnSuccessOnly?: boolean;

  /**
   * Одноразовость на броске атаки: эффект «сгорает» после первого же
   * подходящего броска атаки (см. `EffectAttackTrigger`), не дожидаясь конца
   * `duration`. Моделирует формулировку «помеха/преимущество на СЛЕДУЮЩИЙ бросок
   * атаки». Если не задан — эффект живёт по обычной длительности.
   */
  consumeOn?: EffectAttackTrigger;

  /**
   * Урон, наносимый при наложении эффекта (гейтится `applySave`: провал —
   * полный, успех — по `onSuccess`). Единая со заклинаниями система `DamagePart`
   * (напр. яд паука «2к8, половина при успехе»).
   */
  damageParts?: DamagePart[];

  /**
   * Периодический спасбросок для снятия эффекта (начало/конец хода носителя).
   * Обрабатывается сервером при смене хода в энкаунтере.
   */
  recurringSave?: RecurringSave;

  /**
   * Периодический урон (DoT) в начале/конце хода носителя, пока эффект активен
   * (напр. «Горение»). Обрабатывается сервером при смене хода в энкаунтере.
   */
  recurringDamage?: RecurringDamage;

  /**
   * Состояния, к которым эффект даёт иммунитет (напр. вид-грант «иммунитет к
   * отравлению»). У актёров нет `system.defenses` — иммунитет к состояниям
   * приходит именно отсюда; собирается `getEntityConditionImmunities`.
   */
  conditionImmunities?: ConditionKey[];
}

/**
 * Доверенное сужение нейтрального эффекта к D&D-форме. В мире D&D эффекты (на
 * акторах, предметах, областях) авторятся полной формой `ActiveEffect`;
 * нейтральная база `BaseActiveEffect` лишь скрывает D&D-поля (`changes`/`flags`/
 * `conditionKey`) от ядра. Внутри D&D-движка читаем их типизированно — тот же
 * доверенный шов, что и `isDnDActorEntity` (система знает форму своих данных).
 * Используется как guard в `.filter(isDnDEffect)` при чтении `activeEffects`/
 * `CustomArea.effects`, типизированных нейтральной базой.
 */
export function isDnDEffect(effect: BaseActiveEffect): effect is ActiveEffect {
  return true;
}

// ── ResolvedActorStats ────────────────────────────────────────

/**
 * Промежуточные «resolved» статы актора после прохождения пайплайна.
 *
 * Это результат `resolveActorStats(actor)` — содержит все вычисленные значения
 * с учётом всех активных эффектов (changes + flags).
 */
export interface ResolvedActorStats {
  /** Значения характеристик (ability scores) */
  abilities: Record<AbilityType, number>;
  /** Модификаторы характеристик */
  abilityMods: Record<AbilityType, number>;
  /** Бонусы к спасброскам */
  saves: Record<AbilityType, number>;
  /** Бонусы к навыкам */
  skills: Record<SkillType, number>;
  /** Класс доспеха */
  armorClass: number;
  /** Модификатор инициативы */
  initiative: number;
  /** Бонус мастерства */
  proficiencyBonus: number;
  /** Скорости передвижения */
  movement: Record<MovementType, number>;
  /** Максимум хитов */
  hitPointsMax: number;
  /** Бонусы к атаке */
  attackBonuses: {
    melee: number;
    ranged: number;
    spell: number;
  };
  /** Бонусы к урону */
  damageBonuses: {
    melee: number;
    ranged: number;
    spell: number;
  };
  /** DC спасброска заклинаний */
  spellSaveDC: number;
  /** Активные булевые флаги от всех эффектов */
  activeFlags: Set<EffectFlagKey>;
  /**
   * Защиты от урона по типам — собираются из статического поля
   * `system.defenses` (существа и будущие сущности) и флагов активных
   * эффектов (`resistance.*` / `immunity.*` / `vulnerability.*`).
   */
  damageDefenses: {
    /** Иммунитеты: урон игнорируется (множитель 0) */
    immunities: Set<DefensibleDamageType>;
    /** Сопротивления: урон уменьшается вдвое (множитель 0.5) */
    resistances: Set<DefensibleDamageType>;
    /** Уязвимости: урон удваивается (множитель 2) */
    vulnerabilities: Set<DefensibleDamageType>;
  };
  /** Ключи полей, перезаписанных режимом 'override' (не добавлять базовые значения в Фазе 3) */
  overriddenKeys: Set<string>;
}

// ── Константы ─────────────────────────────────────────────────

/** Приоритет по умолчанию для нового изменения */
export const DEFAULT_EFFECT_CHANGE_PRIORITY = 20;

/** Максимальное количество эффектов на актора */
export const MAX_EFFECTS_PER_ACTOR = 50;

/**
 * Максимальное количество changes на один эффект.
 *
 * Поднято с 20: Истощение (PHB 2024) накладывает −2 ко ВСЕМ d20-тестам, что в
 * нашей модели разворачивается в отдельные числовые changes для атак (3),
 * спасбросков (6), навыков (18) и видов скорости (5) — до 32 на эффект (см.
 * `buildExhaustionChanges`). 40 оставляет запас и для ручных эффектов.
 */
export const MAX_CHANGES_PER_EFFECT = 40;

// ── Zod-схемы для валидации ───────────────────────────────────

/**
 * Zod-схема для валидации EffectChange.
 *
 * Используется на сервере для проверки входящих данных от клиента.
 */
export const EffectChangeSchema = z.object({
  key: z.string(),
  mode: z.enum([
    'add',
    'multiply',
    'override',
    'upgrade',
    'downgrade',
    'custom',
  ]),
  value: z.string().min(1),
  condition: z.string().optional(),
  priority: z.number().int().min(0).max(100),
});

/**
 * Zod-схема для валидации EffectDuration.
 */
export const EffectDurationSchema = z.object({
  type: z.enum([
    'permanent',
    'rounds',
    'minutes',
    'hours',
    'days',
    'turn',
    'special',
  ]),
  value: z.number().int().min(0).optional(),
  remaining: z.number().int().min(0).optional(),
  turnAnchor: z.enum(['carrier', 'source']).optional(),
  turnTiming: z.enum(['start', 'end']).optional(),
  turnSkipFirst: z.boolean().optional(),
});

export const EffectAuraSchema = z.object({
  radius: z.number().min(0),
  target: z.enum(['allies', 'enemies', 'all']),
  applyToSelf: z.boolean(),
  visible: z.boolean().optional(),
  color: z.string().optional(),
});

/** Характеристики спасброска (для Zod-валидации эффекта) */
const SAVE_ABILITY_VALUES = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

/** Zod-схема спасброска при наложении эффекта */
const EffectSaveSchema = z.object({
  ability: z.enum(SAVE_ABILITY_VALUES),
  dc: z.number().int(),
  onSuccess: z.enum(['negate', 'half']),
});

/** Zod-схема периодического спасброска для снятия эффекта */
const RecurringSaveSchema = z.object({
  ability: z.enum(SAVE_ABILITY_VALUES),
  dc: z.number().int(),
  timing: z.enum(['startOfTurn', 'endOfTurn']),
});

/** Zod-схема части урона эффекта (подмножество DamagePart) */
const EffectDamagePartSchema = z.object({
  formula: z.string(),
  type: z.string().optional(),
  target: z.string().optional(),
  requiresDamage: z.boolean().optional(),
  versatileFormula: z.string().optional(),
});

/** Zod-схема периодического урона (DoT) */
const RecurringDamageSchema = z.object({
  damageParts: z.array(EffectDamagePartSchema),
  timing: z.enum(['startOfTurn', 'endOfTurn']),
});

/**
 * Zod-схема для валидации ActiveEffect.
 *
 * Используется в `entityManager.updateActor()` для проверки
 * данных перед сохранением (AGENTS.md: "All external data is unknown by default. Use Zod").
 */
export const ActiveEffectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  icon: z.string().optional(),
  disabled: z.boolean(),
  origin: z.enum(['item', 'spell', 'feature', 'condition', 'manual', 'area']),
  originId: z.string().optional(),
  sourceActorId: z.string().optional(),
  transfer: z.boolean(),
  duration: EffectDurationSchema,
  changes: z.array(EffectChangeSchema).max(MAX_CHANGES_PER_EFFECT),
  flags: z.array(z.string()),
  aura: EffectAuraSchema.optional(),
  areaTrigger: z.enum(['stay', 'enter', 'exit']).optional(),
  effectTarget: z.enum(['self', 'target']).optional(),
  conditionKey: z.string().optional(),
  applySave: EffectSaveSchema.optional(),
  applyOnSuccess: z.boolean().optional(),
  applyOnSuccessOnly: z.boolean().optional(),
  consumeOn: z.enum(['carrierAttack', 'attackOnCarrier']).optional(),
  damageParts: z.array(EffectDamagePartSchema).optional(),
  recurringSave: RecurringSaveSchema.optional(),
  recurringDamage: RecurringDamageSchema.optional(),
  conditionImmunities: z.array(z.string()).optional(),
});

/** Zod-схема для массива ActiveEffect (для валидации actor.activeEffects) */
export const ActiveEffectsArraySchema = z
  .array(ActiveEffectSchema)
  .max(MAX_EFFECTS_PER_ACTOR);
