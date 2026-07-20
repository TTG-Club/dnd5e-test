/**
 * Константы системы D&D 5e (PHB 2024)
 *
 * Это единственный источник правды для всех D&D-специфичных данных.
 * При переключении на другую систему — замени этот файл.
 */

import type {
  AbilityType,
  ActorMovement,
  MovementType,
  SkillType,
  ToolCategory,
} from '@vtt/shared';
import type { EquipmentCategory } from '@vtt/shared';
import type { ConditionKey } from './conditionKeys.js';
import type { DnDActor, SpellUsesRecovery } from './dndEntities.js';

// ============================================================
// Инструменты
// ============================================================

// ============================================================
// Базовые параметры (Core Rules)
// ============================================================

/** Базовый КД без брони (D&D 5e: 10 + DEX mod) */
export const BASE_UNARMORED_AC = 10;

// ============================================================
// Характеристики (Abilities)
// ============================================================

/** Характеристики для выбора в UI-селектах */
export const ABILITY_OPTIONS = [
  { value: 'strength' as const, label: 'Сила' },
  { value: 'dexterity' as const, label: 'Ловкость' },
  { value: 'constitution' as const, label: 'Телосложение' },
  { value: 'intelligence' as const, label: 'Интеллект' },
  { value: 'wisdom' as const, label: 'Мудрость' },
  { value: 'charisma' as const, label: 'Харизма' },
] as const;

// ============================================================
// Навыки → Характеристики (Skills → Abilities)
// ============================================================

/** Маппинг навыков к их базовым характеристикам */
export const SKILL_ABILITY_MAP: Record<SkillType, AbilityType> = {
  acrobatics: 'dexterity',
  animalHandling: 'wisdom',
  arcana: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  nature: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  sleightOfHand: 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom',
  religion: 'intelligence',
};

/** Список всех навыков с их локализованными названиями и базовыми характеристиками */
export const SKILLS_LIST: Array<{
  key: SkillType;
  label: string;
  ability: AbilityType;
}> = [
  { key: 'acrobatics', label: 'Акробатика', ability: 'dexterity' },
  { key: 'investigation', label: 'Анализ', ability: 'intelligence' },
  { key: 'arcana', label: 'Аркана', ability: 'intelligence' },
  { key: 'athletics', label: 'Атлетика', ability: 'strength' },
  { key: 'perception', label: 'Внимательность', ability: 'wisdom' },
  { key: 'survival', label: 'Выживание', ability: 'wisdom' },
  { key: 'performance', label: 'Выступление', ability: 'charisma' },
  { key: 'intimidation', label: 'Запугивание', ability: 'charisma' },
  { key: 'history', label: 'История', ability: 'intelligence' },
  { key: 'sleightOfHand', label: 'Ловкость рук', ability: 'dexterity' },
  { key: 'medicine', label: 'Медицина', ability: 'wisdom' },
  { key: 'deception', label: 'Обман', ability: 'charisma' },
  { key: 'nature', label: 'Природа', ability: 'intelligence' },
  { key: 'insight', label: 'Проницательность', ability: 'wisdom' },
  { key: 'religion', label: 'Религия', ability: 'intelligence' },
  { key: 'stealth', label: 'Скрытность', ability: 'dexterity' },
  { key: 'persuasion', label: 'Убеждение', ability: 'charisma' },
  { key: 'animalHandling', label: 'Уход за животными', ability: 'wisdom' },
];

/** Локализованные названия навыков (ключ → русский лейбл) */
export const SKILLS_LABELS: Record<SkillType, string> = Object.fromEntries(
  SKILLS_LIST.map((skill) => [skill.key, skill.label]),
) as Record<SkillType, string>;

/** Множество всех допустимых ключей навыков для быстрой проверки */
const SKILL_KEY_SET: ReadonlySet<string> = new Set(
  SKILLS_LIST.map((skill) => skill.key),
);

/**
 * Проверяет, является ли строка допустимым ключом навыка (`SkillType`).
 *
 * @param value Произвольная строка для проверки
 * @returns `true`, если `value` является `SkillType`
 */
export function isSkillType(value: string): value is SkillType {
  return SKILL_KEY_SET.has(value);
}

/** Локализованные названия характеристик (ключ → русский лейбл) */
export const ABILITY_LABELS: Record<AbilityType, string> = Object.fromEntries(
  ABILITY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AbilityType, string>;

// ============================================================
// Типы движения (Movement)
// ============================================================

/** Приоритет типов движения (от высшего к низшему) */
export const MOVEMENT_PRIORITY: MovementType[] = [
  'burrow',
  'climb',
  'fly',
  'swim',
  'walk',
];

/** Локализованные названия типов движения */
export const MOVEMENT_LABELS: Record<MovementType, string> = {
  burrow: 'Копание',
  climb: 'Лазание',
  fly: 'Полёт',
  swim: 'Плавание',
  walk: 'Ходьба',
};

/** Локализованные названия категорий инструментов */
export const TOOL_CATEGORIES: Record<ToolCategory, string> = {
  artisan: 'Инструменты ремесленника',
  gaming: 'Игровые наборы',
  musical: 'Музыкальные инструменты',
  other: 'Прочие инструменты',
};

/** Полный список всех инструментов с их локализованными названиями и категориями */
export const TOOLS_LIST: Array<{
  key: string;
  label: string;
  category: ToolCategory;
}> = [
  // Инструменты ремесленника
  {
    key: 'alchemists-supplies',
    label: 'Инструменты алхимика',
    category: 'artisan',
  },
  {
    key: 'brewers-supplies',
    label: 'Инструменты пивовара',
    category: 'artisan',
  },
  {
    key: 'calligraphers-supplies',
    label: 'Инструменты каллиграфа',
    category: 'artisan',
  },
  {
    key: 'carpenters-tools',
    label: 'Инструменты плотника',
    category: 'artisan',
  },
  {
    key: 'cartographers-tools',
    label: 'Инструменты картографа',
    category: 'artisan',
  },
  {
    key: 'cobblers-tools',
    label: 'Инструменты сапожника',
    category: 'artisan',
  },
  { key: 'cooks-utensils', label: 'Инструменты повара', category: 'artisan' },
  {
    key: 'glassblowers-tools',
    label: 'Инструменты стеклодува',
    category: 'artisan',
  },
  { key: 'jewelers-tools', label: 'Инструменты ювелира', category: 'artisan' },
  {
    key: 'leatherworkers-tools',
    label: 'Инструменты кожевника',
    category: 'artisan',
  },
  { key: 'masons-tools', label: 'Инструменты каменщика', category: 'artisan' },
  {
    key: 'painters-supplies',
    label: 'Инструменты художника',
    category: 'artisan',
  },
  { key: 'potters-tools', label: 'Инструменты гончара', category: 'artisan' },
  { key: 'smiths-tools', label: 'Инструменты кузнеца', category: 'artisan' },
  {
    key: 'tinkers-tools',
    label: 'Инструменты ремонтника',
    category: 'artisan',
  },
  { key: 'weavers-tools', label: 'Инструменты ткача', category: 'artisan' },
  {
    key: 'woodcarvers-tools',
    label: 'Инструменты резчика по дереву',
    category: 'artisan',
  },
  // Игровые наборы
  { key: 'dice-set', label: 'Набор костей', category: 'gaming' },
  {
    key: 'dragonchess-set',
    label: 'Шахматы «Копье дракона»',
    category: 'gaming',
  },
  {
    key: 'playing-card-set',
    label: 'Набор игральных карт',
    category: 'gaming',
  },
  {
    key: 'three-dragon-ante-set',
    label: 'Набор для игры «Три дракона»',
    category: 'gaming',
  },
  // Музыкальные инструменты
  { key: 'bagpipes', label: 'Волынка', category: 'musical' },
  { key: 'drum', label: 'Барабан', category: 'musical' },
  { key: 'dulcimer', label: 'Цимбалы', category: 'musical' },
  { key: 'flute', label: 'Флейта', category: 'musical' },
  { key: 'lute', label: 'Лютня', category: 'musical' },
  { key: 'lyre', label: 'Лира', category: 'musical' },
  { key: 'horn', label: 'Рожок', category: 'musical' },
  { key: 'pan-flute', label: 'Флейта Пана', category: 'musical' },
  { key: 'shawm', label: 'Шалмей', category: 'musical' },
  { key: 'viol', label: 'Виола', category: 'musical' },
  // Прочие инструменты
  { key: 'disguise-kit', label: 'Набор для маскировки', category: 'other' },
  { key: 'forgery-kit', label: 'Набор для фальсификации', category: 'other' },
  { key: 'herbalism-kit', label: 'Набор травника', category: 'other' },
  {
    key: 'navigators-tools',
    label: 'Инструменты навигатора',
    category: 'other',
  },
  { key: 'poisoners-kit', label: 'Набор отравителя', category: 'other' },
  { key: 'thieves-tools', label: 'Воровские инструменты', category: 'other' },
];

/** Локализованные названия инструментов (включая абстрактные группы) */
export const TOOLS_LABELS: Record<string, string> = {
  ...Object.fromEntries(TOOLS_LIST.map((tool) => [tool.key, tool.label])),
  // Обобщенные группы (для предысторий на выбор)
  'artisans-tools': 'Инструменты ремесленника (на выбор)',
  'gaming-set': 'Игровой набор (на выбор)',
  'musical-instrument': 'Музыкальный инструмент (на выбор)',
};

// ============================================================
// Языки
// ============================================================
export const LANGUAGE_TYPES = [
  // Стандартные языки
  'Общий',
  'Дварфийский',
  'Эльфийский',
  'Гигантский',
  'Гномский',
  'Гоблинский',
  'Полуросликовский',
  'Оркский',
  // Редкие языки
  'Абиссальный',
  'Небесный',
  'Глубинная речь',
  'Драконий',
  'Инфернальный',
  'Первоязык',
  'Сильван',
  'Подземный',
  // Экзотические языки
  'Друидический',
  'Язык воров',
];

// ============================================================
// Опыт и уровни
// ============================================================

/** Максимальный уровень персонажа */
export const MAX_LEVEL = 20;

/** Минимальное значение характеристики */
export const ABILITY_SCORE_MIN = 1;

/** Максимальное значение характеристики */
export const ABILITY_SCORE_MAX = 30;

/** Таблица опыта для уровней 1-20 */
export const EXPERIENCE_TABLE = [
  0, // Level 1
  300, // Level 2
  900, // Level 3
  2700, // Level 4
  6500, // Level 5
  14000, // Level 6
  23000, // Level 7
  34000, // Level 8
  48000, // Level 9
  64000, // Level 10
  85000, // Level 11
  100000, // Level 12
  120000, // Level 13
  140000, // Level 14
  165000, // Level 15
  195000, // Level 16
  225000, // Level 17
  265000, // Level 18
  305000, // Level 19
  355000, // Level 20
];

// ============================================================
// Редкость предметов (Item Rarity)
// ============================================================

/** Опции редкости предметов для UI-селекта */
export const RARITY_OPTIONS = [
  { value: 'none' as const, label: 'Не выбрана' },
  { value: 'common' as const, label: 'Обычный' },
  { value: 'uncommon' as const, label: 'Необычный' },
  { value: 'rare' as const, label: 'Редкий' },
  { value: 'very-rare' as const, label: 'Крайне редкий' },
  { value: 'legendary' as const, label: 'Легендарный' },
  { value: 'artifact' as const, label: 'Артефакт' },
] as const;

/** Цвета для отображения редкости в UI */
export const RARITY_COLORS: Record<string, string> = {
  'common': 'text-toned',
  'uncommon': 'text-success',
  'rare': 'text-info',
  'very-rare': 'text-primary',
  'legendary': 'text-warning',
  'artifact': 'text-error',
};

/** Локализованные названия редкости (ключ → русский лейбл) */
export const RARITY_LABELS: Record<string, string> = Object.fromEntries(
  RARITY_OPTIONS.map((option) => [option.value, option.label]),
);

// ============================================================
// Категории экипировки (Equipment Category)
// ============================================================

/** Иконка экипировки по умолчанию (Iconify, формат `tabler:*`) */
export const DEFAULT_EQUIPMENT_ICON = 'tabler:shirt';

/**
 * Иконки (Iconify `tabler:*`) для категорий экипировки.
 *
 * Содержит щит и не-бронные категории. Для брони
 * (`light`/`medium`/`heavy`) иконка берётся по базовому типу, поэтому
 * этих ключей здесь намеренно нет.
 */
export const EQUIPMENT_CATEGORY_ICONS: Partial<
  Record<EquipmentCategory, string>
> = {
  'shield': 'tabler:shield',
  'wand': 'tabler:wand',
  'ring': 'tabler:diamond',
  'trinket': 'tabler:crystal-ball',
  'clothing': 'tabler:shirt',
  'wondrous': 'tabler:sparkles',
  'food': 'tabler:meat',
  'adventurer-equipment': 'tabler:backpack',
};

/**
 * Возвращает иконку категории экипировки или `fallback`, если для
 * категории нет своей иконки либо категория не задана.
 *
 * @param category - ключ категории экипировки
 * @param fallback - иконка по умолчанию (по умолчанию `DEFAULT_EQUIPMENT_ICON`)
 * @returns имя иконки в формате `tabler:*`
 */
export function getEquipmentCategoryIcon(
  category: EquipmentCategory | undefined,
  fallback: string = DEFAULT_EQUIPMENT_ICON,
): string {
  if (!category) {
    return fallback;
  }

  return EQUIPMENT_CATEGORY_ICONS[category] ?? fallback;
}

// ============================================================
// Значения по умолчанию для актора
// ============================================================

/** Значения по умолчанию для нового актора D&D 5e */
export const DEFAULT_ACTOR: Omit<DnDActor, 'id'> = {
  entityType: 'actor',
  ownerId: undefined,
  name: 'Новый персонаж',
  description: '',
  avatar: undefined,

  // Токен (рамка включена по умолчанию)
  token: {
    frameUrl: 'assets/token-frames/0.png',
    showName: false,
  },

  // Системные данные D&D 5e
  system: {
    species: null,
    background: null,
    classes: [],
    experience: 0,
    inspiration: false,
    size: 'medium',

    abilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },

    movement: {
      walk: 30,
      swim: 0,
      fly: 0,
      climb: 0,
      burrow: 0,
      hover: false,
      units: 'ft',
    } satisfies ActorMovement,
    armorClass: {
      value: 10,
      calculation: 'default',
      formula: '',
      flat: null,
    },
    hitPoints: {
      current: 10,
      max: 10,
      temp: 0,
    },
    initiativeBonus: 0,
    initiativeAbility: 'dexterity',

    proficiencies: {
      armor: [],
      weapons: [],
      tools: [],
      languages: ['Общий'],
      savingThrows: [],
      skills: {},
      weaponMasteries: [],
    },

    currency: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
    },
    spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactSlotsUsed: 0,
    classCounters: [],
  },
  // Контентные данные актора (на корне, не в system)
  spells: [],
  equipment: [],
  features: [],
  activeEffects: [],
  notes: '',
};

// ============================================================
// Состояния (Conditions) D&D 5e (PHB 2024)
// ============================================================

/** Ключ состояния D&D 5e (определён в leaf-модуле `conditionKeys`) */
export type { ConditionKey };

/** Данные одного состояния D&D 5e */
export interface ConditionEntry {
  /** Уникальный ключ состояния */
  key: ConditionKey;
  /** Название на русском */
  nameRu: string;
  /** Название на английском */
  nameEn: string;
  /** Иконка из коллекции fluent (как fallback) */
  icon: string;
  /** Путь к кастомной SVG-иконке в public/assets/status/ (имеет приоритет над icon) */
  customImage?: string;
  /** Описание эффектов состояния */
  description: string;
}

/**
 * Все состояния D&D 5e (PHB 2024)
 *
 * Источник: https://new.ttg.club/glossary/condition-phb
 */
export const CONDITIONS: readonly ConditionEntry[] = [
  {
    key: 'blinded',
    nameRu: 'Ослеплённый',
    nameEn: 'Blinded',
    icon: 'tabler:eye-off',
    customImage: '/assets/status/blinded.svg',
    description:
      'Автоматический провал проверок, требующих зрение. Броски атаки против вас с преимуществом, ваши — с помехой.',
  },
  {
    key: 'charmed',
    nameRu: 'Очарованный',
    nameEn: 'Charmed',
    icon: 'tabler:heart',
    customImage: '/assets/status/charmed.svg',
    description:
      'Нельзя атаковать или вредить очаровавшему. Очаровавший имеет преимущество на социальные проверки против вас.',
  },
  {
    key: 'deafened',
    nameRu: 'Оглохший',
    nameEn: 'Deafened',
    icon: 'tabler:ear-off',
    description:
      'Не можете слышать. Автоматический провал проверок, требующих слух.',
  },
  {
    key: 'exhaustion',
    nameRu: 'Истощённый',
    nameEn: 'Exhaustion',
    icon: 'tabler:battery-off',
    customImage: '/assets/status/exhaustion.svg',
    description:
      'Накапливается (до 6 степеней, смерть на 6). Тест к20 −2 за степень. Скорость −5 фт за степень. Продолжительный отдых снимает 1 степень.',
  },
  {
    key: 'frightened',
    nameRu: 'Испуганный',
    nameEn: 'Frightened',
    icon: 'tabler:mood-sad',
    customImage: '/assets/status/frightened.svg',
    description:
      'Помеха на проверки характеристик и броски атаки, пока источник страха в зоне видимости. Нельзя добровольно приблизиться к источнику.',
  },
  {
    key: 'grappled',
    nameRu: 'Схваченный',
    nameEn: 'Grappled',
    icon: 'tabler:hand-stop',
    customImage: '/assets/status/grappled.svg',
    description:
      'Скорость равна 0. Перемещение того, кто схватил, стоит дополнительно.',
  },
  {
    key: 'incapacitated',
    nameRu: 'Недееспособный',
    nameEn: 'Incapacitated',
    icon: 'tabler:ban',
    description:
      'Нет действий, бонусных действий и реакций. Нет концентрации. Нельзя говорить. Помеха на инициативу.',
  },
  {
    key: 'invisible',
    nameRu: 'Невидимый',
    nameEn: 'Invisible',
    icon: 'tabler:eye-closed',
    description:
      'Преимущество на инициативу. Атаки против вас с помехой, ваши — с преимуществом. Не подвержены эффектам, требующим видимость цели.',
  },
  {
    key: 'paralyzed',
    nameRu: 'Парализованный',
    nameEn: 'Paralyzed',
    icon: 'tabler:user-minus',
    customImage: '/assets/status/paralyzed.svg',
    description:
      'Недееспособен. Скорость 0. Автопровал спасбросков СИЛ и ЛОВ. Атаки по вам с преимуществом. Крит в пределах 5 фт.',
  },
  {
    key: 'petrified',
    nameRu: 'Окаменевший',
    nameEn: 'Petrified',
    icon: 'tabler:diamond',
    customImage: '/assets/status/petrified.svg',
    description:
      'Превращение в камень. Недееспособен. Скорость 0. Автопровал спасбросков СИЛ и ЛОВ. Атаки с преимуществом. Сопротивление всему урону. Иммунитет к яду.',
  },
  {
    key: 'poisoned',
    nameRu: 'Отравленный',
    nameEn: 'Poisoned',
    icon: 'tabler:droplet',
    customImage: '/assets/status/poisoned.svg',
    description: 'Помеха на броски атаки и проверки характеристик.',
  },
  {
    key: 'prone',
    nameRu: 'Лежащий ничком',
    nameEn: 'Prone',
    icon: 'tabler:download',
    customImage: '/assets/status/prone.svg',
    description:
      'Передвижение только ползком или подъём (½ скорости). Помеха на ваши атаки. Преимущество атак в пределах 5 фт, иначе помеха.',
  },
  {
    key: 'restrained',
    nameRu: 'Опутанный',
    nameEn: 'Restrained',
    icon: 'tabler:link',
    customImage: '/assets/status/restrained.svg',
    description:
      'Скорость 0, не может быть увеличена. Атаки по вам с преимуществом, ваши — с помехой.',
  },
  {
    key: 'stunned',
    nameRu: 'Ошеломлённый',
    nameEn: 'Stunned',
    icon: 'tabler:bolt',
    customImage: '/assets/status/stunned.svg',
    description:
      'Недееспособен. Автопровал спасбросков СИЛ и ЛОВ. Атаки по вам с преимуществом.',
  },
  {
    key: 'unconscious',
    nameRu: 'Бессознательный',
    nameEn: 'Unconscious',
    icon: 'tabler:zzz',
    customImage: '/assets/status/unconscious.svg',
    description:
      'Недееспособен + лежащий ничком. Скорость 0. Автопровал СИЛ и ЛОВ. Атаки с преимуществом. Крит в пределах 5 фт. Не осознаёте окружение.',
  },
] as const;

/** Текстовые константы для UI вкладки эффектов */
export const EffectsTabLabels = {
  EmptyState: 'Нет активных состояний',
  SectionTitle: 'Состояния',
} as const;

// ============================================================
// Валюты (Currency)
// ============================================================

/** Тип валюты D&D 5e */
export type CurrencyType = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';

/** Опции валют для выпадающего списка */
export const CURRENCY_OPTIONS: ReadonlyArray<{
  value: CurrencyType;
  label: string;
  labelShort: string;
}> = [
  { value: 'cp', label: 'Медные (мм)', labelShort: 'мм' },
  { value: 'sp', label: 'Серебряные (см)', labelShort: 'см' },
  { value: 'ep', label: 'Электрумовые (эм)', labelShort: 'эм' },
  { value: 'gp', label: 'Золотые (зм)', labelShort: 'зм' },
  { value: 'pp', label: 'Платиновые (пм)', labelShort: 'пм' },
] as const;

/** Валюта по умолчанию */
export const DEFAULT_CURRENCY: CurrencyType = 'gp';

/**
 * Парсит строку стоимости (напр. "15 зм") в структурированный объект.
 *
 * @param cost - строка или объект стоимости
 * @returns объект { value, currency }
 */
export function parseCost(
  cost: string | { value: number; currency?: string } | undefined | null,
): { value: number; currency: CurrencyType } {
  if (!cost) {
    return { value: 0, currency: DEFAULT_CURRENCY };
  }

  if (typeof cost === 'object') {
    return {
      value: cost.value ?? 0,
      currency: (cost.currency as CurrencyType) || DEFAULT_CURRENCY,
    };
  }

  // Парсим строку типа "15 зм", "100 мм", "25gp"
  const shortToKey: Record<string, CurrencyType> = {
    мм: 'cp',
    cp: 'cp',
    см: 'sp',
    sp: 'sp',
    эм: 'ep',
    ep: 'ep',
    зм: 'gp',
    gp: 'gp',
    пм: 'pp',
    pp: 'pp',
  };

  // eslint-disable-next-line regexp/no-obscure-range
  const match = cost.trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zа-яё]+)?$/i);

  if (!match) {
    return { value: 0, currency: DEFAULT_CURRENCY };
  }

  const numericValue = Number.parseFloat(match[1].replace(',', '.'));
  const currencyStr = match[2]?.toLowerCase() ?? '';

  return {
    value: Number.isNaN(numericValue) ? 0 : numericValue,
    currency: shortToKey[currencyStr] ?? DEFAULT_CURRENCY,
  };
}

// ============================================================
// Состояния здоровья (Health Conditions) для текстового отображения ХП
// ============================================================

export type { HealthCondition, HpDisplayMode } from '@vtt/shared';

export { getHealthCondition, HEALTH_CONDITIONS } from '@vtt/shared';

// ============================================================
// Существа — Типы (Creature Categories)
// ============================================================

/** Локализованные названия типов существ */
export const CREATURE_CATEGORIES: Record<
  import('./creatureTypes.js').CreatureCategory,
  string
> = {
  aberration: 'Аберрация',
  beast: 'Зверь',
  celestial: 'Небожитель',
  construct: 'Конструкт',
  dragon: 'Дракон',
  elemental: 'Элементаль',
  fey: 'Фея',
  fiend: 'Исчадие',
  giant: 'Великан',
  humanoid: 'Гуманоид',
  monstrosity: 'Чудовище',
  ooze: 'Слизь',
  plant: 'Растение',
  undead: 'Нежить',
};

/** Опции типов существ для UI-селектов */
export const CREATURE_CATEGORY_OPTIONS = Object.entries(
  CREATURE_CATEGORIES,
).map(([value, label]) => ({ value, label }));

/**
 * Локализованные названия типов существ для актёров и видов (Species).
 *
 * Включает `swarm`, в отличие от `CREATURE_CATEGORIES` (только бестиарные типы).
 */
export const CREATURE_TYPE_LABELS: Record<
  import('./speciesTypes.js').CreatureType,
  string
> = {
  ...CREATURE_CATEGORIES,
  swarm: 'Рой',
  monstrosity: 'Монстр',
};

// ============================================================
// Существа — Мировоззрения (Creature Alignments)
// ============================================================

/** Локализованные названия мировоззрений */
export const CREATURE_ALIGNMENTS: Record<
  import('./creatureTypes.js').CreatureAlignment,
  string
> = {
  'lawful-good': 'Законное доброе',
  'neutral-good': 'Нейтральное доброе',
  'chaotic-good': 'Хаотичное доброе',
  'lawful-neutral': 'Законное нейтральное',
  'true-neutral': 'Истинно нейтральное',
  'chaotic-neutral': 'Хаотичное нейтральное',
  'lawful-evil': 'Законное злое',
  'neutral-evil': 'Нейтральное злое',
  'chaotic-evil': 'Хаотичное злое',
  'unaligned': 'Без мировоззрения',
  'any': 'Любое мировоззрение',
};

/** Опции мировоззрений для UI-селектов */
export const CREATURE_ALIGNMENT_OPTIONS = Object.entries(
  CREATURE_ALIGNMENTS,
).map(([value, label]) => ({ value, label }));

/**
 * Возвращает русскую локализацию мировоззрения.
 *
 * Нормализует ключ (пробелы → дефисы, приведение к lowercase)
 * для совместимости с данными JSON-компендиума, где ключи
 * могут приходить в формате `"chaotic evil"` вместо `"chaotic-evil"`.
 *
 * @param alignment - ключ мировоззрения (может содержать пробелы или дефисы)
 * @returns русское название или undefined если ключ неизвестен
 */
export function getAlignmentLabel(alignment: string): string | undefined {
  const directMatch =
    CREATURE_ALIGNMENTS[alignment as keyof typeof CREATURE_ALIGNMENTS];

  if (directMatch) {
    return directMatch;
  }

  // Нормализация: пробелы → дефисы, lowercase
  const normalized = alignment.toLowerCase().replace(/\s+/g, '-');

  return CREATURE_ALIGNMENTS[normalized as keyof typeof CREATURE_ALIGNMENTS];
}

// ============================================================
// Существа — Размеры (Creature Sizes)
// ============================================================

/** Локализованные названия размеров существ */
export const CREATURE_SIZE_LABELS: Record<
  import('./types.js').CreatureSize,
  string
> = {
  tiny: 'Крошечный',
  small: 'Маленький',
  medium: 'Средний',
  large: 'Большой',
  huge: 'Огромный',
  gargantuan: 'Громадный',
};

/** Опции размеров для UI-селектов */
export const CREATURE_SIZE_OPTIONS = Object.entries(CREATURE_SIZE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

// ============================================================
// Существа — Показатели опасности (Challenge Ratings)
// ============================================================

/**
 * Таблица показателей опасности D&D 5e.
 * Содержит CR, опыт и бонус мастерства.
 */
export const CR_TABLE: ReadonlyArray<{
  cr: string;
  xp: number;
  proficiencyBonus: number;
}> = [
  { cr: '0', xp: 0, proficiencyBonus: 2 },
  { cr: '1/8', xp: 25, proficiencyBonus: 2 },
  { cr: '1/4', xp: 50, proficiencyBonus: 2 },
  { cr: '1/2', xp: 100, proficiencyBonus: 2 },
  { cr: '1', xp: 200, proficiencyBonus: 2 },
  { cr: '2', xp: 450, proficiencyBonus: 2 },
  { cr: '3', xp: 700, proficiencyBonus: 2 },
  { cr: '4', xp: 1100, proficiencyBonus: 2 },
  { cr: '5', xp: 1800, proficiencyBonus: 3 },
  { cr: '6', xp: 2300, proficiencyBonus: 3 },
  { cr: '7', xp: 2900, proficiencyBonus: 3 },
  { cr: '8', xp: 3900, proficiencyBonus: 3 },
  { cr: '9', xp: 5000, proficiencyBonus: 4 },
  { cr: '10', xp: 5900, proficiencyBonus: 4 },
  { cr: '11', xp: 7200, proficiencyBonus: 4 },
  { cr: '12', xp: 8400, proficiencyBonus: 4 },
  { cr: '13', xp: 10000, proficiencyBonus: 5 },
  { cr: '14', xp: 11500, proficiencyBonus: 5 },
  { cr: '15', xp: 13000, proficiencyBonus: 5 },
  { cr: '16', xp: 15000, proficiencyBonus: 5 },
  { cr: '17', xp: 18000, proficiencyBonus: 6 },
  { cr: '18', xp: 20000, proficiencyBonus: 6 },
  { cr: '19', xp: 22000, proficiencyBonus: 6 },
  { cr: '20', xp: 25000, proficiencyBonus: 6 },
  { cr: '21', xp: 33000, proficiencyBonus: 7 },
  { cr: '22', xp: 41000, proficiencyBonus: 7 },
  { cr: '23', xp: 50000, proficiencyBonus: 7 },
  { cr: '24', xp: 62000, proficiencyBonus: 7 },
  { cr: '25', xp: 75000, proficiencyBonus: 8 },
  { cr: '26', xp: 90000, proficiencyBonus: 8 },
  { cr: '27', xp: 105000, proficiencyBonus: 8 },
  { cr: '28', xp: 120000, proficiencyBonus: 8 },
  { cr: '29', xp: 135000, proficiencyBonus: 9 },
  { cr: '30', xp: 155000, proficiencyBonus: 9 },
];

/** Опции CR для UI-селектов */
export const CR_OPTIONS = CR_TABLE.map((entry) => ({
  value: entry.cr,
  label: `${entry.cr} (${entry.xp.toLocaleString('ru-RU')} XP)`,
}));

// ============================================================
// Существа — Значения по умолчанию
// ============================================================

/** Значения по умолчанию для нового существа */
export const DEFAULT_CREATURE: Omit<import('./dndEntities.js').Creature, 'id'> =
  {
    entityType: 'creature',
    name: 'Новое существо',
    description: '',
    autoSaves: true,
    token: {
      frameUrl: 'assets/token-frames/0.png',
      showName: false,
      hpDisplayMode: 'text',
      disposition: 'hostile',
    },
    activeEffects: [],
    system: {
      size: 'medium',
      type: 'humanoid',
      subtype: '',
      alignment: 'unaligned',
      armorClass: { value: 10, calculation: 'flat', formula: '', flat: 10 },
      hitPoints: { average: 10, formula: '2к8 + 2' },
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
      senses: 'пассивная Внимательность 10',
      languages: ['Общий'],
      environments: [],
      customEnvironments: '',
      traits: [],
      actions: [],
      bonusActions: [],
      reactions: [],
      legendary: { count: 0, actions: [] },
    },
  };
export const CREATURE_ENVIRONMENTS = [
  { key: 'any', label: 'Любая' },
  { key: 'swamp', label: 'Болото' },
  { key: 'mountain', label: 'Гора' },
  { key: 'urban', label: 'Город' },
  { key: 'forest', label: 'Лес' },
  { key: 'planar', label: 'План бытия' },
  { key: 'coastal', label: 'Побережье' },
  { key: 'underwater', label: 'Подводный мир' },
  { key: 'underdark', label: 'Подземелье' },
  { key: 'arctic', label: 'Приполярье' },
  { key: 'desert', label: 'Пустыня' },
  { key: 'grassland', label: 'Степь' },
  { key: 'hill', label: 'Холм' },
] as const;

// ============================================================
// Заряды заклинаний (восстановление от отдыха)
// ============================================================

/** Опции способа восстановления зарядов заклинания (форма, список, макрос) */
export const SPELL_USES_RECOVERY_OPTIONS: ReadonlyArray<{
  value: SpellUsesRecovery;
  label: string;
}> = [
  { value: 'atWill', label: 'По желанию' },
  { value: 'shortRest', label: 'Короткий отдых' },
  { value: 'longRest', label: 'Продолжительный отдых' },
];

/** Карта значение → подпись для способа восстановления зарядов */
export const SPELL_USES_RECOVERY_LABELS: Record<SpellUsesRecovery, string> =
  Object.fromEntries(
    SPELL_USES_RECOVERY_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SpellUsesRecovery, string>;

/**
 * Нормализует способ восстановления зарядов к каноническому union из 3 значений.
 * Алиас `'day'` (формат стат-блоков 2024 «N/день») приводится к `'longRest'`.
 *
 * @param recovery - сырое значение восстановления (возможно, legacy/alias)
 * @returns канонический `SpellUsesRecovery`
 */
export function normalizeSpellUsesRecovery(
  recovery: unknown,
): SpellUsesRecovery {
  if (recovery === 'shortRest') {
    return 'shortRest';
  }

  if (recovery === 'longRest' || recovery === 'day') {
    return 'longRest';
  }

  return 'atWill';
}
