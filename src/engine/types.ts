/**
 * Типы данных игровой системы D&D 5e
 *
 * Все типы, специфичные для системы D&D 5e, которые заполняют
 * поле `system` в BaseActor (модульная архитектура).
 *
 * Ядро (Core) не знает про содержимое этих типов —
 * оно работает с `BaseActor.system: Record<string, unknown>`.
 */

import type {
  AbilityType,
  ActorArmorClass,
  ActorMovement,
  ProficiencyLevel,
  SkillType,
} from '@vtt/shared';
import type {
  ActorClassEntry,
  CounterRecovery,
  ManualHitDieGroup,
} from './classTypes.js';

/**
 * Текущее состояние счётчика классового ресурса на акторе
 *
 * Хранится в `actor.system.classCounters[]`.
 * Создаётся при добавлении класса и обновляется при повышении уровня.
 */
export interface ActorCounterState {
  /** Ключ счётчика (из ClassCounterDefinition.key) */
  counterKey: string;
  /** Ключ класса-владельца */
  classKey: string;
  /** Ключ подкласса (если счётчик от подкласса) */
  subclassKey?: string;
  /** Пользовательское название счётчика */
  name?: string;
  /** Пользовательское краткое название для компактного отображения */
  shortName?: string;
  /** Пользовательский тип восстановления */
  recovery?: CounterRecovery;
  /** Текущее значение */
  current: number;
  /** Максимальное значение (вычисляется из progression/formula) */
  max: number;
}

/** Валюта персонажа D&D 5e */
export interface DnDCurrency {
  cp: number; // Медные (Copper)
  sp: number; // Серебряные (Silver)
  ep: number; // Электрум (Electrum)
  gp: number; // Золотые (Gold)
  pp: number; // Платиновые (Platinum)
}

/**
 * Системные данные актора D&D 5e
 *
 * Содержит все D&D-специфичные поля, которые ранее были
 * частью монолитного Actor. Доступ: `actor.system.*`
 */
export interface DnDActorSystem {
  /** Index signature для совместимости с BaseActor.system: Record<string, unknown> */
  [key: string]: unknown;

  /**
   * Запись о виде актора (бывшая раса).
   * Содержит выбранный вид, размер и выборы особенностей.
   */
  species: import('./speciesTypes.js').ActorSpeciesEntry | null;
  /** Предыстория персонажа */
  background: import('./backgroundTypes.js').ActorBackgroundEntry | null;
  /** Классы персонажа (массив для мультикласса) */
  classes: ActorClassEntry[];
  /** Опыт персонажа */
  experience: number;
  /** Вдохновение: есть или нет (даёт/забирает только ГМ) */
  inspiration?: boolean;
  /** Размер существа (D&D 5e 2024) */
  size: CreatureSize;

  /** Значения характеристик (ability scores) */
  abilities: DnDAbilityScores;

  /** Передвижение персонажа */
  movement: ActorMovement;
  /** Класс доспеха */
  armorClass: ActorArmorClass;
  /** Здоровье */
  hitPoints: DnDHitPoints;
  /** Дополнительный бонус к инициативе */
  initiativeBonus: number;
  /** Характеристика для расчёта инициативы */
  initiativeAbility: AbilityType;

  /** Владения (proficiencies) */
  proficiencies: DnDProficiencies;

  /** Валюта (деньги) */
  currency: DnDCurrency;

  /** Использованные ячейки заклинаний [1-9 круг], индекс 0 = 1-й круг */
  spellSlotsUsed?: number[];

  /** Использованные ячейки Pact Magic (Warlock) */
  pactSlotsUsed?: number;

  /** Характеристика заклинания (переопределение, если отличается от класса) */
  spellcastingAbility?: AbilityType;

  /** Ручные кости хитов (для NPC и кастомных актёров без классов) */
  manualHitDice?: ManualHitDieGroup[];

  /** Счётчики классовых ресурсов (очки чародейства, кости превосходства и т.д.) */
  classCounters: ActorCounterState[];
}

/**
 * Размер существа D&D 5e
 */
export type CreatureSize =
  | 'tiny'
  | 'small'
  | 'medium'
  | 'large'
  | 'huge'
  | 'gargantuan';

/** Значения характеристик D&D 5e */
export interface DnDAbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

/** Здоровье персонажа D&D 5e */
export interface DnDHitPoints {
  current: number;
  max: number;
  temp: number;
}

/** Владения персонажа D&D 5e */
export interface DnDProficiencies {
  armor: string[];
  weapons: string[];
  /** Мастерство оружия (D&D 5.5e Weapon Mastery) — подмножество weapons */
  weaponMasteries: string[];
  tools: string[];
  languages: string[];
  savingThrows: AbilityType[];
  skills: Partial<Record<SkillType, ProficiencyLevel>>;
}
