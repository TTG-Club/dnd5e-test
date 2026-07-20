/**
 * Типы данных системы классов D&D 5e (PHB 2024)
 *
 * Содержит определения классов (SRD), подклассов,
 * записи классов на акторе и вспомогательные утилиты.
 */

import type {
  AbilityType,
  ArmorCategory,
  SkillType,
} from '@vtt/shared';

// ── Литеральные типы ─────────────────────────────────────────

/** Уникальный ключ класса */
export type ClassKey =
  | 'barbarian'
  | 'bard'
  | 'cleric'
  | 'druid'
  | 'fighter'
  | 'monk'
  | 'paladin'
  | 'ranger'
  | 'rogue'
  | 'sorcerer'
  | 'warlock'
  | 'wizard';

/** Тип заклинателя */
export type CasterType = 'full' | 'half' | 'third' | 'pact' | 'none';

/** Тип кости хитов */
export type HitDie = 6 | 8 | 10 | 12;

/**
 * Группа костей хитов одного размера без привязки к классу
 * (для NPC и кастомных актёров без классов).
 */
export interface ManualHitDieGroup {
  /** Размер кости (к6/к8/к10/к12) */
  die: HitDie;
  /** Всего костей в группе */
  total: number;
  /** Использовано костей */
  used: number;
}

/** Способ определения ХП при повышении уровня */
export type HitPointMethod = 'roll' | 'average' | 'max' | 'custom';

/** Тип восстановления счётчика классового ресурса */
export type CounterRecovery = 'short' | 'long';

// ── Счётчики классовых ресурсов ──────────────────────────────

/**
 * Определение счётчика класса/подкласса (SRD)
 *
 * Описывает ресурс, который класс или подкласс получает на определённом уровне
 * и который восстанавливается после короткого или продолжительного отдыха.
 * Примеры: очки чародейства, кости превосходства, очки духа, ярость.
 */
export interface ClassCounterDefinition {
  /** Уникальный ключ (напр. 'sorcery-points', 'superiority-dice') */
  key: string;
  /** Название на русском */
  name: string;
  /** Краткое название для компактного отображения в интерфейсе */
  shortName?: string;
  /** Название на английском */
  nameEn?: string;
  /** Уровень, с которого доступен счётчик */
  startLevel: number;
  /** Тип восстановления */
  recovery: CounterRecovery;
  /**
   * Прогрессия максимального значения по уровням.
   * Ключ — уровень (строка "1"–"20"), значение — максимальное количество.
   * Если не задано — используется formula.
   */
  progression?: Record<string, number>;
  /**
   * Формула расчёта максимума (если progression не задан).
   * Например: "level" (равно уровню), "level * 5", "chaMod" (мод. Харизмы).
   */
  formula?: string;
  /** Ключ особенности, к которой привязан счётчик (для авто-добавления) */
  featureKey?: string;
  /** Ключ подкласса, если счётчик от подкласса */
  subclassKey?: string;
  /** Описание счётчика */
  description?: string;
}

// ── Особенности класса ───────────────────────────────────────

/** Вариант выбора в рамках особенности (напр. Боевой стиль) */
export interface ClassFeatureChoice {
  /** Уникальный ключ варианта */
  key: string;
  /** Название на русском */
  name: string;
  /** Описание варианта */
  description: string;
}

/** Особенность класса, получаемая на определённом уровне */
export interface ClassFeature {
  /** Уникальный ключ (напр. 'fighting-style', 'second-wind') */
  key: string;
  /** Название на русском */
  name: string;
  /** Описание */
  description: string;
  /** Уровень, на котором получается */
  level: number;
  /** Принадлежит ли подклассу (ключ подкласса) */
  subclassKey?: string;
  /** Требуется ли выбор варианта (напр. Боевой стиль) */
  choices?: ClassFeatureChoice[];
  /** Если true - особенность не добавляется в финальный лист актора, служит только как инфо в повышении уровня */
  isInformationalOnly?: boolean;
  /**
   * ID заклинаний компендиума, которые умение предоставляет автоматически
   * (напр. «Избранный враг» следопыта даёт «Метку охотника»).
   * Такие заклинания всегда подготовлены и не тратят лимит ручного выбора.
   */
  grantedSpells?: string[];
  /**
   * Поуровневая выдача заклинаний умением: ключ — уровень КЛАССА (строка
   * «1»–«20»), значение — ID заклинаний компендиума, выдаваемых на этом
   * уровне. Используется для списков доменов/клятв/покровителей
   * («3 уровень: …, 5 уровень: …»). Правила те же, что у `grantedSpells`.
   */
  grantedSpellsByLevel?: Record<string, string[]>;
}

// ── Подкласс ─────────────────────────────────────────────────

/** Определение подкласса */
export interface SubclassDefinition {
  /** Уникальный ключ подкласса */
  key: string;
  /** Название на русском */
  name: string;
  /** Название на английском */
  nameEn: string;
  /** Описание */
  description: string;
  /** Уровень, на котором выбирается подкласс */
  unlockLevel: number;
  /** Особенности подкласса (по уровням) */
  features: ClassFeature[];
  /** Дополнительные заклинания (для подклассов заклинателей) */
  bonusSpells?: Array<{ spellLevel: number; spells: string[] }>;
  /** Ключ источника-книги из sources.json (напр. 'phb', 'dmg') */
  sourceKey?: string;
  /**
   * Заклинательная конфигурация подкласса.
   * Используется для подклассов с собственной магией (например, Мистический рыцарь, Таинственный стрелок).
   */
  spellcasting?: {
    /** Тип заклинателя */
    type: CasterType;
    /** Характеристика заклинания */
    ability: AbilityType;
    /** Уровень, с которого начинается заклинание */
    startLevel: number;
  };
  /**
   * Таблица прогрессии подкласса (уровни 1-20).
   * Используется для подклассов с собственной прогрессией (например, Мистический рыцарь).
   * Если задана — заменяет таблицу базового класса при просмотре подкласса.
   */
  levelTable?: ClassLevelEntry[];
  /**
   * Колонки таблицы прогрессии подкласса.
   * Используется совместно с levelTable.
   */
  tableColumns?: Array<{
    key?: string;
    label: string;
    children?: Array<{
      key: string;
      label: string;
    }>;
  }>;
  /** Счётчики подклассовых ресурсов (напр. кости превосходства) */
  counters?: ClassCounterDefinition[];
}

// ── Определение класса (SRD) ─────────────────────────────────

/** Запись таблицы прогрессии класса (для каждого уровня 1-20) */
export interface ClassLevelEntry {
  /** Уровень (1-20) */
  level: number;
  /** Бонус мастерства */
  proficiencyBonus: number;
  /** Массив ключей полученных способностей (ссылается на features) */
  featureKeys: string[];

  /** Сколько НОВЫХ заговоров выбрать при получении этого уровня */
  newCantrips?: number;
  /** Сколько НОВЫХ заклинаний 1+ уровня выбрать при получении этого уровня (свободный выбор круга) */
  newSpells?: number;
  /**
   * Покруговое ограничение выбора новых заклинаний.
   * Ключ — круг заклинания (строка "1"–"9"), значение — количество.
   * Если задано — заменяет `newSpells`, игрок выбирает строго указанное количество из каждого круга.
   */
  newSpellsByLevel?: Record<string, number>;

  /** Динамические колонки (например, cantripsKnown, sneakAttack, kiPoints) */
  [key: string]:
    | string
    | number
    | boolean
    | string[]
    | Record<string, number>
    | undefined;
}

/**
 * Определение класса D&D 5e (PHB 2024)
 *
 * Хранится в SRD JSON-файлах (srd/classes/fighter.json и т.д.).
 * Описывает все характеристики класса, не привязанные к конкретному актору.
 */
export interface ClassDefinition {
  /** Дискриминантное поле типа записи компендиума */
  type: 'class';
  /**
   * Уникальный ключ класса.
   *
   * Для канонических SRD-классов совпадает с {@link ClassKey} (12 значений),
   * но тип намеренно расширен до `string`, чтобы в мире можно было создавать
   * хоумбрю-классы с произвольным slug-ключом (как у видов/предысторий).
   */
  key: string;
  /** Название на русском */
  name: string;
  /** Название на английском */
  nameEn?: string;
  /** Описание класса */
  description?: string;
  /** Иконка для UI (формат: 'tabler:icon-name') */
  icon?: string;
  /** Ключ источника-книги из sources.json (напр. 'phb', 'dmg') */
  sourceKey?: string;
  /** Принадлежит ли классу к System Reference Document (SRD) */
  isSRD?: boolean;

  // --- Базовая механика ---
  /** Кость хитов (d6/d8/d10/d12) */
  hitDie: HitDie;

  // --- Владения ---
  /** Владения: доспехи */
  armorProficiencies: ArmorCategory[];
  /** Владения: оружие (ключи baseType или 'simple'/'martial') */
  weaponProficiencies: string[];
  /** Владения: инструменты */
  toolProficiencies?: string[];
  /** Владения: спасброски */
  savingThrowProficiencies: AbilityType[];
  /** Выбор навыков: количество и список для выбора */
  skillChoices: {
    /** Сколько навыков выбрать */
    count: number;
    /** Из какого списка */
    from: SkillType[];
  };

  /** Начальное снаряжение. Массив вариантов выбора (А, Б, В). */
  startingEquipment?: Array<{
    /** Ключ варианта (напр. 'A', 'B', 'C') */
    key: string;
    /** Человекочитаемое описание списка предметов в этом варианте */
    description: string;
  }>;

  /** Настраиваемые дополнительные колонки для таблицы уровней (например: Скрытая атака, Второе дыхание) */
  tableColumns?: Array<{
    /** Ключ значения в массиве levelTable */
    key?: string;
    /** Человекочитаемое название колонки */
    label: string;
    /** Подколонки для группировки заголовков (например: Ячейки заклинаний -> 1, 2, 3...) */
    children?: Array<{
      key: string;
      label: string;
    }>;
  }>;

  // --- Заклинательная способность ---
  /** Конфигурация заклинаний (null = нет заклинаний) */
  spellcasting?: {
    /** Тип заклинателя */
    type: CasterType;
    /** Характеристика заклинания */
    ability: AbilityType;
    /** Уровень, с которого начинается заклинание */
    startLevel: number;
  } | null;

  // --- Подклассы ---
  /** Уровень выбора подкласса */
  subclassLevel: number;
  /** Название группы подклассов («Воинский архетип», «Магическая традиция») */
  subclassLabel: string;
  /** Доступные подклассы */
  subclasses: SubclassDefinition[];

  // --- Прогрессия ---
  /** Особенности класса (все уровни) */
  features: ClassFeature[];
  /** Таблица прогрессии (уровни 1-20) */
  levelTable: ClassLevelEntry[];

  // --- Счётчики ---
  /** Счётчики классовых ресурсов (напр. очки чародейства, ярость) */
  counters?: ClassCounterDefinition[];

  // --- Мультикласс ---
  /**
   * Владения, получаемые при взятии этого класса как мультикласса (НЕ первый
   * класс персонажа). Для 12 канонических SRD-классов берётся из таблицы
   * {@link MULTICLASS_PROFICIENCIES} по ключу; для хоумбрю-классов (ключ вне
   * {@link ClassKey}) задаётся здесь явно в редакторе. Резолвится единым
   * хелпером {@link getMulticlassProficiencies}.
   */
  multiclassProficiencies?: MulticlassProficiencies;
}

// ── Класс на акторе ──────────────────────────────────────────

/** Запись ХП, полученных на конкретном уровне */
export interface HitPointGain {
  /** Уровень, на котором получены */
  level: number;
  /** Способ определения */
  method: HitPointMethod;
  /** Фактический результат (без мод. ТЕЛ) */
  rolled: number;
}

/**
 * Класс, принятый персонажем
 *
 * Хранится в `actor.system.classes[]`.
 * Каждая запись описывает один класс и его прогрессию на акторе.
 */
export interface ActorClassEntry {
  /** Ключ класса (из ClassDefinition.key) */
  classKey: string;
  /** Название класса (для отображения, если SRD недоступен) */
  className: string;
  /** Уровень в этом классе */
  level: number;
  /** Выбранный подкласс (null до subclassLevel) */
  subclassKey: string | null;
  /** Кость хитов (копия из ClassDefinition) */
  hitDie: HitDie;
  /** Использованные хитдайсы (для коротких отдыхов) */
  hitDiceUsed: number;
  /** История бросков ХП на каждый уровень (позволяет пересчёт при смене ТЕЛ) */
  hitPointsGained: HitPointGain[];
  /** Выбранные навыки при получении класса */
  chosenSkills: SkillType[];
  /** Выбранные варианты особенностей (featureKey → choiceKey) */
  featureChoices: Record<string, string>;
  /** Характеристика заклинателя (копия из ClassDefinition.spellcasting.ability) */
  spellcastingAbility?: AbilityType;
  /** Тип заклинателя (копия из ClassDefinition.spellcasting.type) */
  casterType?: CasterType;
}

// ── Утилиты ──────────────────────────────────────────────────

/**
 * Вычисляет суммарный уровень персонажа из массива классов
 *
 * @param classes - массив классов актора (может быть undefined/пустым)
 * @returns суммарный уровень (минимум 1)
 */
export function getTotalLevel(classes?: ActorClassEntry[]): number {
  if (!classes || classes.length === 0) {
    return 1;
  }

  return classes.reduce((sum, entry) => sum + entry.level, 0);
}

/**
 * Вычисляет максимальное здоровье из истории бросков ХП
 *
 * Формула: сумма всех hitPointsGained[].rolled + (мод. ТЕЛ × totalLevel)
 *
 * @param classes - массив классов актора
 * @param constitutionMod - модификатор Телосложения
 * @returns максимум ХП
 */
export function calculateMaxHP(
  classes: ActorClassEntry[],
  constitutionMod: number,
): number {
  if (classes.length === 0) {
    return 10 + constitutionMod;
  }

  const totalLevel = getTotalLevel(classes);

  const baseHP = classes.reduce((sum, entry) => {
    return (
      sum
      + entry.hitPointsGained.reduce((hpSum, gain) => hpSum + gain.rolled, 0)
    );
  }, 0);

  return Math.max(1, baseHP + constitutionMod * totalLevel);
}

// ── Мультикласс (PHB 2024) ───────────────────────────────────

/**
 * Владения, получаемые при мультиклассе (PHB 2024).
 *
 * Когда персонаж берёт первый уровень нового класса (не первый класс),
 * он получает только этот сокращённый набор, а НЕ полные стартовые владения.
 */
export interface MulticlassProficiencies {
  /** Владения доспехами */
  armor: ArmorCategory[];
  /** Владения оружием (категории 'simple'/'martial' или конкретные ключи) */
  weapons: string[];
  /** Владения инструментами */
  tools: string[];
  /** Количество навыков, которые можно выбрать из списка класса */
  skillChoices: number;
}

/** Таблица мультиклассовых владений (PHB 2024, глава «Мультикласс») */
export const MULTICLASS_PROFICIENCIES: Record<
  ClassKey,
  MulticlassProficiencies
> = {
  barbarian: {
    armor: ['shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    skillChoices: 0,
  },
  bard: { armor: ['light'], weapons: [], tools: [], skillChoices: 1 },
  cleric: {
    armor: ['light', 'medium', 'shield'],
    weapons: [],
    tools: [],
    skillChoices: 0,
  },
  druid: {
    armor: ['light', 'medium', 'shield'],
    weapons: [],
    tools: [],
    skillChoices: 0,
  },
  fighter: {
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    skillChoices: 0,
  },
  monk: { armor: [], weapons: ['simple'], tools: [], skillChoices: 0 },
  paladin: {
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    skillChoices: 0,
  },
  ranger: {
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    skillChoices: 1,
  },
  rogue: {
    armor: ['light'],
    weapons: [],
    tools: ['thieves-tools'],
    skillChoices: 1,
  },
  sorcerer: { armor: [], weapons: [], tools: [], skillChoices: 0 },
  warlock: {
    armor: ['light'],
    weapons: ['simple'],
    tools: [],
    skillChoices: 0,
  },
  wizard: { armor: [], weapons: [], tools: [], skillChoices: 0 },
};

/**
 * Возвращает владения для мультикласса по определению класса.
 *
 * Сначала смотрит явное поле `multiclassProficiencies` (хоумбрю-классы), затем
 * каноническую таблицу {@link MULTICLASS_PROFICIENCIES} по ключу (12 SRD-классов).
 * Для хоумбрю-класса без явного поля и неканоническим ключом вернёт `undefined`
 * — вызывающий код подставляет пустые значения.
 *
 * @param classDef - определение класса (нужны поля `key` и `multiclassProficiencies`)
 * @returns владения мультикласса или `undefined`
 */
export function getMulticlassProficiencies(
  classDef: Pick<ClassDefinition, 'key' | 'multiclassProficiencies'>,
): MulticlassProficiencies | undefined {
  if (classDef.multiclassProficiencies) {
    return classDef.multiclassProficiencies;
  }

  return Object.entries(MULTICLASS_PROFICIENCIES).find(
    ([canonicalKey]) => canonicalKey === classDef.key,
  )?.[1];
}

/** Опции классов для UI-селектов (мультиселект владельцев заклинания) */
export const CLASS_KEY_OPTIONS: { value: ClassKey; label: string }[] = [
  { value: 'barbarian', label: 'Варвар' },
  { value: 'bard', label: 'Бард' },
  { value: 'cleric', label: 'Жрец' },
  { value: 'druid', label: 'Друид' },
  { value: 'fighter', label: 'Воин' },
  { value: 'monk', label: 'Монах' },
  { value: 'paladin', label: 'Паладин' },
  { value: 'ranger', label: 'Следопыт' },
  { value: 'rogue', label: 'Плут' },
  { value: 'sorcerer', label: 'Чародей' },
  { value: 'warlock', label: 'Колдун' },
  { value: 'wizard', label: 'Волшебник' },
];

/** Локализованные названия классов (производные от CLASS_KEY_OPTIONS) */
export const CLASS_KEY_LABELS: Record<ClassKey, string> = Object.fromEntries(
  CLASS_KEY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ClassKey, string>;
