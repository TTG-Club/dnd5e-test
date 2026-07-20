/**
 * D&D 5e-сущности верхнего уровня (актор/существо/предмет/заклинание) и их
 * алиасы + спелл-структуры. Это D&D-ФОРМА сущностей — ядро с ней не работает
 * (у ядра нейтральные `BaseActor`/`BaseCreature`/`BaseGameItem`). Код системы
 * D&D импортит эти типы через субпуть `@vtt/shared/system/dnd.js`.
 *
 * Определения ПЕРЕЕХАЛИ СЮДА из `types/index.ts` (Ф3 A/X3) — теперь ядро типов
 * не зависит от system/dnd (движок правил приватен для системы).
 *
 * @module system/dnd/dndEntities
 */

import type {
  AbilityType,
  AmmunitionType,
  CompendiumSeparator,
  DamagePart,
  DistanceUnit,
  EquipmentCategory,
  Feature,
  SpellAreaOfEffect,
  SpellCastingTimeUnit,
  SpellComponents,
  SpellDeliveryType,
  SpellDurationUnit,
  SpellSaveType,
  SpellScaling,
  SpellSchool,
  SpellTargetType,
  ToolCategory,
  ToolProficiencyMode,
  WeaponCategory,
  WeaponProficiencyMode,
  WeaponProperty,
  WeaponRangeType,
} from '@vtt/shared';
import type {
  BaseActor,
  BaseCreature,
  BaseGameItem,
} from '@vtt/shared';
import type { ActiveEffect } from './activeEffectTypes.js';
import type {
  BackgroundAbilityGrant,
  BackgroundEquipmentOption,
  BackgroundFeatGrant,
  BackgroundSkillGrant,
  BackgroundToolGrant,
} from './backgroundTypes.js';
import type { ClassDefinition, ClassKey } from './classTypes.js';
import type { CreatureSystem } from './creatureTypes.js';
import type { FeatData } from './featTypes.js';
import type { SpeciesDefinition } from './speciesTypes.js';
import type { DnDActorSystem } from './types.js';

/**
 * Существо (NPC) D&D 5e — наследует нейтральную базу `BaseCreature` и добавляет
 * D&D-специфичную форму: `system: CreatureSystem` и корневые коллекции.
 */
export interface DnDCreature extends BaseCreature {
  /** Системные данные D&D 5e */
  system: CreatureSystem;
  /**
   * Заклинания существа (D&D 2024). Хранятся на верхнем уровне (как у
   * `DnDActor.spells`); параметры заклинательства (плоский DC/бонус атаки,
   * характеристика) — в `system.spellcasting`. Существа не тратят ячейки —
   * у каждого заклинания свои заряды `uses` с откатом от отдыха.
   */
  spells?: Spell[];
  /** Активные эффекты, примененные непосредственно к существу */
  activeEffects?: ActiveEffect[];
}
/**
 * Alias для обратной совместимости (симметрично `Actor = DnDActor`).
 *
 * @deprecated Используй `DnDCreature` для D&D-специфичного кода,
 *             `BaseCreature` для generic/core кода.
 */
export type Creature = DnDCreature;
/**
 * Предмет D&D 5e — наследует нейтральную базу `BaseGameItem` и добавляет
 * D&D-специфичную форму (оружие, снаряжение, черты, инструменты, предыстории,
 * заклинания, виды, классы). Зеркало `DnDActor`/`DnDCreature`. Ядро с этим
 * типом не работает — только код системы dnd5e (и серверная персистентность
 * встроенной системы через колонки).
 */
export interface DnDGameItem extends BaseGameItem {
  /** Универсальное оружие держится двумя руками (только для versatile) */
  twoHandedGrip?: boolean;
  // --- Weapon-specific (только для type === 'weapon') ---
  /** Базовый тип оружия (напр. 'longsword', 'dagger') */
  baseType?: string;
  /** Категория оружия */
  weaponCategory?: WeaponCategory;
  /** Оружейный приём (weapon mastery) */
  mastery?: string;
  /** Тип дальности */
  rangeType?: WeaponRangeType;
  /**
   * Части урона/лечения оружия — единый со заклинаниями движок урона.
   * Источник истины для боевой механики оружия (формулы, типы, условия,
   * лечение, versatile-альтернатива). Заменяет легаси `damageDice`/`damageType`.
   */
  damageParts?: DamagePart[];
  /** Свойства оружия */
  weaponProperties?: WeaponProperty[];
  /** Досягаемость оружия (в футах, по умолчанию 5) */
  reach?: number;
  /** Дальность (только для ranged/thrown) */
  range?: { normal: number; long?: number };
  /** Особое описание (для свойства special) */
  special?: string;
  /** Тип боеприпаса (только для оружия со свойством ammunition) */
  ammunitionType?: AmmunitionType;
  // --- Поля атаки (бывший Action) ---
  /** Характеристика для броска атаки */
  attackAbility?: AbilityType;
  /** Режим учёта бонуса мастерства (auto / always / never) */
  proficiencyMode?: WeaponProficiencyMode;
  /** Дополнительный бонус к атаке */
  attackBonus?: number;
  /**
   * Тип спасброска оружия (для оружия, заставляющего цель совершить спасбросок).
   * `none`/undefined — обычная атака с броском попадания.
   */
  saveType?: SpellSaveType;
  /** Что происходит с уроном оружия при успешном спасброске */
  saveEffect?: 'half' | 'none' | 'special';
  /** Единица измерения расстояния для оружия (по умолчанию ft) */
  distanceUnit?: DistanceUnit;
  // --- Equipment-specific (только для type === 'equipment') ---
  /** Категория снаряжения (лёгкий доспех, средний, тяжёлый, щит, кольцо, жезл...) */
  equipmentCategory?: EquipmentCategory;
  /** Базовый класс доспеха (для щита — бонус к КД, напр. 2) */
  baseArmorAC?: number;
  /** Максимальный бонус Ловкости к КД (null = без ограничений) */
  maxDexBonus?: number | null;
  /** Помеха на проверки Скрытности */
  stealthDisadvantage?: boolean;
  /** Минимальное значение Силы для ношения */
  strengthRequirement?: number;
  // --- Общие свойства экипировки ---
  /** Адамантиновый предмет */
  isAdamantine?: boolean;
  /** Магический предмет */
  isMagical?: boolean;
  /** Фокусирующий предмет (заклинательная фокусировка) */
  isFocus?: boolean;
  /** Тип настройки магического предмета (none / required / optional) */
  magicAttunement?: 'none' | 'required' | 'optional';
  /** Настроен ли магический предмет на персонажа */
  isAttuned?: boolean;
  /** Магический бонус (+1, +2, +3...) — к атаке/урону для оружия, к КД для брони */
  magicBonus?: number;
  // --- Feature-specific (только для type === 'feat') ---
  /** Можно ли выбрать черту повторно */
  repeatable?: boolean;
  /** Текст с пояснением условий повторного выбора */
  repeatableText?: string;
  /**
   * Полные «грант»-данные черты (владения, языки, защиты, повышение
   * характеристик, предусловия, выдаваемые заклинания). Хранится во вложенном
   * блобе по аналогии со `speciesData`; переносится на актора при применении
   * черты. См. {@link FeatData}.
   */
  featData?: FeatData;
  // --- Tool-specific (только для type === 'tool') ---
  /** Категория инструмента */
  toolCategory?: ToolCategory;
  /** Базовый тип инструмента (напр. 'thieves-tools', 'herbalism-kit') */
  baseToolType?: string;
  /** Бонус инструмента (числовой модификатор к проверкам) */
  toolBonus?: number;
  /** Характеристика для проверки инструмента */
  toolAbility?: AbilityType;
  /** Режим владения инструментом */
  toolProficiencyMode?: ToolProficiencyMode;
  // --- Background-specific (только для type === 'background') ---
  /**
   * Машинный ключ предыстории (как у видов/классов). Провенанс выданных
   * предысторией даров на акторе строится как `background:<key>`, поэтому
   * ключ обязателен для корректного применения и отката. Генерируется из
   * английского названия при создании в панели «Предметы».
   */
  key?: string;
  /** Повышение характеристик от предыстории */
  abilityGrant?: BackgroundAbilityGrant;
  /** Владение навыками от предыстории */
  skillGrant?: BackgroundSkillGrant;
  /** Владение инструментами от предыстории */
  toolGrant?: BackgroundToolGrant;
  /** Черта, даруемая предысторией */
  featGrant?: BackgroundFeatGrant;
  /** Стартовое снаряжение предыстории */
  equipmentOptions?: BackgroundEquipmentOption[];
  // --- Spell-specific (только для type === 'spell') ---
  /** Специфические данные заклинания (компоненты, ячейки, уровни и т.д.) */
  spellData?: Spell;
  // --- Species-specific (только для type === 'species') ---
  /**
   * Полное определение вида (тип существа, размеры, скорость, дары,
   * особенности). Совместимо с SpeciesDefinition компендиума — этот же
   * объект перетаскивается на лист актёра и кормит мастер настройки вида.
   */
  speciesData?: SpeciesDefinition;
  // --- Class-specific (только для type === 'class') ---
  /**
   * Полное определение класса (кость хитов, владения, прогрессия по уровням,
   * особенности, подклассы, счётчики, заклинательство). Совместимо с
   * ClassDefinition компендиума — этот же объект перетаскивается на лист
   * актёра и кормит мастер настройки класса (ClassSetupWizard). Хранится в
   * блобе по аналогии со `speciesData`. Идентичность класса живёт в
   * `classData.key`, поле верхнего уровня `GameItem.key` для класса не нужно.
   */
  classData?: ClassDefinition;
}
/**
 * Единый тип предмета — компедиум, предметы GM, инвентарь актёра.
 *
 * Alias для обратной совместимости (симметрично `Actor = DnDActor`). Весь
 * существующий D&D-код и серверная персистентность встроенной системы
 * продолжают работать без изменений.
 *
 * @deprecated Используй `DnDGameItem` для D&D-специфичного кода,
 *             `BaseGameItem` для generic/core кода.
 */
export type GameItem = DnDGameItem;
/**
 * Элемент данных компедиума — предмет или разделитель секции.
 * Дискриминируется по полю `type`: 'separator' vs 'weapon' и т.д.
 */
export type CompendiumEntry = GameItem | CompendiumSeparator;
/**
 * Тир масштабирования заговора по уровню заклинателя.
 *
 * Начиная с уровня `level`, урон/лечение заговора задаётся ПОЛНЫМ набором частей
 * `parts` (целиком заменяет базовые `damageParts` заклинания). Это позволяет на
 * высоких уровнях не только увеличить кости, но и сменить тип урона, добавить
 * новую часть или условное лечение. Тиры сортируются по `level`; при касте
 * выбирается тир с наибольшим `level ≤` уровня заклинателя (ниже первого тира —
 * базовые `damageParts`).
 */
export interface CantripScalingTier {
  /** Минимальный уровень заклинателя, с которого действует этот набор частей */
  level: number;
  /** Полный набор частей урона/лечения на этом уровне (заменяет базовые) */
  parts: DamagePart[];
}
/**
 * Порог числа снарядов заговора по уровню персонажа.
 */
export interface ProjectileCountTier {
  /** Минимальный уровень персонажа, с которого действует это число снарядов */
  level: number;
  /** Полное число снарядов начиная с этого уровня (заменяет базовое) */
  count: number;
}
/**
 * Снарядный режим заклинания (Волшебная стрела, Мистический заряд, Палящий
 * луч): каждый снаряд — отдельный бросок урона (и отдельный бросок атаки,
 * если заклинание атакующее — см. `getSpellAttackType`), снаряды
 * распределяются по целям до броска.
 *
 * Инвариант: `damageParts` заклинания описывают урон ОДНОГО снаряда —
 * масштабирование снарядных заклинаний растит ЧИСЛО снарядов, а не кости.
 * Нужен ли бросок атаки на каждый снаряд, здесь не дублируется: это выводится
 * из `deliveryType`/`autoHit` самого заклинания.
 */
export interface SpellProjectiles {
  /** Базовое число снарядов (на базовом круге / до первого порога уровня) */
  count: number;
  /** Дополнительные снаряды за каждый круг ячейки выше базового (уровневые заклинания) */
  perSlotLevel?: number;
  /** Пороги уровня персонажа → полное число снарядов (заговоры) */
  countByCharacterLevel?: ProjectileCountTier[];
  /**
   * Распределение снарядов по целям при касте:
   * - не задано — свободно, в одну цель или в несколько (Палящий луч,
   *   Волшебная стрела: «в 1 цель или в несколько»);
   * - `'single'` — за каст выбирается ровно ОДНА цель, все снаряды летят в
   *   неё (хоумбрю-вариации «все лучи в одного»);
   * - `'distinct'` — каждый снаряд строго в свою цель (Цепная молния,
   *   Молитва исцеления, Множественное лечащее слово).
   */
  targetDistribution?: 'single' | 'distinct';
}
/**
 * Способ восстановления зарядов заклинания.
 * - `atWill` — без лимита (заклинание «по желанию», заряды не тратятся);
 * - `shortRest` — заряды восстанавливаются после короткого отдыха;
 * - `longRest` — заряды восстанавливаются после продолжительного отдыха.
 */
export type SpellUsesRecovery = 'atWill' | 'shortRest' | 'longRest';
/**
 * Заряды использования заклинания (для врождённых/расовых заклинаний и
 * заклинаний существ, не тратящих ячейки). При `recovery === 'atWill'`
 * заряды не расходуются.
 */
export interface SpellUses {
  /** Максимум зарядов */
  max: number;
  /** Текущее число зарядов */
  current: number;
  /** Способ восстановления зарядов */
  recovery: SpellUsesRecovery;
}
export interface Spell {
  id: string;
  name: string;
  /** Английское название */
  nameEn?: string;
  /** Круг заклинания (0 = заговор, 1-9 = круги) */
  level: number;
  /** Школа магии */
  school: SpellSchool;
  // --- Время сотворения ---
  /** Количество единиц времени */
  castingTimeValue: number;
  /** Единица времени */
  castingTimeUnit: SpellCastingTimeUnit;
  /** Условие реакции (если castingTimeUnit === 'reaction') */
  reactionTrigger?: string;
  // --- Компоненты ---
  components: SpellComponents;
  // --- Дистанция ---
  /** Дальность в единицах (0 = на себя) */
  range: number;
  /** Единица дистанции */
  rangeUnit: DistanceUnit;
  /** Специальная дистанция (напр. "Касание", "На себя") */
  rangeSpecial?: string;
  // --- Длительность ---
  /** Количество единиц длительности */
  durationValue: number;
  /** Единица длительности */
  durationUnit: SpellDurationUnit;
  /** Требуется ли концентрация */
  concentration: boolean;
  /** Может ли быть выполнено как ритуал */
  ritual: boolean;
  // --- Область воздействия ---
  /** Область воздействия (если null — заклинание одиночной цели) */
  areaOfEffect?: SpellAreaOfEffect;
  // --- Цели ---
  /** Тип цели */
  targetType: SpellTargetType;
  /**
   * Информационное число целей эффекта (Благословение: 3). Пишется только
   * при значении больше 1 и только у заклинаний БЕЗ `projectiles` (у
   * снарядных число целей определяют снаряды и их `targetDistribution`).
   */
  targetCount?: number;
  // --- Боевая механика ---
  /** Тип совершения (дальнобойная/рукопашная/на себя/касание) */
  deliveryType: SpellDeliveryType;
  /**
   * Части урона/лечения заклинания. Единственный источник истины для боевой
   * механики (legacy-поля `damageFormula`/`damageType`/`isHealing` удалены).
   */
  damageParts?: DamagePart[];
  /** Автоматическое попадание (без броска и спасброска, напр. Волшебная стрела) */
  autoHit?: boolean;
  /**
   * Снарядный режим: каждый снаряд — отдельный бросок урона (и атаки, если
   * заклинание атакующее), снаряды распределяются по целям. `damageParts`
   * описывают урон одного снаряда. Единственный источник истины снарядности
   * (`targetCount` — информационное число целей, распределение не включает).
   */
  projectiles?: SpellProjectiles;
  /** Тип спасброска (какой спасбросок должна совершить цель) */
  saveType: SpellSaveType;
  /** Что происходит при успешном спасброске */
  saveEffect?: 'half' | 'none' | 'special';
  /** Характеристика для броска атаки заклинанием */
  attackAbility?: AbilityType;
  /** Дополнительный бонус к атаке заклинанием */
  attackBonus?: number;
  // --- Масштабирование ---
  /** Масштабирование при усилении на высших кругах */
  scaling?: SpellScaling;
  /**
   * Поуровневые тиры масштабирования заговора: на каждом пороге уровня — полный
   * набор частей урона/лечения, заменяющий базовые `damageParts`. Источник
   * истины для масштабирования заговоров (авто-умножение кубиков отключено).
   */
  cantripScalingTiers?: CantripScalingTier[];
  // --- Описание и мета ---
  description: string;
  /** Описание на высших кругах */
  higherLevelDescription?: string;
  /** Активные эффекты, накладываемые заклинанием */
  activeEffects?: ActiveEffect[];
  // --- Использование ---
  /**
   * Заряды использования с откатом от отдыха (врождённые/расовые заклинания,
   * заклинания существ). Если не задано — заклинание тратит ячейки (актор) или
   * считается «по желанию» (существо).
   */
  uses?: SpellUses;
  /** Подготовлено ли заклинание (для классов с подготовкой) */
  prepared?: boolean;
  /** Всегда подготовлено (например, сигнатурные от подкласса) */
  alwaysPrepared?: boolean;
  /**
   * Название умения, которое автоматически предоставило заклинание
   * (напр. «Избранный враг»). Заполняется при выдаче через `grantedSpells`
   * и используется для отображения источника и отката при замене источника.
   */
  grantedByFeature?: string;
  // --- Метаданные ---
  sourceKey?: string;
  isSRD?: boolean;
  /** Ключи классов, которым доступно это заклинание */
  classKeys?: ClassKey[];
  /** Тип объекта (для различения Spell от GameItem при сохранении) */
  type?: 'spell';
}
/**
 * Актор D&D 5e — наследует нейтральную базу `BaseActor` и добавляет D&D-форму.
 * Поле `system` — «чёрный ящик»: содержимое определяется игровой системой.
 */
export interface DnDActor extends BaseActor {
  system: DnDActorSystem;
  /** Заклинания */
  spells: Spell[];
  /** Снаряжение */
  equipment: GameItem[];
  /** Особенности */
  features: Feature[];
  /** Активные эффекты (комбинация изменений и флагов) */
  activeEffects: ActiveEffect[];
  /** Заметки */
  notes: string;
}
/**
 * Alias для обратной совместимости.
 * Весь существующий код продолжает работать без изменений.
 *
 * @deprecated Используй DnDActor для D&D-специфичного кода,
 *             BaseActor для generic/core кода.
 */
export type Actor = DnDActor;
/**
 * Сущность сцены в D&D-форме — используется ВНУТРИ системы D&D (system/dnd/**),
 * где нужен доступ к D&D-полям (`system.hitPoints`, `activeEffects`, `spells`).
 * Ядро с этим типом не работает.
 */
export type DnDSceneEntity = DnDActor | DnDCreature;
