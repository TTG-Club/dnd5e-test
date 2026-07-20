import type { GameItem, Spell } from '@vtt/shared/system/dnd.js';

/**
 * Извлекает данные заклинания из GameItem-обёртки.
 *
 * Используется при отображении заклинаний, хранящихся как GameItem
 * (в предметах, экипировке). Метаданные верхнего уровня (`name`, `description`, `source`)
 * переносятся из GameItem, объединяясь со вложенным `spellData`.
 *
 * @param item - GameItem с type === 'spell' и заполненным spellData
 * @returns объект Spell с мета-полями из GameItem
 */
export function extractSpellFromGameItem(item: GameItem): Spell {
  return {
    ...item.spellData,
    id: item.id,
    name: item.name,
    nameEn: item.nameEn,
    description: item.description,
    isSRD: item.isSRD,
    sourceKey: item.sourceKey,
  } as Spell;
}
