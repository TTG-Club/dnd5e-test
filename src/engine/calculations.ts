/**
 * Формулы расчёта системы D&D 5e
 *
 * Все математические формулы, специфичные для D&D 5e.
 * При переключении на другую систему — замени этот файл.
 */

import type {
  AbilityType,
  ActorMovement,
  MovementType,
  ProficiencyLevel,
  SkillType,
} from '@vtt/shared';
import type { DamagePart } from '@vtt/shared';
import type { DnDActor, GameItem } from './dndEntities.js';

import { getTotalLevel } from './classTypes.js';
import {
  EXPERIENCE_TABLE,
  MAX_LEVEL,
  MOVEMENT_LABELS,
  MOVEMENT_PRIORITY,
  normalizeSpellUsesRecovery,
  SKILL_ABILITY_MAP,
} from './consts.js';

/**
 * Вычисляет модификатор характеристики
 *
 * Формула: floor((score - 10) / 2)
 *
 * @param abilityScore - Значение характеристики (1-30)
 * @returns Модификатор характеристики
 */
export function calculateAbilityModifier(abilityScore: number): number {
  return Math.floor((abilityScore - 10) / 2);
}

/**
 * Вычисляет бонус мастерства на основе уровня персонажа
 *
 * Формула: floor((level - 1) / 4) + 2
 *
 * @param level - Уровень персонажа (1-20)
 * @returns Бонус мастерства
 */
export function calculateProficiencyBonus(level: number): number {
  return Math.floor((level - 1) / 4) + 2;
}

/**
 * Возвращает требуемый опыт для следующего уровня
 *
 * @param currentLevel - Текущий уровень персонажа (1-20)
 * @returns Требуемый опыт для следующего уровня
 */
export function calculateExperienceForNextLevel(currentLevel: number): number {
  if (currentLevel >= MAX_LEVEL) {
    return EXPERIENCE_TABLE[MAX_LEVEL - 1];
  }

  return EXPERIENCE_TABLE[currentLevel] || EXPERIENCE_TABLE[MAX_LEVEL - 1];
}

/**
 * Определяет уровень персонажа на основе опыта
 *
 * @param experience - Текущий опыт персонажа
 * @returns Уровень персонажа (1-20)
 */
export function calculateLevelFromExperience(experience: number): number {
  for (let level = MAX_LEVEL; level >= 1; level--) {
    if (experience >= EXPERIENCE_TABLE[level - 1]) {
      return level;
    }
  }

  return 1;
}

/**
 * Возвращает базовую характеристику для навыка
 *
 * @param skill - Тип навыка
 * @returns Тип базовой характеристики
 */
export function getSkillAbility(skill: SkillType): AbilityType {
  return SKILL_ABILITY_MAP[skill];
}

/**
 * Type-guard: значение — корректный уровень владения навыком.
 *
 * Нужен для безопасного чтения уровня из данных типа `unknown`
 * (легаси/кросс-поля систем) без приведения через `as`.
 *
 * @param value - проверяемое значение
 * @returns true, если value — один из ProficiencyLevel
 */
export function isProficiencyLevel(value: unknown): value is ProficiencyLevel {
  return (
    value === 'none'
    || value === 'half'
    || value === 'proficient'
    || value === 'expertise'
  );
}

/**
 * Вклад бонуса мастерства в навык с учётом уровня владения.
 *
 * Единый источник правды для множителя владения:
 *  - none       → 0
 *  - half       → floor(бонус / 2)  (Мастер на все руки)
 *  - proficient → бонус
 *  - expertise  → бонус × 2          (Компетентность/Экспертиза)
 *
 * @param proficiencyBonus - Бонус мастерства существа/персонажа
 * @param proficiencyLevel - Уровень владения навыком
 * @returns Числовой вклад мастерства (без модификатора характеристики)
 */
export function getProficiencyContribution(
  proficiencyBonus: number,
  proficiencyLevel: ProficiencyLevel,
): number {
  if (proficiencyLevel === 'expertise') {
    return proficiencyBonus * 2;
  }

  if (proficiencyLevel === 'proficient') {
    return proficiencyBonus;
  }

  if (proficiencyLevel === 'half') {
    return Math.floor(proficiencyBonus / 2);
  }

  return 0;
}

/**
 * Вычисляет итоговый модификатор навыка с учётом уровня владения.
 *
 * Формула: модификатор_характеристики + бонус_мастерства × множитель_владения
 *
 * @param abilityScore - Значение характеристики, от которой зависит навык
 * @param proficiencyBonus - Бонус мастерства существа/персонажа
 * @param proficiencyLevel - Уровень владения навыком
 * @returns Итоговый числовой модификатор навыка
 */
export function calculateSkillModifier(
  abilityScore: number,
  proficiencyBonus: number,
  proficiencyLevel: ProficiencyLevel,
): number {
  return (
    calculateAbilityModifier(abilityScore)
    + getProficiencyContribution(proficiencyBonus, proficiencyLevel)
  );
}

/**
 * Определяет, имеет ли актёр владение данным оружием
 * на основе `proficiencyMode` и списка владений актёра.
 *
 * Проверяет по:
 * 1. Ключу базового типа (baseType, например "longsword")
 * 2. Категории оружия ("simple" / "martial")
 *
 * @param actor - актёр-владелец
 * @param weapon - оружие
 * @returns true если бонус мастерства должен применяться
 */
export function resolveWeaponProficiency(
  actor: DnDActor,
  weapon: GameItem,
): boolean {
  const mode = weapon.proficiencyMode ?? 'auto';

  if (mode === 'always') {
    return true;
  }

  if (mode === 'never') {
    return false;
  }

  // auto: сверяем baseType оружия со списком владений актёра
  const actorWeapons = actor.system?.proficiencies?.weapons ?? [];

  if (!weapon.baseType) {
    return false;
  }

  // Проверка по ключу baseType (например, "longsword")
  if (actorWeapons.includes(weapon.baseType)) {
    return true;
  }

  // Проверка по категории оружия ("simple" / "martial")
  if (weapon.weaponCategory && actorWeapons.includes(weapon.weaponCategory)) {
    return true;
  }

  return false;
}

/**
 * Рассчитывает модификатор атаки для оружия на основе характеристик актёра.
 * Учитывает модификатор характеристики, бонус мастерства, бонус атаки оружия
 * и бонусы от Active Effects (ауры, экипировка и т.д.).
 *
 * @param actor - актёр-владелец
 * @param weapon - оружие
 * @param resolvedStats - итоговые статы из пайплайна (для бонусов от эффектов)
 * @returns модификатор атаки
 */
/**
 * Возвращает значение характеристики для броска оружия с учётом свойства
 * «Фехтовальное» (finesse): по правилам D&D можно использовать Силу ИЛИ
 * Ловкость — берётся бо́льшая. Без finesse — заданная `attackAbility`
 * (по умолчанию Сила).
 *
 * @param actor - актёр-владелец
 * @param weapon - оружие
 * @returns значение характеристики (1-30)
 */
export function resolveWeaponAbilityScore(
  actor: DnDActor,
  weapon: GameItem,
): number {
  const abilities = actor.system?.abilities;

  if (weapon.weaponProperties?.includes('finesse')) {
    return Math.max(abilities?.strength ?? 10, abilities?.dexterity ?? 10);
  }

  return abilities?.[weapon.attackAbility ?? 'strength'] ?? 10;
}

export function calculateWeaponAttackModifier(
  actor: DnDActor,
  weapon: GameItem,
  resolvedStats?: import('./activeEffectTypes.js').ResolvedActorStats,
): number {
  const abilityScore = resolveWeaponAbilityScore(actor, weapon);

  let modifier = calculateAbilityModifier(abilityScore);

  if (resolveWeaponProficiency(actor, weapon)) {
    modifier += calculateProficiencyBonus(getTotalLevel(actor.system?.classes));
  }

  if (weapon.attackBonus) {
    modifier += weapon.attackBonus;
  }

  // Учёт магического бонуса
  if (weapon.isMagical && weapon.magicBonus) {
    modifier += Number(weapon.magicBonus);
  }

  // Бонусы от Active Effects (ауры, экипировка и т.д.)
  if (resolvedStats) {
    const isMelee = weapon.rangeType !== 'ranged';

    modifier += isMelee
      ? resolvedStats.attackBonuses.melee
      : resolvedStats.attackBonuses.ranged;
  }

  return modifier;
}

/**
 * Рассчитывает статический модификатор урона для оружия на основе характеристик актёра.
 * Учитывает модификатор характеристики и статические бонусы урона от Active Effects.
 *
 * @param actor - актёр-владелец
 * @param weapon - оружие
 * @param resolvedStats - итоговые статы из пайплайна (для бонусов от эффектов)
 * @returns статический бонус к урону
 */
export function calculateWeaponDamageModifier(
  actor: DnDActor,
  weapon: GameItem,
  resolvedStats?: import('./activeEffectTypes.js').ResolvedActorStats,
): number {
  const abilityScore = resolveWeaponAbilityScore(actor, weapon);

  let modifier = calculateAbilityModifier(abilityScore);

  // Бонусы от Active Effects (ауры, экипировка и т.д.)
  if (resolvedStats) {
    const isMelee = weapon.rangeType !== 'ranged';

    modifier += isMelee
      ? resolvedStats.damageBonuses.melee
      : resolvedStats.damageBonuses.ranged;
  }

  return modifier;
}

/**
 * Проверяет, удерживается ли универсальное (versatile) оружие двумя руками.
 * Хват двумя руками задаётся флагом `twoHandedGrip` и имеет смысл только для
 * оружия со свойством `versatile`.
 *
 * @param weapon - оружие
 * @returns true, если versatile-оружие в текущий момент удерживается двумя руками
 */
export function isVersatileTwoHandedGrip(weapon: GameItem): boolean {
  return (
    Boolean(weapon.twoHandedGrip)
    && Boolean(weapon.weaponProperties?.includes('versatile'))
  );
}

/**
 * Возвращает части урона оружия с учётом хвата (versatile).
 *
 * Источник истины боевого урона оружия — `damageParts` (единый со
 * заклинаниями движок). При хвате двумя руками для каждой части, у которой
 * задана `versatileFormula`, формула заменяется на неё (правило versatile
 * касается только базовых костей оружия).
 *
 * @param weapon - оружие
 * @returns части урона (с применённым versatile-хватом); `[]` если урон не задан
 */
export function getWeaponDamageParts(weapon: GameItem): DamagePart[] {
  const parts = weapon.damageParts ?? [];

  if (!isVersatileTwoHandedGrip(weapon)) {
    return parts;
  }

  return parts.map((part) =>
    part.versatileFormula ? { ...part, formula: part.versatileFormula } : part,
  );
}

/**
 * Возвращает основной тип урона оружия — для подписей в списках/карточках и
 * дефолтного типа сегментов. Источник истины — первый инлайн-токен `@dmg.<type>`
 * в формуле первой части (если есть), иначе поле `type` первой части.
 *
 * @param weapon - оружие
 * @returns тип урона первой части или undefined, если урон не задан
 */
export function getWeaponPrimaryDamageType(
  weapon: GameItem,
): string | undefined {
  const part = getWeaponDamageParts(weapon)[0];

  if (!part) {
    return undefined;
  }

  const tokenMatch = part.formula.match(/@dmg\.([a-z]+)/i);

  return tokenMatch ? tokenMatch[1].toLowerCase() : part.type;
}

/**
 * Форматирует формулы урона оружия для отображения: формулы всех частей,
 * соединённые « + », без инлайн-токенов (`@dmg.*`/`@heal`) и с заменой латинской
 * `d` на кириллическую `к` (`1d8` → `1к8`). Versatile-хват не учитывается.
 *
 * @param weapon - оружие
 * @returns строка вида «1к8 + 1к6» или пустая строка, если урон не задан
 */
export function formatWeaponDamageFormula(weapon: GameItem): string {
  return getWeaponDamageParts(weapon)
    .map((part) =>
      part.formula
        .replace(/@dmg\.[a-z]+/gi, '')
        .replace(/@heal(\.temp)?/gi, '')
        .replace(/(\d+)d(\d+)/gi, '$1к$2')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter((formula) => formula.length > 0)
    .join(' + ');
}

/**
 * Возвращает приоритетный тип движения и его значение для отображения в стат-блоке.
 *
 * @param movement - Объект движения персонажа
 * @returns Тип и значение приоритетного движения
 */
export function getDisplayMovement(movement: ActorMovement): {
  type: MovementType;
  value: number;
  label: string;
} {
  let bestType: MovementType = 'walk';
  let bestValue = movement.walk;

  for (const type of MOVEMENT_PRIORITY) {
    const value = movement[type];

    if (typeof value !== 'number' || value <= 0) {
      continue;
    }

    if (
      value > bestValue
      || (value === bestValue
        && MOVEMENT_PRIORITY.indexOf(type)
          < MOVEMENT_PRIORITY.indexOf(bestType))
    ) {
      bestType = type;
      bestValue = value;
    }
  }

  return { type: bestType, value: bestValue, label: MOVEMENT_LABELS[bestType] };
}

/**
 * Возвращает список ненулевых типов движения для tooltip
 *
 * @param movement - Объект движения персонажа
 * @returns Массив типов с ненулевыми значениями, отсортированных по приоритету
 */
export function getMovementList(
  movement: ActorMovement,
): Array<{ type: MovementType; value: number; label: string }> {
  return MOVEMENT_PRIORITY.filter((type) => {
    const value = movement[type];

    return typeof value === 'number' && value > 0;
  }).map((type) => ({
    type,
    value: movement[type] as number,
    label: MOVEMENT_LABELS[type],
  }));
}

/**
 * Нормализует объект актёра: если данные хранятся на корне (legacy-формат),
 * переносит их в `system` (новый формат DnDActorSystem).
 *
 * Вызывать при загрузке актёра из БД или получении по WebSocket.
 * Мутирует объект на месте и возвращает его для удобства.
 *
 * @param actor - объект актёра (может быть legacy или новый формат)
 * @returns нормализованный актёр с заполненным system
 */
export function normalizeActor(actor: DnDActor): DnDActor {
  const raw = actor as unknown as Record<string, unknown>;

  // Дискриминатор типа сущности
  actor.entityType = 'actor';

  if (!Array.isArray(actor.activeEffects)) {
    actor.activeEffects = [];
  }

  // Если system уже заполнен (есть abilities) — просто проверяем currency
  if (actor.system?.abilities) {
    if (!actor.system.currency) {
      actor.system.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    }

    return actor;
  }

  actor.system = {
    species:
      (raw.species as import('./speciesTypes.js').ActorSpeciesEntry | null)
      ?? null,
    background: null,
    classes: [],
    experience: (raw.experience as number) ?? 0,
    inspiration: (raw.inspiration as boolean) ?? false,
    size: (raw.size as string as import('./types.js').CreatureSize) ?? 'medium',

    abilities: {
      strength: (raw.strength as number) ?? 10,
      dexterity: (raw.dexterity as number) ?? 10,
      constitution: (raw.constitution as number) ?? 10,
      intelligence: (raw.intelligence as number) ?? 10,
      wisdom: (raw.wisdom as number) ?? 10,
      charisma: (raw.charisma as number) ?? 10,
    },

    movement: (raw.movement as ActorMovement) ?? {
      walk: 30,
      swim: 0,
      fly: 0,
      climb: 0,
      burrow: 0,
      hover: false,
      units: 'ft',
    },

    armorClass: (raw.armorClass as DnDActor['system']['armorClass']) ?? {
      value: 10,
      calculation: 'default',
      formula: '',
      flat: null,
    },

    hitPoints: actor.system?.hitPoints ?? {
      current: 10,
      max: 10,
      temp: 0,
    },

    initiativeBonus: (raw.initiativeBonus as number) ?? 0,
    initiativeAbility:
      (raw.initiativeAbility as DnDActor['system']['initiativeAbility'])
      ?? 'dexterity',

    proficiencies:
      (raw.proficiencies as DnDActor['system']['proficiencies']) ?? {
        armor: [],
        weapons: [],
        weaponMasteries: [],
        tools: [],
        languages: ['Общий'],
        savingThrows: [],
        skills: {},
      },

    currency: (raw.currency as DnDActor['system']['currency']) ?? {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
    },

    classCounters: [],
  };

  return actor;
}

/**
 * Нормализует объект существа: если данные отсутствуют или неполные,
 * заполняет значениями по умолчанию.
 *
 * Вызывать при загрузке существа из БД.
 * Мутирует объект на месте и возвращает его для удобства.
 *
 * @param creature - объект существа (может быть legacy или новый формат)
 * @returns нормализованное существо с заполненным system
 */
export function normalizeCreature(
  creature: import('./dndEntities.js').Creature,
): import('./dndEntities.js').Creature {
  // Дискриминатор типа сущности
  creature.entityType = 'creature';

  // Если system отсутствует — создаём дефолтный
  if (!creature.system) {
    // SQL↔TS boundary: legacy существо может не иметь system
    (creature as unknown as Record<string, unknown>).system = {
      size: 'medium',
      type: 'humanoid',
      subtype: '',
      alignment: 'unaligned',
      armorClass: { value: 10, calculation: 'flat', formula: '', flat: 10 },
      hitPoints: { average: 10, formula: '' },
      movement: {
        walk: 30,
        swim: 0,
        fly: 0,
        climb: 0,
        burrow: 0,
        hover: false,
        units: 'ft',
      },
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      challengeRating: '0',
      proficiencyBonus: 2,
      savingThrows: [],
      skills: {},
      defenses: {
        vulnerabilities: [],
        resistances: [],
        immunities: [],
        conditionImmunities: [],
      },
      senses: '',
      languages: [],
      environments: [],
      customEnvironments: '',
      traits: [],
      actions: [],
      bonusActions: [],
      reactions: [],
      legendary: { count: 0, actions: [] },
    };
  }

  const system = creature.system;

  // Заполняем отсутствующие поля
  if (!system.defenses) {
    system.defenses = {
      vulnerabilities: [],
      resistances: [],
      immunities: [],
      conditionImmunities: [],
    };
  }

  // Коэрсия legacy-формата (текстовые поля старых миров → пустые структуры)
  if (!Array.isArray(system.defenses.vulnerabilities)) {
    system.defenses.vulnerabilities = [];
  }

  if (!Array.isArray(system.defenses.resistances)) {
    system.defenses.resistances = [];
  }

  if (!Array.isArray(system.defenses.immunities)) {
    system.defenses.immunities = [];
  }

  if (!Array.isArray(system.defenses.conditionImmunities)) {
    system.defenses.conditionImmunities = [];
  }

  if (!Array.isArray(system.savingThrows)) {
    system.savingThrows = [];
  }

  if (typeof system.skills !== 'object' || system.skills === null) {
    system.skills = {};
  }

  if (!Array.isArray(system.languages)) {
    system.languages = [];
  }

  if (!system.legendary) {
    system.legendary = { count: 0, actions: [] };
  }

  if (!Array.isArray(system.traits)) {
    system.traits = [];
  }

  if (!Array.isArray(system.actions)) {
    system.actions = [];
  }

  if (!Array.isArray(system.bonusActions)) {
    system.bonusActions = [];
  }

  if (!Array.isArray(system.reactions)) {
    system.reactions = [];
  }

  if (!Array.isArray(system.environments)) {
    system.environments = [];
  }

  if (typeof system.customEnvironments !== 'string') {
    system.customEnvironments = '';
  }

  // Нормализация movement: если отсутствует (legacy-существа) — дефолт 30 фт.
  if (!system.movement) {
    system.movement = {
      walk: 30,
      swim: 0,
      fly: 0,
      climb: 0,
      burrow: 0,
      hover: false,
      units: 'ft',
    };
  }

  // Удаляем legacy-поле speed (текстовый дубликат movement)
  delete system.speed;

  // Нормализация заклинаний существа: коэрсим в массив и приводим recovery
  // зарядов к каноническому union (алиас 'day' → 'longRest')
  if (!Array.isArray(creature.spells)) {
    creature.spells = [];
  }

  for (const spell of creature.spells) {
    if (spell.uses) {
      spell.uses.recovery = normalizeSpellUsesRecovery(spell.uses.recovery);
    }
  }

  // Нормализация token: дефолты для существ — имя скрыто, ХП текстом
  if (!creature.token) {
    creature.token = {
      frameUrl: 'assets/token-frames/0.png',
      showName: false,
      hpDisplayMode: 'text',
      disposition: 'hostile',
    };
  } else {
    if (creature.token.showName === undefined) {
      creature.token.showName = false;
    }

    if (!creature.token.hpDisplayMode) {
      creature.token.hpDisplayMode = 'text';
    }

    if (!creature.token.disposition) {
      creature.token.disposition = 'hostile';
    }
  }

  return creature;
}
