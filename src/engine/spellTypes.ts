/**
 * Константы системы заклинаний D&D 5.5e (PHB 2024)
 *
 * Содержит локализованные лейблы школ магии, времени сотворения,
 * длительности, форм областей и утилиты маппинга.
 */

import type {
  MeasurementTemplateType,
  SpellAreaShape,
  SpellCastingTimeUnit,
  SpellDeliveryType,
  SpellDurationUnit,
  SpellSaveType,
  SpellSchool,
  SpellTargetType,
} from '@vtt/shared';

// ── Школы магии ──────────────────────────────────────────────

/** Школы магии для UI-селектов */
export const SPELL_SCHOOL_OPTIONS = [
  { value: 'abjuration' as const, label: 'Ограждение' },
  { value: 'conjuration' as const, label: 'Вызов' },
  { value: 'divination' as const, label: 'Прорицание' },
  { value: 'enchantment' as const, label: 'Очарование' },
  { value: 'evocation' as const, label: 'Воплощение' },
  { value: 'illusion' as const, label: 'Иллюзия' },
  { value: 'necromancy' as const, label: 'Некромантия' },
  { value: 'transmutation' as const, label: 'Преобразование' },
] as const;

/** Локализованные названия школ магии (производные от SPELL_SCHOOL_OPTIONS) */
export const SPELL_SCHOOL_LABELS: Record<SpellSchool, string> =
  Object.fromEntries(
    SPELL_SCHOOL_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SpellSchool, string>;

// ── Время сотворения ─────────────────────────────────────────

/** Единицы времени сотворения для UI-селектов */
export const CASTING_TIME_OPTIONS = [
  { value: 'action' as const, label: 'Действие' },
  { value: 'bonus-action' as const, label: 'Бонусное действие' },
  {
    value: 'bonus-action-after-hit' as const,
    label:
      'Бонусное действие, которое вы совершаете сразу после попадания по существу рукопашным оружием или безоружным ударом.',
  },
  { value: 'reaction' as const, label: 'Реакция' },
  { value: 'minute' as const, label: 'Минута' },
  { value: 'hour' as const, label: 'Час' },
] as const;

/** Локализованные названия единиц времени сотворения (производные от CASTING_TIME_OPTIONS) */
export const CASTING_TIME_LABELS: Record<SpellCastingTimeUnit, string> =
  Object.fromEntries(
    CASTING_TIME_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SpellCastingTimeUnit, string>;

// ── Длительность ─────────────────────────────────────────────

/** Единицы длительности для UI-селектов */
export const DURATION_UNIT_OPTIONS = [
  { value: 'instantaneous' as const, label: 'Мгновенное' },
  { value: 'round' as const, label: 'Раунд' },
  { value: 'minute' as const, label: 'Минута' },
  { value: 'hour' as const, label: 'Час' },
  { value: 'day' as const, label: 'День' },
  { value: 'special' as const, label: 'Особая' },
  { value: 'until-dispelled' as const, label: 'Пока не рассеется' },
] as const;

/** Локализованные названия единиц длительности (производные от DURATION_UNIT_OPTIONS) */
export const DURATION_UNIT_LABELS: Record<SpellDurationUnit, string> =
  Object.fromEntries(
    DURATION_UNIT_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SpellDurationUnit, string>;

// ── Тип цели ─────────────────────────────────────────────────

/** Типы целей для UI-селектов */
export const TARGET_TYPE_OPTIONS = [
  { value: 'creature' as const, label: 'Существо' },
  { value: 'object' as const, label: 'Предмет' },
  { value: 'point' as const, label: 'Точка' },
  { value: 'self' as const, label: 'На себя' },
  { value: 'area' as const, label: 'Область' },
  { value: 'none' as const, label: 'Нет цели' },
] as const;

/** Локализованные названия типов целей (производные от TARGET_TYPE_OPTIONS) */
export const TARGET_TYPE_LABELS: Record<SpellTargetType, string> =
  Object.fromEntries(
    TARGET_TYPE_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SpellTargetType, string>;

// ── Распределение снарядов по целям ──────────────────────────

/**
 * Режимы распределения снарядов для UI-радио. Значение `'any'` — форменный
 * дефолт «свободно», в `Spell.projectiles.targetDistribution` НЕ пишется
 * (поле остаётся пустым).
 */
export const PROJECTILE_DISTRIBUTION_OPTIONS = [
  {
    value: 'any' as const,
    label: 'Свободно',
    description: 'В одну цель или в несколько — решается при касте',
  },
  {
    value: 'single' as const,
    label: 'Только одна цель',
    description: 'Выбирается одна цель, все снаряды летят в неё',
  },
  {
    value: 'distinct' as const,
    label: 'Каждый снаряд в свою цель',
    description: 'Нельзя направить два снаряда в одну цель',
  },
] as const;

// ── Форма области ────────────────────────────────────────────

/** Формы областей для UI-селектов */
export const AREA_SHAPE_OPTIONS = [
  { value: 'cone' as const, label: 'Конус' },
  { value: 'circle' as const, label: 'Сфера' },
  { value: 'ray' as const, label: 'Линия' },
  { value: 'rect' as const, label: 'Куб' },
  { value: 'cylinder' as const, label: 'Цилиндр' },
] as const;

/** Локализованные названия форм областей (производные от AREA_SHAPE_OPTIONS) */
export const AREA_SHAPE_LABELS: Record<SpellAreaShape, string> =
  Object.fromEntries(
    AREA_SHAPE_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SpellAreaShape, string>;

/** Формы области, размер которых задаётся радиусом (круг, цилиндр) */
const RADIUS_AREA_SHAPES: ReadonlySet<SpellAreaShape> = new Set([
  'circle',
  'cylinder',
]);

/** Формы области, требующие отдельного указания ширины (линия, прямоугольник) */
const WIDTH_AREA_SHAPES: ReadonlySet<SpellAreaShape> = new Set(['ray', 'rect']);

/**
 * Использует ли форма области радиус вместо линейного размера стороны.
 *
 * @param shape - форма области
 * @returns `true` для круга и цилиндра
 */
export function isRadiusAreaShape(shape: SpellAreaShape): boolean {
  return RADIUS_AREA_SHAPES.has(shape);
}

/**
 * Подпись поля основного размера области (радиус либо размер стороны).
 *
 * @param shape - форма области
 * @returns локализованная подпись поля
 */
export function getAreaSizeLabel(shape: SpellAreaShape): string {
  return isRadiusAreaShape(shape) ? 'Радиус' : 'Размер';
}

/**
 * Требует ли форма области отдельного указания ширины.
 *
 * @param shape - форма области
 * @returns `true` для линии и прямоугольника
 */
export function areaShapeUsesWidth(shape: SpellAreaShape): boolean {
  return WIDTH_AREA_SHAPES.has(shape);
}

/**
 * Требует ли форма области отдельного указания высоты.
 *
 * @param shape - форма области
 * @returns `true` только для цилиндра
 */
export function areaShapeUsesHeight(shape: SpellAreaShape): boolean {
  return shape === 'cylinder';
}

// ── Спасбросок ───────────────────────────────────────────────

/** Типы спасбросков для UI-селектов */
export const SAVE_TYPE_OPTIONS = [
  { value: 'none' as const, label: 'Нет' },
  { value: 'strength' as const, label: 'Сила' },
  { value: 'dexterity' as const, label: 'Ловкость' },
  { value: 'constitution' as const, label: 'Телосложение' },
  { value: 'intelligence' as const, label: 'Интеллект' },
  { value: 'wisdom' as const, label: 'Мудрость' },
  { value: 'charisma' as const, label: 'Харизма' },
] as const;

/** Локализованные названия типов спасбросков (производные от SAVE_TYPE_OPTIONS) */
export const SAVE_TYPE_LABELS: Record<SpellSaveType, string> =
  Object.fromEntries(
    SAVE_TYPE_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SpellSaveType, string>;

// ── Тип совершения ───────────────────────────────────────────

/** Типы совершения для UI-селектов */
export const DELIVERY_TYPE_OPTIONS = [
  { value: 'ranged' as const, label: 'Дальнобойная атака' },
  { value: 'melee' as const, label: 'Рукопашная атака' },
  { value: 'self' as const, label: 'На себя' },
  { value: 'touch' as const, label: 'Касание' },
  { value: 'sight' as const, label: 'Зрение' },
  { value: 'none' as const, label: 'Нет' },
] as const;

/** Локализованные названия типов совершения (производные от DELIVERY_TYPE_OPTIONS) */
export const DELIVERY_TYPE_LABELS: Record<SpellDeliveryType, string> =
  Object.fromEntries(
    DELIVERY_TYPE_OPTIONS.map((option) => [option.value, option.label]),
  ) as Record<SpellDeliveryType, string>;

// ── Круги заклинаний ─────────────────────────────────────────

/** Круги заклинаний для UI-селектов */
export const SPELL_LEVEL_OPTIONS = [
  { value: 0, label: 'Заговор' },
  { value: 1, label: '1-й круг' },
  { value: 2, label: '2-й круг' },
  { value: 3, label: '3-й круг' },
  { value: 4, label: '4-й круг' },
  { value: 5, label: '5-й круг' },
  { value: 6, label: '6-й круг' },
  { value: 7, label: '7-й круг' },
  { value: 8, label: '8-й круг' },
  { value: 9, label: '9-й круг' },
] as const;

/** Локализованные названия кругов заклинаний (производные от SPELL_LEVEL_OPTIONS) */
export const SPELL_LEVEL_LABELS: Record<number, string> = Object.fromEntries(
  SPELL_LEVEL_OPTIONS.map((option) => [option.value, option.label]),
);

/** Эффект спасброска для UI */
export const SAVE_EFFECT_OPTIONS = [
  { value: 'half' as const, label: 'Половина урона' },
  { value: 'none' as const, label: 'Нет урона' },
  { value: 'special' as const, label: 'Особый' },
] as const;

// ── Маппинг форм на шаблоны ─────────────────────────────────

/**
 * Возвращает тип MeasurementTemplate для формы области заклинания.
 * Поскольку SpellAreaShape === MeasurementTemplateType, это identity-функция.
 *
 * @param shape - форма области заклинания
 * @returns тип шаблона измерения
 */
export function getSpellTemplateType(
  shape: SpellAreaShape,
): MeasurementTemplateType {
  return shape;
}

/** Цвета шаблонов по типу урона заклинания */
export const SPELL_DAMAGE_TEMPLATE_COLORS: Record<string, number> = {
  fire: 0xff4400,
  cold: 0x44aaff,
  lightning: 0xffff44,
  thunder: 0x8844ff,
  poison: 0x44ff44,
  acid: 0x88ff00,
  necrotic: 0x884488,
  radiant: 0xffffaa,
  force: 0xbb44ff,
  psychic: 0xff44aa,
  slashing: 0xcccccc,
  piercing: 0xcccccc,
  bludgeoning: 0xcccccc,
};

/** Цвет шаблона по умолчанию (если тип урона неизвестен) */
export const SPELL_TEMPLATE_DEFAULT_COLOR = 0x6644ff;
