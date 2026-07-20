/**
 * Общие хелперы по заклинаниям компендиума: тайп-гард записи, извлечение
 * заклинаний из произвольных записей и поиск по id с учётом предпочтённого пака.
 * Вынесены, чтобы не дублировать в резолверах granted-заклинаний и в редакторе
 * вида (правило DRY).
 */

import type { TypedWebSocketClient } from '@vtt/shared';
import type { GrantedSpellRef, Spell } from '@vtt/shared/system/dnd.js';

import type { SpellOption } from '../ui/actor/grantedSpellsEditorTypes';

import { loadCompendiumKindByPack } from '@/core/compendiumDataClient';

/**
 * Проверяет, является ли запись компендиума заклинанием.
 *
 * @param value - запись компендиума неизвестной формы
 * @returns `true`, если запись имеет форму заклинания
 */
export function isSpellEntry(value: unknown): value is Spell {
  return (
    typeof value === 'object'
    && value !== null
    && 'type' in value
    && value.type === 'spell'
    && 'id' in value
    && typeof value.id === 'string'
    && 'name' in value
    && typeof value.name === 'string'
    && 'level' in value
    && typeof value.level === 'number'
  );
}

/**
 * Извлекает заклинания из произвольного массива записей компендиума.
 *
 * @param entries - записи компендиума (включая возможные разделители)
 * @returns только записи-заклинания
 */
export function extractSpellEntries(entries: ReadonlyArray<unknown>): Spell[] {
  const spells: Spell[] = [];

  for (const entry of entries) {
    if (isSpellEntry(entry)) {
      spells.push(entry);
    }
  }

  return spells;
}

/**
 * Находит заклинание по id среди паков: сперва в предпочтённом паке, затем в
 * любом. Откат по id сохраняет переносимость (у другого мастера может не быть
 * предпочтённого пака).
 *
 * @param packs - заклинания, сгруппированные по пакам
 * @param spellId - id искомого заклинания
 * @param preferredPackId - предпочтённый пак (опционально)
 * @returns найденное заклинание или undefined
 */
export function findSpellInPacks(
  packs: ReadonlyArray<{ packId: string; spells: Spell[] }>,
  spellId: string,
  preferredPackId?: string,
): Spell | undefined {
  if (preferredPackId) {
    const preferredPack = packs.find((pack) => pack.packId === preferredPackId);

    const preferredSpell = preferredPack?.spells.find(
      (spell) => spell.id === spellId,
    );

    if (preferredSpell) {
      return preferredSpell;
    }
  }

  for (const pack of packs) {
    const found = pack.spells.find((spell) => spell.id === spellId);

    if (found) {
      return found;
    }
  }

  return undefined;
}

/** Заклинания одного пака-компендиума (для просмотра по клику). */
export interface SpellPack {
  packId: string;
  packName: string;
  spells: Spell[];
}

/**
 * Загружает заклинания компендиума ПО ПАКАМ: для каждого пака — полные
 * заклинания (для просмотра) и лёгкие проекции {@link SpellOption} (для
 * подсказок связывания и выбора пака). Общий код редакторов выдаваемых
 * заклинаний (вид, черта) — без дублирования (DRY).
 *
 * @param socket - WebSocket-клиент
 */
export async function loadSpellPacks(
  socket: TypedWebSocketClient,
): Promise<{ packs: SpellPack[]; options: SpellOption[] }> {
  const loadedPacks = await loadCompendiumKindByPack(socket, 'spell');
  const packs: SpellPack[] = [];
  const options: SpellOption[] = [];

  for (const pack of loadedPacks) {
    const spells = extractSpellEntries(pack.entries);

    packs.push({ packId: pack.packId, packName: pack.packName, spells });

    for (const spell of spells) {
      options.push({
        id: spell.id,
        name: spell.name,
        nameEn: spell.nameEn,
        sourceKey: spell.sourceKey,
        packId: pack.packId,
        packName: pack.packName,
      });
    }
  }

  return { packs, options };
}

/** Индекс авто-связывания: id заклинаний по имени и паки по id заклинания. */
export interface SpellLinkIndex {
  idsByName: Map<string, Set<string>>;
  packsBySpellId: Map<string, Set<string>>;
}

/**
 * Строит индекс авто-связывания из вариантов заклинаний (по пакам).
 *
 * @param options - заклинания компендиума по пакам
 */
export function buildSpellLinkIndex(
  options: ReadonlyArray<SpellOption>,
): SpellLinkIndex {
  const idsByName = new Map<string, Set<string>>();
  const packsBySpellId = new Map<string, Set<string>>();

  for (const option of options) {
    const nameKey = option.name.trim().toLowerCase();
    const ids = idsByName.get(nameKey) ?? new Set<string>();

    ids.add(option.id);
    idsByName.set(nameKey, ids);

    const packs = packsBySpellId.get(option.id) ?? new Set<string>();

    packs.add(option.packId);
    packsBySpellId.set(option.id, packs);
  }

  return { idsByName, packsBySpellId };
}

/**
 * Авто-связывает НЕсведённые выдаваемые заклинания с компендиумом по ТОЧНОМУ
 * уникальному (по id) совпадению имени. `packId` проставляется, только если
 * заклинание есть ровно в одном паке; иначе пак выбирает пользователь. Правит
 * переданные `refs` на месте.
 *
 * @param refs - выдаваемые заклинания (правятся in-place)
 * @param index - индекс авто-связывания
 */
export function linkGrantedSpellRefs(
  refs: GrantedSpellRef[],
  index: SpellLinkIndex,
): void {
  for (const spellRef of refs) {
    if (spellRef.spellId) {
      continue;
    }

    const ids = index.idsByName.get(spellRef.name.trim().toLowerCase());

    if (!ids || ids.size !== 1) {
      continue;
    }

    const [onlyId] = [...ids];

    spellRef.spellId = onlyId;

    const packs = index.packsBySpellId.get(onlyId);

    if (packs && packs.size === 1) {
      const [onlyPack] = [...packs];

      spellRef.packId = onlyPack;
    }
  }
}
