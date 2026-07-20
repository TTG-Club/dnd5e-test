/** Правило расчёта диагонального движения */
export type DiagonalRule = 'chebyshev' | 'alternating' | 'euclidean';

export type UserRole = 'admin' | 'user' | 'guest';

export type GridType = 'fixed' | 'custom';

export interface GridSettings {
  type: GridType;
  cellSize: number;
  color: string;
  visible: boolean;
  offsetX?: number;
  offsetY?: number;
  scale?: number; // Scale of one cell (default: 5)
  units?: DistanceUnit; // Unit of measurement (default: 'ft')
  diagonalRule?: DiagonalRule; // Правило расчёта диагонального движения (default: 'chebyshev')
  opacity?: number; // Opacity of the grid lines (0-1, default 0.5)
}

export interface Token {
  id: string;
  actorId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Скрыт ли токен от игроков (видит только GM) */
  hidden?: boolean;
  /** Скрыт ли токен в трансляционной рамке ГМа (на сцене у ГМа виден). */
  hideFromBroadcast?: boolean;
  /** Отношение токена: дружелюбный, нейтральный, враждебный */
  disposition?: 'friendly' | 'neutral' | 'hostile';
}

/** Результат одной группы кубиков (например, 2d20) */
export interface DiceGroupResult {
  /** Количество кубиков в группе */
  count: number;
  /** Количество граней кубика */
  sides: number;
  /** Значения каждого кубика */
  values: number[];
  /** Индексы отброшенных кубиков (keep/drop модификаторы) */
  dropped: number[];
  /** Индексы критических успехов */
  critSuccesses: number[];
  /** Индексы критических провалов */
  critFailures: number[];
}

/** Данные результата броска кубиков */
export interface DiceRollData {
  /** Оригинальная формула броска */
  formula: string;
  /** Итоговое числовое значение */
  total: number;
  /** Детали по каждой группе кубиков */
  dice: DiceGroupResult[];
  /** Рендер-строка с деталями (например, "[**18**, ~~3~~] + 5") */
  details: string;
  /** Контекст/причина броска (например, "Бросок инициативы", "Спасбросок Ловкости") */
  label?: string;
  /** Тип урона для отображения */
  damageType?: string;
}

/**
 * Тип карточки, отправленной в чат.
 * Расширяется при добавлении новых сущностей (spell, feature, condition...).
 */
export type ChatCardType =
  | 'equipment'
  | 'spell'
  | 'feature'
  | 'tool'
  | 'background'
  | 'species'
  | 'class'
  // Системы регистрируют СВОИ типы карточек чата (свои строковые ключи).
  // Реестр карточек чата (`chatCardRegistry`) и так ключуется по произвольной
  // строке — тип открыт, чтобы ядро не замыкало его на D&D.
  | (string & {});

/** Данные карточки предмета/заклинания для чата */
export interface ChatCardData {
  /** Дискриминатор типа карточки */
  cardType: ChatCardType;
  /** Название карточки (для краткого отображения во floating messages) */
  title: string;
  /** Сериализованные данные предмета/заклинания (JSON-строка) */
  payload: string;
}

export interface ChatMessage {
  id: string;
  worldId: string;
  authorName: string;
  authorId: string;
  /**
   * Содержимое сообщения. Для `text` — санированный HTML, для `image` —
   * относительный путь к файлу в папке мира (например `chat-images/...`).
   */
  content: string;
  timestamp: number;
  type: 'text' | 'roll' | 'item-card' | 'image';
  /** Данные броска кубиков (только для type === 'roll') */
  rollData?: DiceRollData;
  /** Данные карточки предмета (только для type === 'item-card') */
  cardData?: ChatCardData;
  /** Приватный бросок — виден только автору */
  isPrivate?: boolean;
  /** Бросок для ГМ — виден только автору и ГМ */
  isGmOnly?: boolean;
}

/** Папка журнала */
export interface JournalFolder {
  id: string;
  worldId: string;
  name: string;
  parentId: string | null;
  isHidden: boolean;
  /** Порядок сортировки среди соседей одного уровня (меньше — выше) */
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  worldId: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  images: string[];
  isHidden: boolean;
  isPinVisible: boolean;
  folderId: string | null;
  /** Порядок сортировки среди соседей одного уровня (меньше — выше) */
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Элемент переупорядочивания журнала: папка или заметка.
 * Используется при drag-and-drop сортировке внутри одного уровня дерева,
 * где папки и заметки делят единую последовательность сортировки.
 */
export interface JournalReorderItem {
  type: 'folder' | 'note';
  id: string;
}

export interface NotePin {
  id: string;
  noteId: string;
  sceneId: string;
  x: number;
  y: number;
}

export interface SceneAssetAnimation {
  enabled: boolean;
  direction: number;
  rotation: boolean;
  speed: number;
  repeat: { x: number; y: number };
  rotationAxis: { x: number; y: number };
  offset: { x: number; y: number };
  parallaxStrength: number;
  loop: boolean;
}

export interface SceneAsset {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  zIndex: number;
  /** Скрыт ли ассет в трансляционной рамке ГМа (на сцене у ГМа виден). */
  hideFromBroadcast?: boolean;
  animation?: SceneAssetAnimation;
}

/** Форма пользовательской области */
export type CustomAreaShape = 'polygon';

/** AoE-шаблон измерения (конус, круг, луч), сохраняемый на сцене */
export interface MeasurementTemplate {
  id: string;
  type: MeasurementTemplateType;
  /** Мировые координаты начальной точки (откуда тянули) */
  originX: number;
  originY: number;
  /** Мировые координаты конечной точки (куда отпустили) */
  targetX: number;
  targetY: number;
  /** Цвет заливки (hex число) */
  color: number;
  /** Разрешено ли изменять размер шаблона ползунком/точкой (draggable handle). */
  resizable?: boolean;
  /** Ширина шаблона (для ray) */
  width?: number;
  /** Высота шаблона (для cylinder) */
  height?: number;
  /** ID автора */
  createdBy: string;
  /** Скрыт ли шаблон в трансляционной рамке ГМа (на сцене у ГМа виден). */
  hideFromBroadcast?: boolean;
}

/** Тип AoE-шаблона измерения */
export type MeasurementTemplateType =
  | 'cone'
  | 'circle'
  | 'ray'
  | 'rect'
  | 'cylinder';

// Данные Fog of War для конкретного игрока (DEPRECATED - используется fogOfWarData в Scene)
export interface FogOfWarData {
  playerId: string;
  exploredAreas: ExploredArea[]; // Исследованные области
}

// Данные кисти тумана войны
export interface FogBrushPoint {
  id?: string; // Опциональный ID для удаления
  x: number;
  y: number;
  radius: number;
  type: 'reveal' | 'hide';
  timestamp: number;
  /**
   * ID актора, для которого применяется brush-точка (персональный туман).
   * Опционален только из-за старых сохранённых данных: точки без actorId
   * клиент не отрисовывает, новые точки всегда создаются с actorId.
   */
  actorId?: string;
}

// Исследованная область (полигон) (DEPRECATED)
export interface ExploredArea {
  polygon: number[]; // Массив координат [x1, y1, x2, y2, ...]
  timestamp: number; // Когда была исследована
}

export interface LightSource {
  id: string;
  x: number; // Координата X центра источника света
  y: number; // Координата Y центра источника света
  brightRadius: number; // Радиус яркого света
  dimRadius: number; // Радиус тусклого света (dim light)
  intensity: number; // Интенсивность света (0-1)
  color: string; // Цвет света (hex)
  angle: number; // Угол конуса света в градусах (360 = полный круг)
  rotation: number; // Направление конуса в градусах (0 = вправо)
  animation?: {
    type: 'none' | 'pulse' | 'flicker' | 'torch' | 'strobe';
    speed: number;
    intensity: number;
  };
  enabled: boolean; // Включен ли источник (ручной мастер-переключатель)
  // Диапазон уровня тьмы сцены, при котором источник реально светит.
  // darknessLevel сцены: 0 = день, 1 = полная тьма.
  // Источник активен только когда min <= darknessLevel <= max.
  // Не задано => активен всегда (эквивалент { min: 0, max: 1 }).
  // Примеры: { min: 0.5, max: 1 } — факел зажигается только в темноте;
  //          { min: 0, max: 1 } — горит всё время, даже днём.
  darknessActivation?: {
    min: number; // Нижний порог тьмы включения (0-1)
    max: number; // Верхний порог тьмы включения (0-1)
  };
  /** Скрыт ли источник света в трансляционной рамке ГМа (на сцене у ГМа виден). */
  hideFromBroadcast?: boolean;
}

/**
 * Проверяет, активен ли источник света при заданном уровне тьмы сцены.
 * Учитывает только порог активации по тьме (darknessActivation). Ручной
 * флаг enabled здесь НЕ проверяется — его проверяют отдельно.
 * @param light - Источник света (нужно только поле darknessActivation)
 * @param darknessLevel - Текущий уровень тьмы сцены (0 = день, 1 = тьма)
 * @returns true, если источник должен светить при данном уровне тьмы
 */
export function isLightActiveAtDarkness(
  light: Pick<LightSource, 'darknessActivation'>,
  darknessLevel: number,
): boolean {
  const activation = light.darknessActivation;

  if (!activation) {
    return true;
  }

  return darknessLevel >= activation.min && darknessLevel <= activation.max;
}

/**
 * Конфигурация «излучателя света» — то же освещение, что и у размещённого
 * источника света (LightSource), но БЕЗ позиции и идентичности: id/x/y
 * вычисляются из носителя (например, токена) в момент рендера.
 *
 * Ключевое отличие от LightSource: радиусы заданы в ЕДИНИЦАХ сцены (футах),
 * а не в пикселях. Это делает излучатель независимым от конкретной сетки —
 * один и тот же «факел 20 фт» корректно рендерится на любой сцене. Перевод
 * в пиксельный LightSource выполняет `lightEmitterToSource` по сетке сцены.
 *
 * Используется как для света на токенах (TokenSettings.light), так и как
 * модель редактирования в общем редакторе света — единый механизм: улучшая
 * поля здесь, мы улучшаем и токены, и размещённые источники.
 */
export interface LightEmitter {
  /** Излучает ли носитель свет (мастер-переключатель) */
  enabled: boolean;
  /** Радиус яркого света в единицах сцены (футах) */
  brightRadius: number;
  /** Радиус тусклого света в единицах сцены (футах) */
  dimRadius: number;
  /** Интенсивность света (0-1) */
  intensity: number;
  /** Цвет света (hex) */
  color: string;
  /** Угол конуса света в градусах (360 = полный круг) */
  angle: number;
  /** Направление конуса в градусах (0 = вправо) */
  rotation: number;
  /** Анимация света (та же модель, что у LightSource) */
  animation?: {
    type: 'none' | 'pulse' | 'flicker' | 'torch' | 'strobe';
    speed: number;
    intensity: number;
  };
  /** Диапазон уровня тьмы сцены, при котором свет реально горит (см. LightSource) */
  darknessActivation?: {
    min: number;
    max: number;
  };
}

/**
 * Преобразует «излучатель света» (единицы сцены) в пиксельный LightSource
 * для рендера. Позиция и id задаются носителем (токеном).
 * @param emitter - Конфигурация излучателя (радиусы в футах)
 * @param id - Идентификатор результирующего источника
 * @param x - X центра в пикселях сцены
 * @param y - Y центра в пикселях сцены
 * @param pixelsPerUnit - Сколько пикселей в одной единице сцены (cellSize/scale)
 */
export function lightEmitterToSource(
  emitter: LightEmitter,
  id: string,
  x: number,
  y: number,
  pixelsPerUnit: number,
): LightSource {
  const dim = Math.max(0, emitter.dimRadius);
  const bright = Math.max(0, Math.min(emitter.brightRadius, dim));

  return {
    id,
    x,
    y,
    brightRadius: bright * pixelsPerUnit,
    dimRadius: dim * pixelsPerUnit,
    intensity: emitter.intensity,
    color: emitter.color,
    angle: emitter.angle,
    rotation: emitter.rotation,
    animation:
      emitter.animation && emitter.animation.type !== 'none'
        ? { ...emitter.animation }
        : undefined,
    enabled: emitter.enabled,
    darknessActivation: emitter.darknessActivation
      ? { ...emitter.darknessActivation }
      : undefined,
  };
}

/**
 * Создаёт излучатель света по умолчанию (выключенный, пресет «факел»).
 */
export function createDefaultLightEmitter(): LightEmitter {
  return {
    enabled: false,
    brightRadius: 20,
    dimRadius: 40,
    intensity: 0.6,
    color: '#ff9d5c',
    angle: 360,
    rotation: 0,
    animation: { type: 'torch', speed: 1.2, intensity: 0.4 },
    darknessActivation: { min: 0, max: 1 },
  };
}

/** Готовый пресет освещения (радиусы в единицах сцены/футах). */
export interface LightPreset {
  /** Машинный ключ пресета */
  key: string;
  /** Человекочитаемое название */
  label: string;
  /** Иконка (tabler:) для UI */
  icon: string;
  /** Параметры света пресета (без флага enabled — он управляется носителем) */
  emitter: Omit<LightEmitter, 'enabled'>;
}

/**
 * Каталог пресетов освещения D&D 5e (радиусы в футах). Общий для света на
 * токенах и для размещённых источников — единый механизм пресетов.
 */
export const LIGHT_PRESETS: LightPreset[] = [
  {
    key: 'candle',
    label: 'Свеча',
    icon: 'tabler:flame',
    emitter: {
      brightRadius: 5,
      dimRadius: 10,
      intensity: 0.4,
      color: '#ffd8a8',
      angle: 360,
      rotation: 0,
      animation: { type: 'torch', speed: 1, intensity: 0.3 },
      darknessActivation: { min: 0, max: 1 },
    },
  },
  {
    key: 'torch',
    label: 'Факел',
    icon: 'tabler:flame-filled',
    emitter: {
      brightRadius: 20,
      dimRadius: 40,
      intensity: 0.6,
      color: '#ff9d5c',
      angle: 360,
      rotation: 0,
      animation: { type: 'torch', speed: 1.2, intensity: 0.4 },
      darknessActivation: { min: 0, max: 1 },
    },
  },
  {
    key: 'lantern',
    label: 'Фонарь',
    icon: 'tabler:bulb',
    emitter: {
      brightRadius: 30,
      dimRadius: 60,
      intensity: 0.7,
      color: '#ffe0b0',
      angle: 360,
      rotation: 0,
      animation: { type: 'flicker', speed: 0.8, intensity: 0.15 },
      darknessActivation: { min: 0, max: 1 },
    },
  },
  {
    key: 'light-spell',
    label: 'Заклинание',
    icon: 'tabler:sparkles',
    emitter: {
      brightRadius: 20,
      dimRadius: 40,
      intensity: 0.8,
      color: '#ffffff',
      angle: 360,
      rotation: 0,
      darknessActivation: { min: 0, max: 1 },
    },
  },
];

/**
 * Тип сущности на сцене.
 * При добавлении нового типа — достаточно расширить этот union
 * и добавить запись в `SCENE_ENTITY_CONFIG`.
 */
export type SceneEntityType = 'actor' | 'creature';

// Actor types
export type AbilityType =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export type SkillType =
  | 'acrobatics'
  | 'animalHandling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'sleightOfHand'
  | 'stealth'
  | 'survival'
  | 'religion';

/** Уровень владения навыком (D&D 5e) */
export type ProficiencyLevel = 'none' | 'half' | 'proficient' | 'expertise';

/** Тип предмета: оружие, снаряжение, черта или предыстория */
export type GameItemType =
  | 'weapon'
  | 'equipment'
  | 'feat'
  | 'tool'
  | 'background'
  | 'species'
  | 'class'
  | 'spell'
  // Игровые системы могут вводить СВОИ типы предметов (напр. `relic`).
  // `(string & {})` сохраняет автодополнение известных литералов, но не
  // замыкает союз на D&D — ядро группирует предметы по `type` обобщённо, а
  // иконки/подписи/формы даёт провайдер типов системы (`itemTypeRegistry`).
  | (string & {});

/** Категория инструмента D&D 5e */
export type ToolCategory = 'artisan' | 'gaming' | 'musical' | 'other';

/** Режим учёта владения инструментом */
export type ToolProficiencyMode =
  | 'auto'
  | 'none'
  | 'half'
  | 'proficient'
  | 'expertise';

/** Определение свойства инструмента */
export interface ToolPropertyDefinition {
  key: string;
  name: string;
  nameEn: string;
  source: string;
  description: string;
}

export type EquipmentCategory =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'shield'
  | 'trinket'
  | 'ring'
  | 'clothing'
  | 'wand'
  | 'wondrous'
  | 'vehicle-equipment'
  | 'food'
  | 'adventurer-equipment';

/** Категории, относящиеся к броне (имеют КД, модификаторы и т.д.) */
export type ArmorCategory = 'light' | 'medium' | 'heavy' | 'shield';

/** Категория оружия D&D 5e */
export type WeaponCategory = 'simple' | 'martial';

/** Тип дальности оружия */
export type WeaponRangeType = 'melee' | 'ranged';

/** Тип урона D&D 5e */
export type DamageType =
  | 'slashing'
  | 'piercing'
  | 'bludgeoning'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'thunder'
  | 'poison'
  | 'acid'
  | 'necrotic'
  | 'radiant'
  | 'force'
  | 'psychic'
  | 'choice';

/**
 * Типы урона, к которым применимы защиты (сопротивление, иммунитет,
 * уязвимость). Исключает служебный `choice` (выбор стихии игроком).
 */
export type DefensibleDamageType = Exclude<DamageType, 'choice'>;

/**
 * Цель применения части урона/лечения.
 * - `selected` — текущая выбранная цель (по умолчанию; обычно для урона)
 * - `self` — заклинатель/владелец (для лечения себя)
 * - `choose` — отдельная цель, указывается до броска
 */
export type DamagePartTarget = 'selected' | 'self' | 'choose';

/**
 * Одна часть урона/лечения. Общий тип для заклинаний (`Spell`), оружия
 * (`GameItem`) и действий существ (`CreatureAction`) — единая система урона.
 *
 * Носитель может содержать несколько частей (напр. урон огнём + урон холодом
 * + лечение). Тип урона (`@dmg`), лечение (`@heal`/`@heal.temp`) и условные
 * кости по состоянию цели (`@target.full`/`@target.notFull`) пишутся прямо в
 * формуле через токены (см. `formulaParser`/`splitFormulaByDamageType`).
 */
export interface DamagePart {
  /**
   * Формула урона/лечения (напр. "8к6+@mod.spell", "2к6@target.full",
   * "2к4@heal+@mod.spell" — лечение, "2к4@heal.temp" — временные ХП).
   * Вид части (урон/лечение/временные ХП) задаётся ТОЛЬКО токенами
   * `@heal`/`@heal.temp` в формуле (legacy-флаг `isHealing` удалён).
   */
  formula: string;
  /** Тип урона (для лечения не используется) */
  type?: DamageType;
  /** Цель части (по умолчанию `selected`) */
  target?: DamagePartTarget;
  /**
   * Применять часть только если по носителю был фактически нанесён урон (>0).
   * Покрывает «лечусь, только если задел врага» для атак и спасбросков.
   * По умолчанию `false` — часть применяется независимо.
   */
  requiresDamage?: boolean;
  /**
   * Альтернативная формула части при удержании оружия двумя руками (versatile).
   * Только для оружия со свойством `versatile`; заклинания/существа поле
   * игнорируют. Если задана и оружие удерживается двумя руками — заменяет
   * `formula`.
   */
  versatileFormula?: string;
}

/** Свойство оружия D&D 5e */
export type WeaponProperty =
  | 'ammunition'
  | 'finesse'
  | 'heavy'
  | 'light'
  | 'loading'
  | 'reach'
  | 'special'
  | 'thrown'
  | 'two-handed'
  | 'versatile'
  | 'range'
  | 'reload'
  | 'burst-fire'
  | 'adamantine'
  | 'magical';

/** Тип боеприпаса D&D 5e */
export type AmmunitionType =
  | 'arrows'
  | 'bolts'
  | 'bullets'
  | 'blowgun-needles'
  | 'sling-bullets';

/**
 * Режим учёта бонуса мастерства для оружия.
 *
 * - `auto` — автоматически: проверяет владение актёра по baseType
 * - `always` — всегда учитывать бонус мастерства
 * - `never` — никогда не учитывать бонус мастерства
 */
export type WeaponProficiencyMode = 'auto' | 'always' | 'never';

/** Определение свойства оружия (SRD / модуль) */
export interface WeaponPropertyDefinition {
  /** Уникальный ключ (совпадает с WeaponProperty) */
  key: WeaponProperty;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Источник (PHB, DMG, модуль) */
  source: string;
  /** Полное описание правила */
  description: string;
}

/** Определение свойства снаряжения (SRD / модуль) */
export interface EquipmentPropertyDefinition {
  /** Уникальный ключ (напр. 'adamantine', 'magical') */
  key: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Источник (PHB, DMG, модуль) */
  source: string;
  /** Полное описание правила */
  description: string;
}

/** Определение базового типа оружия (SRD / модуль) */
export interface WeaponBaseTypeDefinition {
  /** Уникальный ключ (напр. 'longsword', 'dagger') */
  key: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Категория: простое или воинское */
  category: WeaponCategory;
  /** Тип боя: ближний или дальний */
  rangeType: WeaponRangeType;
  /** Иконка Tabler (напр. 'tabler:sword') */
  icon: string;
}

/** Определение типа урона (SRD / модуль) */
export interface DamageTypeDefinition {
  /** Уникальный ключ (совпадает с DamageType) */
  key: DamageType;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
}

/** Определение категории оружия (SRD / модуль) */
export interface WeaponCategoryDefinition {
  /** Уникальный ключ (совпадает с WeaponCategory) */
  key: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
}

/** Определение категории снаряжения (SRD / модуль) */
export interface EquipmentCategoryDefinition {
  /** Уникальный ключ (совпадает с EquipmentCategory) */
  key: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Является ли бронёй (у брони есть КД, профициентность и т.д.) */
  isArmor: boolean;
}

/** Определение базового типа доспеха (SRD / модуль) */
export interface ArmorBaseTypeDefinition {
  /** Уникальный ключ (напр. 'leather', 'chain-mail') */
  key: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Категория снаряжения */
  category: EquipmentCategory;
  /** Иконка Tabler */
  icon: string;
}

/** Определение типа боеприпаса (SRD / модуль) */
export interface AmmunitionTypeDefinition {
  /** Уникальный ключ (совпадает с AmmunitionType) */
  key: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
}

/** Определение источника контента (PHB, DMG, SRD, HB и т.д.) */
export interface SourceDefinition {
  /** Уникальный ключ (напр. 'phb', 'srd', 'hb') */
  key: string;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Аббревиатура (напр. 'PHB', 'SRD', 'HB') */
  abbreviation: string;
}

/** Редкость предмета */
export type ItemRarity =
  | 'none'
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'very-rare'
  | 'legendary'
  | 'artifact';

/**
 * Формат значений фильтра/группировки компедиума — управляет подписью опций
 * и порядком сортировки. `string` — как есть; остальные форматы дают
 * локализованную подпись и осмысленную сортировку (круги, ПО, типы и т.д.).
 */
export type CompendiumValueFormat =
  | 'string'
  | 'spellLevel'
  | 'challengeRating'
  | 'creatureType'
  | 'spellClass'
  // Системы вводят свои форматы значений: `(string & {})` сохраняет
  // автодополнение канонов, но не замыкает союз на D&D. Рантайм-граница
  // `VttSystem.getCompendiumValueFormatter(format: string)` принимает любую
  // строку и для неизвестного формата возвращает undefined (значение — как есть).
  | (string & {});

/**
 * Форматтер значения фильтра/группировки — превращает «сырое» значение поля
 * в подпись и ключ сортировки. Возвращается системой по имени формата
 * (см. `VttSystem.getCompendiumValueFormatter`), что держит специфику системы
 * (круги, ПО, типы существ, классы) вне обобщённого клиентского движка.
 */
export interface CompendiumValueFormatter {
  /** Полная подпись значения (для разделов группировки и опций-списка) */
  label: (value: unknown) => string;
  /** Компактная подпись (для опций-бейджей); по умолчанию — `label` */
  shortLabel?: (value: unknown) => string;
  /** Ключ сортировки опций/разделов (числовой даёт осмысленный порядок) */
  sortKey: (value: unknown) => number | string;
}

/** Один переключатель булева фильтра (напр. «Концентрация») */
export interface CompendiumToggleOption {
  /** Подпись переключателя */
  label: string;
  /**
   * Путь к булеву полю сущности (напр. 'concentration', 'ritual').
   * Переключатель оставляет записи с истинным значением по этому пути.
   */
  path?: string;
  /**
   * Имя системного предиката для производных булевых признаков, которые
   * нельзя выразить одним полем (напр. 'spellHealing' — лечит ли заклинание).
   * Резолвится через `VttSystem.getCompendiumPredicate`.
   */
  predicate?: string;
  /** Иконка (`tabler:`/`ttg:`) */
  icon?: string;
  /** Семантический цвет (`success`/`warning`/`info`/…) */
  color?: string;
}

/** Описание одного фильтра боковой панели компедиума */
export interface CompendiumFilter {
  /** Уникальный идентификатор фильтра в рамках узла */
  id: string;
  /** Заголовок секции фильтра */
  label: string;
  /**
   * Тип фильтра:
   * - `enum` — мультивыбор по значениям поля (опции строятся из данных);
   * - `toggles` — набор булевых переключателей.
   */
  type: 'enum' | 'toggles';
  /**
   * Путь к полю сущности для `enum`. Поддерживает вложенность и массивы
   * (напр. `level`, `system.challengeRating`, `classKeys`).
   */
  path?: string;
  /** Формат значений (подпись/сортировка опций) для `enum` */
  format?: CompendiumValueFormat;
  /** Стиль опций `enum`: `badges` (в ряд) | `list` (столбцом) */
  style?: 'badges' | 'list';
  /** Переключатели для `toggles` */
  toggles?: CompendiumToggleOption[];
}

/** Группировка списка под разделителями по полю сущности */
export interface CompendiumGroupBy {
  /** Путь к полю группировки (напр. `level`, `system.challengeRating`) */
  path: string;
  /** Формат подписи/сортировки разделов */
  format?: CompendiumValueFormat;
}

/**
 * Декларативная конфигурация отображения данных узла компедиума.
 * Позволяет ЛЮБОМУ компедиуму описать в манифесте, как показывать данные и
 * какие фильтры предлагать — без хардкода типов в клиенте.
 */
export interface CompendiumView {
  /**
   * Макет: `list` (узкий список) | `filtered` (широкий с панелью фильтров).
   * По умолчанию `list`; при наличии `filters` подразумевается `filtered`.
   */
  layout?: 'list' | 'filtered';
  /** Группировка списка под разделителями */
  groupBy?: CompendiumGroupBy;
  /** Фильтры боковой панели (для `filtered`) */
  filters?: CompendiumFilter[];
}

/** Узел дерева компедиума */
export interface CompendiumTreeNode {
  /** Уникальный идентификатор узла */
  id: string;
  /** Отображаемое название */
  name: string;
  /** Иконка (Fluent icon name) */
  icon?: string;
  /** Дочерние узлы (если есть — это папка) */
  children?: CompendiumTreeNode[];
  /** Имя файла данных (только для листовых узлов, напр. 'weapons.json') */
  dataFile?: string;
  /**
   * Канонический тип записей узла — одно из зарегистрированных значений
   * (`spell`/`creature`/`weapon`/`equipment`/`tool`/`feat`/`class`/`species`/
   * `background`), совпадает с полем `type` сущности там, где оно есть.
   * Манифест декларирует тип сам — клиент НЕ угадывает его по имени `dataFile`
   * (`dataFile` — лишь ключ маршрутизации, может содержать префикс пака).
   * Подробности и правило про SRD — в docs/CONTENT_AUTHORING.md.
   */
  dataKind?: string;
  /**
   * Декларативная конфигурация отображения узла: макет, фильтры, группировка.
   * Если не задана — узел показывается простым списком (`layout: 'list'`).
   */
  view?: CompendiumView;
}

/** Манифест компедиума (один модуль/пак) */
export interface CompendiumManifest {
  /** Уникальный идентификатор модуля */
  id: string;
  /** Название модуля */
  name: string;
  /** Дерево папок */
  tree: CompendiumTreeNode[];
  /**
   * Версия SRD-данных (`srdVersion` с TTG Club).
   * Отсутствует у легаси/бандл-паков, которые не синхронизируются с сайтом.
   */
  srdVersion?: string;
  /**
   * Курсор последней синхронизации — ISO-дата `until` из ответа `/changes`.
   * Используется как `since` при следующей инкрементальной проверке обновлений.
   */
  syncedUntil?: string;
  /**
   * Пак только для чтения — его нельзя обновлять с сайта
   * (напр. бандл-бэкап «SRD Бэкап»).
   */
  readOnly?: boolean;
}

/**
 * Манифест одной секции компедиума — файл `section.json` в папке секции.
 *
 * Делает папку секции самодостаточной: её можно «принести» одной директорией,
 * и она сама описывает, как показывать данные (`view`) и какого они типа
 * (`dataKind`). Сервер собирает из таких манифестов дерево `CompendiumManifest`
 * для клиента. По сути — `CompendiumTreeNode` без `children`/`dataFile`
 * (`dataFile` выводится из имени папки при сборке).
 */
export interface CompendiumSectionManifest {
  /** Идентификатор узла (обычно совпадает с именем папки) */
  id: string;
  /** Отображаемое название */
  name: string;
  /** Иконка (`tabler:`/`ttg:`) */
  icon?: string;
  /** Канонический тип записей секции (`spell`/`creature`/`weapon`/…) */
  dataKind?: string;
  /** Декларативная конфигурация отображения (макет, фильтры, группировка) */
  view?: CompendiumView;
}

/**
 * Узел-группа в корневом манифесте пака — раздел дерева только для
 * отображения (без собственных данных), объединяющий несколько секций.
 */
export interface CompendiumPackGroup {
  /** Идентификатор группы */
  id: string;
  /** Отображаемое название */
  name: string;
  /** Иконка (`tabler:`/`ttg:`) */
  icon?: string;
  /** Дочерние ссылки на секции/группы/плейсхолдеры */
  children: CompendiumSectionRef[];
}

/**
 * Плейсхолдер-узел в корневом манифесте пака — пункт дерева без данных и без
 * папки (напр. зарезервированные «Зелья»/«Кольца»). Отдаётся клиенту как есть.
 */
export interface CompendiumPlaceholderNode {
  /** Идентификатор узла */
  id: string;
  /** Отображаемое название */
  name: string;
  /** Иконка (`tabler:`/`ttg:`) */
  icon?: string;
}

/**
 * Ссылка на секцию в корневом манифесте пака:
 * - строка — имя папки leaf-секции (её `section.json` читается при сборке);
 * - объект с `children` — группа-раздел для отображения;
 * - объект без `children` — плейсхолдер без данных.
 */
export type CompendiumSectionRef =
  | string
  | CompendiumPackGroup
  | CompendiumPlaceholderNode;

/**
 * Корневой манифест пака (`manifest.json` в корне пака) в «тонкой» форме —
 * описывает идентичность пака и порядок/группировку секций, а конкретный
 * `view`/`dataKind` каждой секции живёт в её `section.json`.
 *
 * Это ЕДИНСТВЕННАЯ поддерживаемая форма: загрузчик (`compendiumModule.ts →
 * registerPackFromDir`) читает только `sections[]`. Легаси-форму с полем `tree`
 * (монолитное дерево) больше не принимают — и бандл-SRD, и скачиваемые паки, и
 * модули мира лежат в per-section формате (см. docs/CONTENT_AUTHORING.md, 4.1).
 */
export interface CompendiumPackManifest {
  /** Уникальный идентификатор пака */
  id: string;
  /** Название пака */
  name: string;
  /** Пак только для чтения (напр. бандл-бэкап) */
  readOnly?: boolean;
  /** Версия SRD-данных, если пак синхронизируется с сайтом */
  srdVersion?: string;
  /** Курсор последней синхронизации */
  syncedUntil?: string;
  /** Упорядоченный список секций/групп пака */
  sections: CompendiumSectionRef[];
}

/**
 * Результат проверки обновлений компедиума (индикатор «есть обновления»).
 * Берётся из лёгкой ручки `/api/v2/vttg/changes/status` (без скачивания данных).
 */
export interface CompendiumUpdateStatus {
  /** Есть ли новые/изменённые сущности с момента последней синхронизации */
  hasUpdates: boolean;
  /** Количество изменённых сущностей в окне */
  count: number;
  /** Верхняя граница окна изменений (ISO-дата `until`) */
  until: string;
}

/**
 * Результат применения обновления компедиума (скачивание + раскладка).
 */
export interface CompendiumUpdateResult {
  /** Успешно ли применено обновление */
  success: boolean;
  /** Сколько SRD-сущностей записано на диск */
  srdCount: number;
  /** Сколько не-SRD (премиум) сущностей записано на диск */
  premiumCount: number;
  /** Курсор синхронизации после применения (ISO-дата `until`) */
  syncedUntil?: string;
  /** Текст ошибки при неуспехе */
  error?: string;
}

/**
 * Разделитель секции в данных компедиума.
 * Позволяет группировать предметы под заголовками (напр. «Простое рукопашное оружие»).
 * Сторонние модули могут добавлять свои разделители в JSON-файлы.
 */
export interface CompendiumSeparator {
  /** Тип записи — разделитель */
  type: 'separator';
  /** Отображаемый заголовок секции */
  name: string;
}

/**
 * Элемент данных компедиума — предмет или разделитель секции.
 * Дискриминируется по полю `type`: 'separator' vs 'weapon' и т.д.
 */
export type SpellDeliveryType =
  | 'ranged'
  | 'melee'
  | 'self'
  | 'touch'
  | 'sight'
  | 'none';

/** Тип цели заклинания */
export type SpellTargetType =
  | 'creature'
  | 'object'
  | 'point'
  | 'self'
  | 'area'
  | 'none';

/** Форма области заклинания (совпадает с MeasurementTemplateType для 2D-сцены) */
export type SpellAreaShape = MeasurementTemplateType;

/** Школа магии D&D 5.5e */
export type SpellSchool =
  | 'abjuration'
  | 'conjuration'
  | 'divination'
  | 'enchantment'
  | 'evocation'
  | 'illusion'
  | 'necromancy'
  | 'transmutation';

/** Время сотворения */
export type SpellCastingTimeUnit =
  | 'action'
  | 'bonus-action'
  | 'bonus-action-after-hit'
  | 'reaction'
  | 'minute'
  | 'hour';

/** Единица длительности заклинания */
export type SpellDurationUnit =
  | 'instantaneous'
  | 'round'
  | 'minute'
  | 'hour'
  | 'day'
  | 'special'
  | 'until-dispelled';

/** Тип спасброска */
export type SpellSaveType =
  | 'none'
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

/** Компоненты заклинания */
export interface SpellComponents {
  /** Вербальный (V) */
  verbal: boolean;
  /** Соматический (S) */
  somatic: boolean;
  /** Материальный (M) */
  material: boolean;
  /** Описание материального компонента (если material === true) */
  materialDescription?: string;
  /** Стоимость материального компонента (в зм, 0 = бесплатный) */
  materialCost?: number;
  /** Расходуется ли материальный компонент */
  materialConsumed?: boolean;
}

/** Область воздействия заклинания */
export interface SpellAreaOfEffect {
  /** Форма области (маппится на MeasurementTemplateType) */
  shape: SpellAreaShape;
  /** Размер (радиус для circle/sphere, длина для cone/ray/line) */
  size: number;
  /** Ширина (для ray/line) */
  width?: number;
  /** Высота (для cylinder) */
  height?: number;
  /** Единица измерения */
  unit: DistanceUnit;
  /** Можно ли менять размер при размещении шаблона */
  resizable?: boolean;
}

/** Масштабирование заклинания при усилении */
export interface SpellScaling {
  /** Формула дополнительного урона за круг усиления (напр. "1к6") */
  additionalDice?: string;
  /** Дополнительное количество целей/снарядов за круг усиления (напр. 1 для Волшебной стрелы) */
  additionalTargets?: number;
  /** Описание усиления (текстовое, для описания в UI) */
  description?: string;
}

export interface Feature {
  id: string;
  name: string;
  /** Английское название */
  nameEn?: string;
  description: string;
  /** Уровень, на котором получена особенность */
  level?: number;
  /** Тип особенности для вывода в UI (напр. 'Вид', 'Класс', 'Черта') */
  featureType?:
    | 'species'
    | 'class'
    | 'subclass'
    | 'feat'
    | 'background'
    | 'custom';
  /** Ключ источника из справочника sources.json (напр. 'phb', 'dmg') */
  sourceKey?: string;
  /** Принадлежит ли к System Reference Document (SRD) */
  isSRD?: boolean;
  /**
   * Происхождение выданной актёру особенности — имя класса/вида, который её
   * предоставил (напр. «Волшебник» или «Волшебник — Школа воплощения»). По нему
   * удаление класса/вида находит и снимает свои особенности. Не путать с
   * источником-книгой (его несёт `sourceKey`).
   */
  grantedBy?: string;
  /** Можно ли выбрать черту повторно */
  repeatable?: boolean;
  /** Текст с пояснением условий повторного выбора */
  repeatableText?: string;
  /**
   * ID заклинаний компендиума, которые особенность/черта предоставляет
   * автоматически. Такие заклинания всегда подготовлены и не тратят
   * лимит ручного выбора.
   */
  grantedSpells?: string[];
}

/** Типы движения персонажа (порядок = приоритет отображения, сверху — выше) */
export type MovementType = 'burrow' | 'climb' | 'fly' | 'swim' | 'walk';
/** Единица измерения расстояния */
export type DistanceUnit = 'ft' | 'm' | 'mi' | 'km';
/** Передвижение персонажа — несколько типов с приоритетом */
export interface ActorMovement {
  walk: number;
  swim: number;
  fly: number;
  climb: number;
  burrow: number;
  hover: boolean;
  units: DistanceUnit;
}
/** Тип расчёта КД */
export type ArmorCalculation = 'default' | 'natural' | 'flat' | 'custom';
/** Класс доспеха персонажа с формулой расчёта */
export interface ActorArmorClass {
  value: number;
  calculation: ArmorCalculation;
  formula: string;
  flat: number | null;
}
/** Настройки отображения токена на сцене */
export interface TokenSettings {
  /** Путь к картинке токена */
  imageUrl?: string;
  /** Путь к рамке токена */
  frameUrl?: string;
  /** Масштаб токена (по умолчанию 1) */
  scale?: number;
  /** Масштаб текстуры внутри токена (по умолчанию 1) */
  textureScale?: number;
  /** Смещение текстуры по X (по умолчанию 0.5 - центр) */
  textureX?: number;
  /** Смещение текстуры по Y (по умолчанию 0.5 - центр) */
  textureY?: number;
  /** Поворот текстуры в градусах */
  rotation?: number;
  /** Оттенок токена (hex) */
  tint?: string;
  /** Отношение токена по умолчанию: дружелюбный, нейтральный, враждебный */
  disposition?: 'friendly' | 'neutral' | 'hostile';
  /** Показывать ли имя токена на сцене */
  showName?: boolean;
  /** Режим отображения ХП на сцене: полоска или текстовое состояние здоровья */
  hpDisplayMode?: HpDisplayMode;
  /** Настройки зрения */
  vision?: {
    /** Включено ли зрение */
    enabled: boolean;
    /** Дальность зрения в футах (0 = безграничное) */
    range: number;
    /** Дальность тёмного зрения в футах */
    darkvision: number;
    /** Угол обзора в градусах (360 = круговое) */
    angle: number;
  };
  /**
   * Источник света, привязанный к токену. Тот же механизм, что и у
   * размещённых источников света: при `enabled` от токена исходит свет
   * (синтезируется в виртуальный LightSource в позиции токена при рендере).
   */
  light?: LightEmitter;
}
// BaseActor / BaseCreature определены в `types/index.ts` (а не здесь), т.к.
// они ссылаются на `BaseActiveEffect` из `system/contracts`, а base.ts —
// примитивный leaf (в него нельзя тянуть contracts без цикла).

/** Макрос панели быстрых действий (hotbar) */
export interface HotbarMacro {
  /** Уникальный ID макроса */
  id: string;
  /** Тип макроса (weapon-attack, tool, sound, dice-roll и т.д.) */
  type: string;
  /** Отображаемое название */
  label: string;
  /** Иконка (Iconify-формат i-*) */
  icon: string;
  /** Ссылка на объект (weaponId, toolId, soundFile и т.д.) */
  ref: string;
  /** ID актора-владельца (для weapon-attack, spell-cast и т.д.) */
  actorId?: string;
  /** Дополнительные параметры (опционально) */
  params?: Record<string, unknown>;
}
/** Слот панели быстрых действий — содержит макрос или пуст */
export type HotbarSlot = HotbarMacro | null;
/** Количество слотов в панели быстрых действий */
export const HOTBAR_SLOTS_COUNT = 10;
/** Настройки пользователя (хранятся на сервере) */
export interface UserSettings {
  /** Показывать ли курсор другим игрокам */
  showCursor: boolean;
  /** Скрыть курсоры других игроков */
  hideOtherCursors: boolean;
  /** Глобальная громкость */
  globalVolume?: number;
  /** Громкость эмбиента */
  ambientVolume?: number;
  /** Громкость эффектов */
  effectsVolume?: number;
  /** Громкость музыки */
  musicVolume?: number;
  /** Включены ли 3D-кубики */
  enable3dDice?: boolean;
  /** Выбранный стиль (colorset) 3D-кубиков */
  diceColorset?: string;
  /** Слоты панели быстрых действий (hotbar) */
  hotbarSlots?: HotbarSlot[];
  /** Режим приватного броска — видим только автору */
  isPrivateRoll?: boolean;
  /** Режим броска для ГМ — видим автору и ГМ */
  isGmOnlyRoll?: boolean;
  /** Позиция уведомлений на экране */
  toastPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}
/** Значения по умолчанию для UserSettings */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  showCursor: true,
  hideOtherCursors: false,
  globalVolume: 100,
  ambientVolume: 100,
  effectsVolume: 100,
  musicVolume: 100,
  enable3dDice: false,
  diceColorset: 'white',
  hotbarSlots: Array.from<HotbarSlot>({ length: HOTBAR_SLOTS_COUNT }).fill(
    null,
  ),
  isPrivateRoll: false,
  isGmOnlyRoll: false,
  toastPosition: 'bottom-left',
};
export interface UserRestrictions {
  isChatBanned?: boolean;
  isDiceBanned?: boolean;
  isTokenMoveBanned?: boolean;
  isInteractBanned?: boolean;
  isDrawingBanned?: boolean;
  isTemplatesBanned?: boolean;
  isScreenBlacked?: boolean;
}
export interface ServerUser {
  id: string;
  username: string;
  /**
   * Пароль пользователя. Хранится только на сервере: клиенту наружу
   * не передаётся (см. hasPassword). В admin:manage-users undefined
   * означает «оставить текущий пароль», пустая строка — «убрать пароль».
   */
  password?: string;
  /**
   * Признак наличия пароля. Вычисляется сервером при отдаче данных
   * клиенту вместо самого пароля.
   */
  hasPassword?: boolean;
  role: UserRole;
  lastSceneId?: string | null;
  settings?: UserSettings;
  restrictions?: UserRestrictions;
}
/** Аудио-канал плейлиста */
export type PlaylistChannel = 'ambient' | 'effects' | 'music';
/** Плейлист — привязан к папке мира с аудио/видео файлами */
export interface Playlist {
  id: string;
  name: string;
  folderPath: string;
  channel: PlaylistChannel;
  isPlaying: boolean;
  currentTrackIndex: number;
  volume: number;
  loop: boolean;
  /**
   * Время начала воспроизведения текущего трека в МИЛЛИСЕКУНДАХ ЕДИНОЙ (серверной) ШКАЛЫ.
   * Все клиенты вычисляют это значение через synced-часы (см. audioStore.serverNow),
   * поэтому позиция трека одинакова у всех, независимо от рассинхрона системных часов.
   */
  playbackStartedAt?: number;
}
export type PermissionKey =
  | 'ADD_SCENE_ASSETS'
  | 'USE_DRAWING_TOOLS'
  | 'SCENE_PING'
  | 'CONFIGURE_TOKENS'
  | 'TOGGLE_DOORS'
  | 'CREATE_ACTORS'
  | 'CREATE_JOURNALS'
  | 'CREATE_SCENE_NOTES'
  | 'CREATE_ITEMS'
  | 'CREATE_TOKENS'
  | 'CREATE_MEASUREMENT_TEMPLATES'
  | 'DELETE_TOKENS'
  | 'MANAGE_SETTINGS'
  | 'MANAGE_PLAYLISTS'
  | 'PLAY_SOUNDS'
  | 'TOGGLE_PAUSE';

/**
 * Метаданные мира — это то, что реально хранится в world.db.
 * Не включает сцены, существа и актёров, т.к. они хранятся в отдельных файлах.
 */
export interface WorldMetadata {
  id: string;
  name: string;
  port: number;
  ip: string;
  /**
   * Идентификатор игровой системы мира (например, `'dnd5e'`). Выбирается при
   * создании мира и иммутабелен после. Опционально на переходный период: у
   * старых миров и в текущем single-system режиме резолвится в `'dnd5e'`
   * (см. `docs/MULTI_SYSTEM_ARCHITECTURE.md`, Фаза 1).
   */
  system?: string;
  users: ServerUser[];
  backgroundImage?: string;
  /** Описание сервера в формате Markdown (с поддержкой форматирования) */
  description?: string;
  activeSceneId: string | null;
  folderPath: string;
  /** Использовать UPnP для автоматического проброса порта на роутере */
  useUpnp?: boolean;
  /** Автоматически запускать сервер мира при старте приложения */
  autoStart?: boolean;
  audioSettings?: {
    globalVolume: number;
  };
  playlists?: Playlist[];
  rolePermissions?: Record<UserRole, PermissionKey[]>;
}

export interface ConnectionState {
  currentWorldId: string | null;
  loggedAsUserId: string | null;
  /** Токен сессии из /api/login, передаётся в user:register для авторизации */
  sessionToken: string | null;
}
export interface OnlineUserData {
  id: string;
  username: string;
  role: UserRole;
  restrictions?: UserRestrictions;
}
export interface PlayerLocation {
  playerId: string;
  username: string;
  sceneId: string;
  timestamp: number;
}
export type WallRestrictionType =
  | 'none'
  | 'normal'
  | 'limited'
  | 'proximity'
  | 'reverseProximity';
export interface Drawing {
  id: string;
  type: 'freehand' | 'wall' | 'door' | 'window' | 'secret-door' | 'landscape';
  points: number[];
  color: string;
  width: number;
  /** ID автора рисунка (userId) */
  authorId?: string;
  adminOnly?: boolean;
  /** Скрыт ли рисунок в трансляционной рамке ГМа (на сцене у ГМа виден). */
  hideFromBroadcast?: boolean;
  closed?: boolean; // Замкнутая ли стена (для стен)
  doorState?: 'open' | 'closed'; // Состояние двери (только для type: 'door')
  isLocked?: boolean; // Заперта ли дверь
  // Новая система продвинутой блокировки
  movement?: WallRestrictionType;
  vision?: WallRestrictionType;
  light?: WallRestrictionType;
  sound?: WallRestrictionType;
  visionProximityThreshold?: number; // Дистанция в футах (для proximity/reverseProximity)
  lightProximityThreshold?: number; // Дистанция в футах (для proximity/reverseProximity)
  attenuation?: boolean; // Адаптивное затухание (на будущее)
  // Устаревшие свойства (сохранены для обратной совместимости, будут мигрированы)
  blocksMovement?: boolean; // Блокирует движение
  blocksVision?: boolean; // Блокирует зрение
  blocksLight?: boolean; // Блокирует свет
  // Настройки звука (только для дверей)
  soundEnabled?: boolean; // Использовать звук при открытии/закрытии
  soundSet?: string; // Название набора звуков (например, 'classic')
}
/**
 * Типы wall-like структур (стены, двери, окна, скрытые двери, ландшафтные
 * стены), в отличие от обычных рисунков. Единственный источник истины для
 * операций массовой очистки стен/рисунков на клиенте и сервере.
 */
export const WALL_LIKE_TYPES: Drawing['type'][] = [
  'wall',
  'door',
  'window',
  'secret-door',
  'landscape',
];
/** Область перехода (портал) */
export interface TransitionArea {
  id: string;
  name: string;
  sceneId: string; // Сцена, на которой расположена область
  cells: { x: number; y: number }[]; // Клетки области (grid coordinates, в пикселях левого верхнего угла)
  linkedAreaId?: string; // ID связанной области-выхода
  linkedSceneId?: string; // ID сцены связанной области
  color?: string; // Цвет подсветки (hex, default: #3b82f6)
  isHidden?: boolean; // Видеть ли зону только админу (сокрыта от игроков)
}
/** Позиция курсора игрока на сцене */
export interface CursorPosition {
  userId: string;
  username: string;
  sceneId: string;
  x: number;
  y: number;
  color: string;
}
/**
 * Синхронизируемое состояние трансляционной рамки ГМа.
 *
 * Передаётся между ГМами через WS (модуль `gm-broadcast`) и сохраняется на
 * сервере (per-user), чтобы рамка восстанавливалась между сессиями. Игрокам не
 * рассылается. Локальный флаг «открыто ли окно трансляции» сюда не входит — он
 * живёт только на клиенте-владельце (localStorage).
 */
export interface GmBroadcastFrameSync {
  /** Уникальный идентификатор рамки. */
  id: string;
  /** Сцена, к которой привязана рамка. */
  sceneId: string;
  /** ID пользователя-владельца. */
  ownerId: string;
  /** Ник владельца (для подписи рамки у других ГМов). */
  ownerName: string;
  /** Цвет рамки (hex). */
  colorHex: string;
  /** Геометрия рамки в мировых координатах сцены. */
  rect: { x: number; y: number; width: number; height: number };
  /** Зафиксированное соотношение сторон (w/h) или null. */
  aspect: number | null;
  /** Подпись текущего выбора соотношения (пресет «16:9», имя сцены или «Свободное»). */
  aspectLabel: string;
  /** Виден ли контент трансляции в окне (false = чёрный экран, рамка не остановлена). */
  visible: boolean;
  /** Транслировать ли звук в окно трансляции (по умолчанию false — окно немое). */
  audioEnabled: boolean;
  /** Слои сцены, скрытые в трансляции (например ['lighting','walls']). */
  broadcastHiddenLayers: string[];
  /** Режим тумана войны/зрения в окне трансляции. */
  broadcastVisionMode: 'no-fog' | 'fog';
}
/** Запись участника в трекере инициативы */
export interface InitiativeEntry {
  /** ID актора на сцене */
  actorId: string;
  /** Имя актора (для отображения) */
  actorName: string;
  /** ID владельца (userId), null = NPC под контролем ГМа */
  ownerId: string | null;
  /** Результат броска d20 */
  roll: number;
  /** Модификатор инициативы (DEX modifier) */
  modifier: number;
  /** Итого: roll + modifier */
  total: number;
  /** Бросил ли участник инициативу */
  hasRolled: boolean;
}
/** Состояние энкаунтера (трекер инициативы) */
export interface EncounterState {
  /** Уникальный ID энкаунтера */
  id: string;
  /** Список участников */
  entries: InitiativeEntry[];
  /** Индекс текущего хода (-1 = бой не начат) */
  currentTurnIndex: number;
  /** Текущий раунд */
  round: number;
  /** Активен ли энкаунтер (false = завершён, но сохранён в списке) */
  isActive: boolean;
}

export type HpDisplayMode = 'bar' | 'text';

export interface HealthCondition {
  key: string;
  nameEn: string;
  nameRu: string;
  minPercent: number;
  maxPercent: number;
  color: string;
}

export const HEALTH_CONDITIONS: readonly HealthCondition[] = [
  {
    key: 'uninjured',
    nameEn: 'Uninjured',
    nameRu: 'Невредим',
    minPercent: 100,
    maxPercent: 100,
    color: '#22c55e',
  },
  {
    key: 'barely-injured',
    nameEn: 'Barely Injured',
    nameRu: 'Легко ранен',
    minPercent: 80,
    maxPercent: 99,
    color: '#84cc16',
  },
  {
    key: 'injured',
    nameEn: 'Injured',
    nameRu: 'Ранен',
    minPercent: 60,
    maxPercent: 79,
    color: '#eab308',
  },
  {
    key: 'badly-injured',
    nameEn: 'Badly Injured',
    nameRu: 'Сильно ранен',
    minPercent: 40,
    maxPercent: 59,
    color: '#f97316',
  },
  {
    key: 'severely-injured',
    nameEn: 'Severely Injured',
    nameRu: 'Тяжело ранен',
    minPercent: 20,
    maxPercent: 39,
    color: '#ef4444',
  },
  {
    key: 'near-death',
    nameEn: 'Near Death',
    nameRu: 'При смерти',
    minPercent: 1,
    maxPercent: 19,
    color: '#dc2626',
  },
  {
    key: 'dead',
    nameEn: 'Dead',
    nameRu: 'Мёртв',
    minPercent: 0,
    maxPercent: 0,
    color: '#6b7280',
  },
] as const;

const UNCONSCIOUS_CONDITION: HealthCondition = {
  key: 'unconscious',
  nameEn: 'Unconscious',
  nameRu: 'Без сознания',
  minPercent: 0,
  maxPercent: 0,
  color: '#6b7280',
};

export function getHealthCondition(
  currentHp: number,
  maxHp: number,
  isActor = false,
  customConditions?: readonly HealthCondition[],
): HealthCondition | undefined {
  if (maxHp <= 0) {
    return undefined;
  }

  const percent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  const conditions = customConditions ?? HEALTH_CONDITIONS;

  const match = conditions.find(
    (condition) =>
      percent >= condition.minPercent && percent <= condition.maxPercent,
  );

  if (isActor && match?.key === 'dead') {
    return UNCONSCIOUS_CONDITION;
  }

  return match;
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
