/**
 * Zod-схемы структурной валидации предметов D&D 5e (`GameItem`).
 *
 * Валидация ДЕКЛАРАТИВНА и НАМЕРЕННО ЛЕНИВА: проверяется только обобщённый
 * «конверт» предмета (обязательные поля любой системы — id/name/type/quantity/
 * weight/cost/rarity/equipped/isReadOnly и их типы), а все системо-специфичные
 * поля пропускаются `.passthrough()`. Это защищает слой персистентности от
 * грубо повреждённых данных, НЕ рискуя отвергнуть валидный D&D-предмет с полем,
 * которое схема не перечисляет явно. Более строгую по-типовую валидацию можно
 * добавить в соответствующий вариант дискриминированного объединения позже.
 *
 * Дискриминатор — поле `type`; по нему выбирается вариант объединения. Живёт в
 * системе D&D и вызывается Ядром (EntityManager) только через контракт
 * `VttSystem.validateItemData`.
 *
 * @module system/dnd/itemSchemas
 */

import { z } from 'zod';

/** Известные типы предметов D&D 5e (дискриминатор объединения). */
const ITEM_TYPES = [
  'weapon',
  'equipment',
  'feat',
  'tool',
  'background',
  'species',
  'class',
  'spell',
] as const;

/**
 * Стоимость предмета — строка (`"15 зм"`), структурированный объект SRD
 * (`{ value, currency }`) или число (легаси). Объект пропускается `passthrough`.
 */
const CostSchema = z.union([
  z.string(),
  z.number(),
  z
    .object({ value: z.number(), currency: z.string().optional() })
    .passthrough(),
]);

/**
 * Обобщённый «конверт» предмета — поля, обязательные для персистентности любой
 * системы. Системо-специфичные поля добавляются вариантами объединения через
 * `.passthrough()`.
 *
 * До этой схемы рантайм-валидации не было ВООБЩЕ, поэтому конверт обязан
 * принимать всё, что реально живёт в мирах и компендиум-паках: `coerce` для
 * числовых полей (легаси/паки хранят и `"0.5"` строкой), `rarity` — свободная
 * строка (канонический набор — забота форм UI, а не гейта персистентности).
 * Отклонение здесь = молчаливый отказ создания без отклика клиенту.
 */
const GameItemEnvelopeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  quantity: z.coerce.number(),
  weight: z.coerce.number(),
  cost: CostSchema,
  rarity: z.string(),
  equipped: z.boolean(),
  isReadOnly: z.boolean(),
});

/**
 * Дискриминированное по `type` объединение схем предмета. Каждый вариант —
 * обобщённый конверт с литеральным `type` и `.passthrough()` для системо-
 * специфичных полей. Явное перечисление (а не `.map`) сохраняет корректную
 * кортежную типизацию `z.discriminatedUnion`.
 */
export const GameItemSchema = z.discriminatedUnion('type', [
  GameItemEnvelopeSchema.extend({ type: z.literal('weapon') }).passthrough(),
  GameItemEnvelopeSchema.extend({ type: z.literal('equipment') }).passthrough(),
  GameItemEnvelopeSchema.extend({ type: z.literal('feat') }).passthrough(),
  GameItemEnvelopeSchema.extend({ type: z.literal('tool') }).passthrough(),
  GameItemEnvelopeSchema.extend({
    type: z.literal('background'),
  }).passthrough(),
  GameItemEnvelopeSchema.extend({ type: z.literal('species') }).passthrough(),
  GameItemEnvelopeSchema.extend({ type: z.literal('class') }).passthrough(),
  GameItemEnvelopeSchema.extend({ type: z.literal('spell') }).passthrough(),
]);

/** Список известных типов предметов (для потребителей вне схемы). */
export const KNOWN_ITEM_TYPES: readonly string[] = ITEM_TYPES;

/**
 * Предмет НЕ-D&D-типа. Ядро намеренно держит `GameItemType` открытым
 * (`(string & {})`): модуль в D&D-мире может завести собственный тип предмета.
 * Такой предмет — не D&D-данные, по-типовую схему к нему не применить; проверяем
 * только обобщённый конверт персистентности.
 */
const ForeignItemSchema = GameItemEnvelopeSchema.extend({
  type: z.string().min(1),
}).passthrough();

/**
 * Валидирует структуру предмета D&D 5e. Бросает `Error` с человекочитаемым
 * сообщением при нарушении обобщённого конверта или отсутствующем `type`.
 * Известные D&D-типы идут через дискриминированное объединение; неизвестный
 * `type` НЕ отклоняется (открытая модель типов ядра) — только конверт.
 * Реализация контракта `VttSystem.validateItemData`.
 *
 * @param item - произвольные данные предмета для проверки
 */
export function validateGameItem(item: unknown): void {
  const isKnownType =
    typeof item === 'object'
    && item !== null
    && 'type' in item
    && typeof item.type === 'string'
    && KNOWN_ITEM_TYPES.includes(item.type);

  const schema = isKnownType ? GameItemSchema : ForeignItemSchema;
  const result = schema.safeParse(item);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Некорректные данные предмета: ${issues}`);
  }
}
