/**
 * Локальные типы и конвертеры редактора «Создать/Редактировать класс»
 * (панель «Предметы»). Вся логика разворота `ClassDefinition` в редактируемую
 * модель и обратной сборки живёт здесь, в типизируемом `.ts` (шаблоны `.vue`
 * не проверяются type-check'ом), чтобы поймать ошибки конвертации статически.
 *
 * Ключевые решения модели:
 * - `featureKeys` строки таблицы прогрессии НЕ редактируются вручную — они
 *   выводятся из `level` каждой особенности при сборке ({@link buildLevelTable}).
 * - ASI на уровне — это чекбокс строки; на сборке вставляется синтетический
 *   ключ `asi-<level>` + синтетическая особенность (детектор мастера —
 *   `key.startsWith('asi-') || key === 'epic-boon'`).
 * - Динамические колонки таблицы (ячейки заклинаний, приёмы и т.п.) — значения
 *   `string | number`, разрежённые (пустая ячейка не пишется → рендер «—»).
 */

import type { AbilityType } from '@vtt/shared';
import type {
  CasterType,
  ClassCounterDefinition,
  ClassDefinition,
  ClassFeature,
  ClassFeatureChoice,
  ClassLevelEntry,
  CounterRecovery,
  GrantedSpellRef,
  HitDie,
  SubclassDefinition,
} from '@vtt/shared/system/dnd.js';

import { generateId } from '@vtt/shared';

// ── Колонки таблицы прогрессии ───────────────────────────────

/** Дочерняя (листовая) колонка внутри группы. */
export interface EditableTableColumnChild {
  uid: string;
  key: string;
  label: string;
}

/**
 * Колонка таблицы: либо лист (`key` задан, `children` пуст), либо группа
 * (`children` непуст, собственного `key` нет — только подзаголовки).
 */
export interface EditableTableColumn {
  uid: string;
  key: string;
  label: string;
  children: EditableTableColumnChild[];
  /**
   * Стандартная DND-колонка, добавленная пресет-кнопкой: название и ключ
   * «вшиты», в редакторе не меняются (показываются только для справки). Свои
   * колонки («Колонка»/«Группа») имеют `locked: false` и редактируются.
   */
  locked: boolean;
}

// ── Строка таблицы прогрессии (1 уровень) ────────────────────

export interface EditableLevelRow {
  level: number;
  proficiencyBonus: number;
  /** Повышение характеристик (ASI) на этом уровне. */
  hasAsi: boolean;
  /** Сколько НОВЫХ заговоров выбрать (для заклинателей). */
  newCantrips: number;
  /** Сколько НОВЫХ заклинаний выбрать (для заклинателей). */
  newSpells: number;
  /** Значения динамических колонок: ключ листа → введённый текст. */
  columns: Record<string, string>;
  /**
   * Поля строки, которые форма не редактирует, но обязана сохранить при
   * round-trip (напр. `newSpellsByLevel` и любые неизвестные ключи).
   */
  preserved: Record<string, ClassLevelEntryValue>;
}

/** Тип значения произвольного поля строки таблицы уровней. */
type ClassLevelEntryValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, number>
  | undefined;

// ── Заклинания особенности ───────────────────────────────────

/** Поуровневая выдача заклинаний особенностью (домены/клятвы). */
export interface EditableGrantedSpellLevel {
  uid: string;
  level: number;
  spells: GrantedSpellRef[];
}

// ── Особенность класса/подкласса ─────────────────────────────

/** Вариант особенности (боевой стиль, манёвры). */
export interface EditableClassFeatureChoice {
  uid: string;
  key: string;
  name: string;
  description: string;
}

export interface EditableClassFeature {
  key: string;
  name: string;
  description: string;
  level: number;
  isInformationalOnly: boolean;
  /** Заклинания, выдаваемые особенностью (всегда подготовлены). */
  grantedSpells: GrantedSpellRef[];
  /** Поуровневая выдача заклинаний (домены/клятвы/покровители). */
  grantedSpellsByLevel: EditableGrantedSpellLevel[];
  /** Варианты-выборы внутри особенности. */
  choices: EditableClassFeatureChoice[];
}

// ── Счётчик классового ресурса ───────────────────────────────

export interface EditableProgressionEntry {
  uid: string;
  level: number;
  value: number;
}

export interface EditableCounter {
  key: string;
  name: string;
  shortName: string;
  nameEn: string;
  description: string;
  startLevel: number;
  recovery: CounterRecovery;
  /** Источник максимума: таблица прогрессии или формула. */
  mode: 'progression' | 'formula';
  progression: EditableProgressionEntry[];
  formula: string;
  featureKey: string;
}

// ── Заклинательство ──────────────────────────────────────────

export interface EditableSpellcasting {
  enabled: boolean;
  type: CasterType;
  ability: AbilityType;
  startLevel: number;
}

// ── Подкласс ─────────────────────────────────────────────────

export interface EditableSubclass {
  key: string;
  name: string;
  nameEn: string;
  description: string;
  unlockLevel: number;
  sourceKey: string;
  features: EditableClassFeature[];
  counters: EditableCounter[];
  spellcasting: EditableSpellcasting;
  /** Есть ли у подкласса своя таблица прогрессии (Мистический рыцарь). */
  hasOwnTable: boolean;
  tableColumns: EditableTableColumn[];
  levelTable: EditableLevelRow[];
  /** Бонус-заклинания подкласса (round-trip; форма их не редактирует). */
  preservedBonusSpells?: SubclassDefinition['bonusSpells'];
}

// ── Стартовое снаряжение ─────────────────────────────────────

export interface EditableEquipmentOption {
  uid: string;
  key: string;
  description: string;
}

// ============================================================
// Хелперы
// ============================================================

/** Стандартный бонус мастерства D&D 5e для уровня (1-20). */
export function defaultProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

/** Является ли ключ особенности маркером ASI (как у мастера класса). */
export function isAsiFeatureKey(featureKey: string): boolean {
  return featureKey.startsWith('asi-') || featureKey === 'epic-boon';
}

/** Канонические названия обычного повышения характеристик (генерик ASI). */
const PLAIN_ASI_NAMES = new Set<string>([
  'Улучшение характеристик',
  'Увеличение характеристик',
]);

/**
 * «Обычное» ли это повышение характеристик — то есть ASI-особенность без своего
 * содержания, которую безопасно представить чекбоксом строки и пересобрать
 * синтетически. Эпические дары (свои название/описание/механика) сюда НЕ входят
 * — их надо сохранять как настоящие особенности.
 */
export function isPlainAsiFeature(feature: {
  key: string;
  name: string;
}): boolean {
  return (
    isAsiFeatureKey(feature.key) && PLAIN_ASI_NAMES.has(feature.name.trim())
  );
}

/** Стандартное название/текст синтетической особенности повышения характеристик. */
const ASI_NAME = 'Улучшение характеристик';

const ASI_DESCRIPTION =
  'Вы можете повысить значение одной из ваших характеристик на 2 или двух '
  + 'характеристик на 1 (не выше 20). Вместо этого вы можете взять черту.';

/**
 * Зарезервированные ключи колонок: они обслуживаются встроенными колонками/
 * полями таблицы (уровень, бонус мастерства, особенности, выбор новых заговоров/
 * заклинаний) и НЕ должны задаваться кастомной колонкой — иначе перезапишут
 * встроенное значение. Дизайнер их игнорирует и предупреждает.
 */
export const RESERVED_COLUMN_KEYS = new Set<string>([
  'level',
  'proficiencyBonus',
  'featureKeys',
  'newCantrips',
  'newSpells',
  'newSpellsByLevel',
]);

/** Является ли ключ колонки зарезервированным под встроенное поле таблицы. */
export function isReservedColumnKey(key: string): boolean {
  return RESERVED_COLUMN_KEYS.has(key.trim());
}

/**
 * Все листовые ключи колонок (раскрытые группы) — для захвата значений строк.
 * Зарезервированные ключи пропускаются, чтобы кастомная колонка не конфликтовала
 * со встроенным полем.
 */
export function collectLeafColumnKeys(
  columns: EditableTableColumn[],
): string[] {
  const keys: string[] = [];

  for (const column of columns) {
    if (column.children.length > 0) {
      for (const child of column.children) {
        const key = child.key.trim();

        if (key && !isReservedColumnKey(key)) {
          keys.push(key);
        }
      }
    } else {
      const key = column.key.trim();

      if (key && !isReservedColumnKey(key)) {
        keys.push(key);
      }
    }
  }

  return keys;
}

/** Создаёт пустую заклинательную конфигурацию (выключенную). */
export function createEmptySpellcasting(): EditableSpellcasting {
  return {
    enabled: false,
    type: 'full',
    ability: 'intelligence',
    startLevel: 1,
  };
}

/** Создаёт пустую особенность класса/подкласса. */
export function createEmptyFeature(name: string): EditableClassFeature {
  return {
    key: generateId('cf'),
    name,
    description: '',
    level: 1,
    isInformationalOnly: false,
    grantedSpells: [],
    grantedSpellsByLevel: [],
    choices: [],
  };
}

/** Создаёт пустую строку таблицы для уровня. */
export function createEmptyLevelRow(level: number): EditableLevelRow {
  return {
    level,
    proficiencyBonus: defaultProficiencyBonus(level),
    hasAsi: false,
    newCantrips: 0,
    newSpells: 0,
    columns: {},
    preserved: {},
  };
}

/** Создаёт пустую таблицу прогрессии (20 уровней). */
export function createEmptyLevelTable(): EditableLevelRow[] {
  return Array.from({ length: 20 }, (_unused, index) =>
    createEmptyLevelRow(index + 1),
  );
}

// ── Разворот: ClassDefinition → редактируемая модель ─────────

function toGrantedRefs(ids: string[] | undefined): GrantedSpellRef[] {
  return (ids ?? []).map((id) => ({ name: id, spellId: id }));
}

/** Разворачивает особенность класса в редактируемые поля. */
export function toEditableFeature(feature: ClassFeature): EditableClassFeature {
  const byLevel: EditableGrantedSpellLevel[] = Object.entries(
    feature.grantedSpellsByLevel ?? {},
  )
    .map(([levelKey, ids]) => ({
      uid: generateId('gsl'),
      level: Number(levelKey) || 1,
      spells: toGrantedRefs(ids),
    }))
    .sort((entryA, entryB) => entryA.level - entryB.level);

  return {
    key: feature.key || generateId('cf'),
    name: feature.name || '',
    description: feature.description || '',
    level: feature.level ?? 1,
    isInformationalOnly: feature.isInformationalOnly ?? false,
    grantedSpells: toGrantedRefs(feature.grantedSpells),
    grantedSpellsByLevel: byLevel,
    choices: (feature.choices ?? []).map((choice) => ({
      uid: generateId('cfc'),
      key: choice.key || generateId('cfc'),
      name: choice.name || '',
      description: choice.description || '',
    })),
  };
}

/** Разворачивает счётчик ресурса в редактируемые поля. */
export function toEditableCounter(
  counter: ClassCounterDefinition,
): EditableCounter {
  const progression: EditableProgressionEntry[] = Object.entries(
    counter.progression ?? {},
  )
    .map(([levelKey, value]) => ({
      uid: generateId('cpe'),
      level: Number(levelKey) || 1,
      value,
    }))
    .sort((entryA, entryB) => entryA.level - entryB.level);

  return {
    key: counter.key || generateId('cnt'),
    name: counter.name || '',
    shortName: counter.shortName || '',
    nameEn: counter.nameEn || '',
    description: counter.description || '',
    startLevel: counter.startLevel ?? 1,
    recovery: counter.recovery ?? 'long',
    mode: counter.progression ? 'progression' : 'formula',
    progression,
    formula: counter.formula || 'level',
    featureKey: counter.featureKey || '',
  };
}

/** Разворачивает заклинательную конфигурацию. */
export function toEditableSpellcasting(
  spellcasting: ClassDefinition['spellcasting'] | undefined,
): EditableSpellcasting {
  if (!spellcasting) {
    return createEmptySpellcasting();
  }

  return {
    enabled: true,
    type: spellcasting.type,
    ability: spellcasting.ability,
    startLevel: spellcasting.startLevel,
  };
}

/**
 * Разворачивает колонки таблицы прогрессии. Зарезервированные ключи (напр.
 * `proficiencyBonus`, который некоторые SRD-классы дублируют в tableColumns)
 * отбрасываются — для них есть встроенная колонка «Мас.».
 */
export function toEditableColumns(
  columns: ClassDefinition['tableColumns'] | undefined,
): EditableTableColumn[] {
  const result: EditableTableColumn[] = [];

  for (const column of columns ?? []) {
    const children = (column.children ?? [])
      .filter((child) => !isReservedColumnKey(child.key))
      .map((child) => ({
        uid: generateId('tcc'),
        key: child.key,
        label: child.label,
      }));

    const leafKey = column.key ?? '';

    if (children.length === 0 && (!leafKey || isReservedColumnKey(leafKey))) {
      continue;
    }

    result.push({
      uid: generateId('tc'),
      key: children.length > 0 ? '' : leafKey,
      label: column.label || '',
      children,
      locked: isStandardColumnDefinition(column),
    });
  }

  return result;
}

/** Строковое представление значения ячейки для поля ввода. */
function cellToText(value: ClassLevelEntryValue): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (value === '—') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return '';
}

const KNOWN_ROW_KEYS = new Set<string>([
  'type',
  'level',
  'proficiencyBonus',
  'featureKeys',
  'newCantrips',
  'newSpells',
]);

/**
 * Разворачивает таблицу прогрессии в редактируемые строки. Гарантирует ровно
 * 20 строк (недостающие — пустые). Значения динамических колонок берутся по
 * листовым ключам объявленных колонок; всё прочее (`newSpellsByLevel` и др.)
 * складывается в `preserved` для round-trip.
 *
 * `plainAsiKeys` — ключи особенностей «обычного» ASI (генерик), которые форма
 * исключает из списка и представляет чекбоксом `hasAsi`. Эпические дары туда не
 * входят (остаются настоящими особенностями), поэтому их строки `hasAsi` не
 * получают — иначе синтезировался бы дубль.
 */
export function toEditableLevelTable(
  levelTable: ClassLevelEntry[] | undefined,
  columns: EditableTableColumn[],
  plainAsiKeys: Set<string> = new Set(),
): EditableLevelRow[] {
  const leafKeys = new Set(collectLeafColumnKeys(columns));
  const rows = createEmptyLevelTable();

  for (const sourceRow of levelTable ?? []) {
    const index = (sourceRow.level ?? 0) - 1;

    if (index < 0 || index > 19) {
      continue;
    }

    const featureKeys = sourceRow.featureKeys ?? [];
    const columnValues: Record<string, string> = {};
    const preserved: Record<string, ClassLevelEntryValue> = {};

    for (const [key, value] of Object.entries(sourceRow)) {
      if (KNOWN_ROW_KEYS.has(key)) {
        continue;
      }

      if (leafKeys.has(key)) {
        columnValues[key] = cellToText(value);
      } else {
        preserved[key] = value;
      }
    }

    rows[index] = {
      level: sourceRow.level,
      proficiencyBonus:
        sourceRow.proficiencyBonus ?? defaultProficiencyBonus(sourceRow.level),
      hasAsi: featureKeys.some((key) => plainAsiKeys.has(key)),
      newCantrips:
        typeof sourceRow.newCantrips === 'number' ? sourceRow.newCantrips : 0,
      newSpells:
        typeof sourceRow.newSpells === 'number' ? sourceRow.newSpells : 0,
      columns: columnValues,
      preserved,
    };
  }

  return rows;
}

/** Разворачивает подкласс в редактируемые поля. */
export function toEditableSubclass(
  subclass: SubclassDefinition,
): EditableSubclass {
  const tableColumns = toEditableColumns(subclass.tableColumns);

  return {
    key: subclass.key || generateId('sub'),
    name: subclass.name || '',
    nameEn: subclass.nameEn || '',
    description: subclass.description || '',
    unlockLevel: subclass.unlockLevel ?? 3,
    sourceKey: subclass.sourceKey || '',
    features: (subclass.features ?? []).map(toEditableFeature),
    counters: (subclass.counters ?? []).map(toEditableCounter),
    spellcasting: toEditableSpellcasting(subclass.spellcasting),
    hasOwnTable: Boolean(subclass.levelTable?.length),
    tableColumns,
    levelTable: toEditableLevelTable(subclass.levelTable, tableColumns),
    preservedBonusSpells: subclass.bonusSpells,
  };
}

// ── Сборка: редактируемая модель → ClassDefinition ───────────

/** Сводит выдаваемые заклинания к списку id компендиума. */
function buildGrantedIds(refs: GrantedSpellRef[]): string[] {
  const ids: string[] = [];

  for (const ref of refs) {
    if (ref.spellId && !ids.includes(ref.spellId)) {
      ids.push(ref.spellId);
    }
  }

  return ids;
}

/** Собирает особенность класса/подкласса из редактируемых полей. */
export function buildFeature(
  feature: EditableClassFeature,
  subclassKey?: string,
): ClassFeature {
  const built: ClassFeature = {
    key: feature.key,
    name: feature.name.trim(),
    description: feature.description.trim(),
    level: Math.max(1, Math.round(feature.level || 1)),
  };

  if (subclassKey) {
    built.subclassKey = subclassKey;
  }

  if (feature.isInformationalOnly) {
    built.isInformationalOnly = true;
  }

  const choices: ClassFeatureChoice[] = feature.choices
    .filter((choice) => choice.name.trim().length > 0)
    .map((choice) => ({
      key: choice.key,
      name: choice.name.trim(),
      description: choice.description.trim(),
    }));

  if (choices.length > 0) {
    built.choices = choices;
  }

  const grantedSpells = buildGrantedIds(feature.grantedSpells);

  if (grantedSpells.length > 0) {
    built.grantedSpells = grantedSpells;
  }

  const byLevel: Record<string, string[]> = {};

  for (const entry of feature.grantedSpellsByLevel) {
    const ids = buildGrantedIds(entry.spells);

    if (ids.length > 0) {
      byLevel[String(entry.level)] = ids;
    }
  }

  if (Object.keys(byLevel).length > 0) {
    built.grantedSpellsByLevel = byLevel;
  }

  return built;
}

/** Собирает счётчик ресурса из редактируемых полей. */
export function buildCounter(
  counter: EditableCounter,
  subclassKey?: string,
): ClassCounterDefinition {
  const built: ClassCounterDefinition = {
    key: counter.key,
    name: counter.name.trim(),
    startLevel: Math.max(1, Math.round(counter.startLevel || 1)),
    recovery: counter.recovery,
  };

  if (counter.shortName.trim()) {
    built.shortName = counter.shortName.trim();
  }

  if (counter.nameEn.trim()) {
    built.nameEn = counter.nameEn.trim();
  }

  if (counter.description.trim()) {
    built.description = counter.description.trim();
  }

  if (counter.featureKey.trim()) {
    built.featureKey = counter.featureKey.trim();
  }

  if (subclassKey) {
    built.subclassKey = subclassKey;
  }

  if (counter.mode === 'progression') {
    const progression: Record<string, number> = {};

    for (const entry of counter.progression) {
      progression[String(entry.level)] = entry.value;
    }

    if (Object.keys(progression).length > 0) {
      built.progression = progression;
    }
  } else if (counter.formula.trim()) {
    built.formula = counter.formula.trim();
  }

  return built;
}

/** Собирает заклинательную конфигурацию (null, если выключена). */
export function buildSpellcasting(
  spellcasting: EditableSpellcasting,
): ClassDefinition['spellcasting'] {
  if (!spellcasting.enabled) {
    return null;
  }

  return {
    type: spellcasting.type,
    ability: spellcasting.ability,
    startLevel: Math.max(1, Math.round(spellcasting.startLevel || 1)),
  };
}

/**
 * Собирает колонки таблицы прогрессии (лист или группа). Зарезервированные и
 * ПОВТОРНЫЕ листовые ключи отбрасываются (защита от случайного дубля колонки,
 * напр. дважды добавленного пресета «Ячейки заклинаний»).
 */
export function buildColumns(
  columns: EditableTableColumn[],
): NonNullable<ClassDefinition['tableColumns']> {
  const result: NonNullable<ClassDefinition['tableColumns']> = [];
  const seenKeys = new Set<string>();

  for (const column of columns) {
    const children = column.children
      .filter((child) => {
        const key = child.key.trim();

        if (!key || !child.label.trim() || isReservedColumnKey(key)) {
          return false;
        }

        if (seenKeys.has(key)) {
          return false;
        }

        seenKeys.add(key);

        return true;
      })
      .map((child) => ({ key: child.key.trim(), label: child.label.trim() }));

    if (children.length > 0) {
      result.push({ label: column.label.trim(), children });

      continue;
    }

    const leafKey = column.key.trim();

    if (leafKey && !isReservedColumnKey(leafKey) && !seenKeys.has(leafKey)) {
      seenKeys.add(leafKey);
      result.push({ key: leafKey, label: column.label.trim() });
    }
  }

  return result;
}

/** Числовое/строковое значение ячейки (пусто → undefined → колонка не пишется). */
function textToCell(text: string): string | number | undefined {
  const trimmed = text.trim();

  if (!trimmed || trimmed === '—') {
    return undefined;
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

/**
 * Собирает таблицу прогрессии. `featureKeys` каждого уровня выводятся из
 * `features` (по `level`) + синтетический `asi-<level>` при включённом ASI.
 */
export function buildLevelTable(
  rows: EditableLevelRow[],
  features: EditableClassFeature[],
  columns: EditableTableColumn[],
): ClassLevelEntry[] {
  const leafKeys = collectLeafColumnKeys(columns);

  const keysByLevel = new Map<number, string[]>();

  for (const feature of features) {
    if (!feature.name.trim()) {
      continue;
    }

    const level = Math.max(1, Math.round(feature.level || 1));
    const list = keysByLevel.get(level) ?? [];

    list.push(feature.key);
    keysByLevel.set(level, list);
  }

  return rows.map((row) => {
    const featureKeys = [...(keysByLevel.get(row.level) ?? [])];

    if (row.hasAsi) {
      featureKeys.push(`asi-${row.level}`);
    }

    const entry: ClassLevelEntry = {
      level: row.level,
      proficiencyBonus: row.proficiencyBonus,
      featureKeys,
    };

    if (row.newCantrips > 0) {
      entry.newCantrips = row.newCantrips;
    }

    if (row.newSpells > 0) {
      entry.newSpells = row.newSpells;
    }

    for (const key of leafKeys) {
      const value = textToCell(row.columns[key] ?? '');

      if (value !== undefined) {
        entry[key] = value;
      }
    }

    Object.assign(entry, row.preserved);

    return entry;
  });
}

/**
 * Синтетические особенности ASI для уровней с включённым чекбоксом, ключей
 * которых ещё нет среди обычных особенностей. Добавляются в `features`, чтобы
 * детальник показывал «Улучшение характеристик» и мастер находил особенность.
 */
export function buildAsiFeatures(
  rows: EditableLevelRow[],
  existing: ClassFeature[],
): ClassFeature[] {
  const existingKeys = new Set(existing.map((feature) => feature.key));
  const asiFeatures: ClassFeature[] = [];

  for (const row of rows) {
    const key = `asi-${row.level}`;

    if (row.hasAsi && !existingKeys.has(key)) {
      asiFeatures.push({
        key,
        name: ASI_NAME,
        description: ASI_DESCRIPTION,
        level: row.level,
      });
    }
  }

  return asiFeatures;
}

/** Собирает определение подкласса из редактируемых полей. */
export function buildSubclass(subclass: EditableSubclass): SubclassDefinition {
  const baseFeatures = subclass.features
    .filter((feature) => feature.name.trim().length > 0)
    .map((feature) => buildFeature(feature, subclass.key));

  const asiFeatures = subclass.hasOwnTable
    ? buildAsiFeatures(subclass.levelTable, baseFeatures).map((feature) => ({
        ...feature,
        subclassKey: subclass.key,
      }))
    : [];

  const built: SubclassDefinition = {
    key: subclass.key,
    name: subclass.name.trim(),
    nameEn: subclass.nameEn.trim() || subclass.name.trim(),
    description: subclass.description.trim(),
    unlockLevel: Math.max(1, Math.round(subclass.unlockLevel || 1)),
    features: [...baseFeatures, ...asiFeatures],
  };

  if (subclass.sourceKey.trim()) {
    built.sourceKey = subclass.sourceKey.trim();
  }

  const counters = subclass.counters
    .filter((counter) => counter.name.trim().length > 0)
    .map((counter) => buildCounter(counter, subclass.key));

  if (counters.length > 0) {
    built.counters = counters;
  }

  const spellcasting = buildSpellcasting(subclass.spellcasting);

  if (spellcasting) {
    built.spellcasting = spellcasting;
  }

  if (subclass.hasOwnTable) {
    const columns = buildColumns(subclass.tableColumns);

    if (columns.length > 0) {
      built.tableColumns = columns;
    }

    built.levelTable = buildLevelTable(
      subclass.levelTable,
      subclass.features,
      subclass.tableColumns,
    );
  }

  if (subclass.preservedBonusSpells) {
    built.bonusSpells = subclass.preservedBonusSpells;
  }

  return built;
}

/** Опции типов заклинателей для USelect. */
export const CASTER_TYPE_OPTIONS: { value: CasterType; label: string }[] = [
  { value: 'full', label: 'Полный' },
  { value: 'half', label: 'Половинный' },
  { value: 'third', label: 'Третичный' },
  { value: 'pact', label: 'Пакт (колдун)' },
  { value: 'none', label: 'Нет' },
];

/** Опции восстановления счётчика. */
export const RECOVERY_OPTIONS: { value: CounterRecovery; label: string }[] = [
  { value: 'short', label: 'Короткий отдых' },
  { value: 'long', label: 'Продолжительный отдых' },
];

/** Опции кости хитов. */
export const HIT_DIE_OPTIONS: { value: HitDie; label: string }[] = [
  { value: 6, label: 'к6' },
  { value: 8, label: 'к8' },
  { value: 10, label: 'к10' },
  { value: 12, label: 'к12' },
];

/**
 * Пресет колонки таблицы прогрессии — частые «стандартные» колонки заклинателей
 * (заговоры/заклинания/подготовленные/ячейки), которые добавляются одной кнопкой
 * с каноническими ключами вместо ручного ввода. Уникальные для класса колонки
 * по-прежнему создаются вручную через «Колонка»/«Группа».
 */
export interface ColumnPreset {
  /** Уникальный id пресета (для кнопки). */
  id: string;
  /** Подпись кнопки. */
  button: string;
  /** Заголовок добавляемой колонки. */
  columnLabel: string;
  /** Ключ листовой колонки (для одиночной колонки). */
  key?: string;
  /** Подзаголовки группы (для колонки-группы). */
  children?: { key: string; label: string }[];
}

/**
 * Готовые «стандартные» колонки DND (ключи совпадают с SRD-классами PHB 2024,
 * чтобы копии классов из компендиума распознавались автоматически). Добавляются
 * пресет-кнопкой как залоченные (название и ключ не редактируются).
 */
export const COLUMN_PRESETS: ColumnPreset[] = [
  // Заклинатели
  {
    id: 'cantripsKnown',
    button: 'Заговоры',
    columnLabel: 'Известные заговоры',
    key: 'cantripsKnown',
  },
  {
    id: 'knownSpells',
    button: 'Известные закл.',
    columnLabel: 'Известные заклинания',
    key: 'knownSpells',
  },
  {
    id: 'preparedSpells',
    button: 'Подготовл.',
    columnLabel: 'Подготовленные заклинания',
    key: 'preparedSpells',
  },
  {
    id: 'spellSlots',
    button: 'Ячейки закл.',
    columnLabel: 'Ячейки заклинаний',
    children: Array.from({ length: 9 }, (_unused, index) => ({
      key: `spellSlots${index + 1}`,
      label: String(index + 1),
    })),
  },
  {
    id: 'pactSlots',
    button: 'Ячейки пакта',
    columnLabel: 'Ячейки пакта',
    key: 'pactSlots',
  },
  {
    id: 'pactSlotLevel',
    button: 'Ур. ячеек пакта',
    columnLabel: 'Уровень ячеек пакта',
    key: 'pactSlotLevel',
  },
  // Классовые ресурсы
  {
    id: 'sorceryPoints',
    button: 'Очки чародейства',
    columnLabel: 'Очки чародейства',
    key: 'sorceryPoints',
  },
  {
    id: 'disciplinePoints',
    button: 'Очки дисциплины',
    columnLabel: 'Очки дисциплины',
    key: 'disciplinePoints',
  },
  {
    id: 'martialArtsDie',
    button: 'Кость БИ',
    columnLabel: 'Кость боевых искусств',
    key: 'martialArtsDie',
  },
  {
    id: 'unarmoredMovementBonus',
    button: 'Скор. без доспехов',
    columnLabel: 'Скорость без доспехов',
    key: 'unarmoredMovementBonus',
  },
  {
    id: 'rageUses',
    button: 'Ярости',
    columnLabel: 'Ярости',
    key: 'rageUses',
  },
  {
    id: 'rageDamage',
    button: 'Урон ярости',
    columnLabel: 'Урон ярости',
    key: 'rageDamage',
  },
  {
    id: 'sneakAttackDice',
    button: 'Скрытая атака',
    columnLabel: 'Скрытая атака',
    key: 'sneakAttackDice',
  },
  {
    id: 'weaponMasteries',
    button: 'Оруж. приёмы',
    columnLabel: 'Оружейные приёмы',
    key: 'weaponMasteries',
  },
  {
    id: 'secondWindUses',
    button: 'Второе дыхание',
    columnLabel: 'Второе дыхание',
    key: 'secondWindUses',
  },
];

/** Все ключи, которые добавит пресет (лист или подзаголовки группы). */
export function presetKeys(preset: ColumnPreset): string[] {
  if (preset.children) {
    return preset.children.map((child) => child.key);
  }

  return preset.key ? [preset.key] : [];
}

/**
 * Множество всех ключей стандартных колонок (листовые + подзаголовки групп).
 * Плюс алиасы SRD без своей кнопки: `spellsKnown` (Мистический рыцарь, Таинств.
 * ловкач) — синоним `knownSpells`, чтобы такие колонки грузились залоченными.
 */
const STANDARD_COLUMN_KEYS = new Set<string>([
  ...COLUMN_PRESETS.flatMap((preset) => presetKeys(preset)),
  'spellsKnown',
]);

/**
 * Является ли колонка определением стандартной DND-колонки (по ключам). Лист —
 * если его ключ стандартный; группа — если все её подзаголовки стандартные.
 */
export function isStandardColumnDefinition(column: {
  key?: string;
  children?: { key: string }[];
}): boolean {
  if (column.children && column.children.length > 0) {
    return column.children.every((child) =>
      STANDARD_COLUMN_KEYS.has(child.key),
    );
  }

  return column.key ? STANDARD_COLUMN_KEYS.has(column.key) : false;
}

/** Строит редактируемую (залоченную) колонку из пресета с уникальными uid. */
export function buildPresetColumn(preset: ColumnPreset): EditableTableColumn {
  return {
    uid: generateId('tc'),
    key: preset.key ?? '',
    label: preset.columnLabel,
    children: (preset.children ?? []).map((child) => ({
      uid: generateId('tcc'),
      key: child.key,
      label: child.label,
    })),
    locked: true,
  };
}
