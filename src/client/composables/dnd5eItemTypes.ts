/**
 * Провайдер типов предметов D&D 5e для панели «Предметы» ядра.
 *
 * Всё знание D&D о предметах (какие типы, их иконки/подписи, какую модалку
 * открыть на просмотр/правку и как свернуть сохранённый объект / отправить
 * карточку в чат) живёт ЗДЕСЬ, в системе. Ядровая панель предметов лишь вызывает
 * методы провайдера через `itemTypeRegistry`. Логика перенесена из
 * `modules/items/ui/ItemsPanel.vue` без изменения поведения.
 *
 * @module systems/dnd5e/composables/dnd5eItemTypes
 */

import type { BaseGameItem, TypedWebSocketClient } from '@vtt/shared';
import type { DnDGameItem, GameItem, Spell } from '@vtt/shared/system/dnd.js';

import type {
  ItemFormContext,
  ItemTypeMeta,
  ItemTypeProvider,
} from '@/core/registries';

import { useModalManager } from '@/shared_ui/composables/useModalManager';
import { useChatStore } from '@/stores/chatStore';

import { useFeatModal } from './useFeatModal';

/** Конфигурация типа предмета: иконка, префикс модалки, подпись. */
interface ItemTypeConfig {
  icon: string;
  modalPrefix: string;
  label: string;
}

/** Единый словарь типов предметов D&D 5e. */
const ITEM_TYPE_CONFIG: Record<string, ItemTypeConfig> = {
  weapon: { icon: 'tabler:sword', modalPrefix: 'Weapon', label: 'Оружие' },
  equipment: {
    icon: 'tabler:shield',
    modalPrefix: 'Equipment',
    label: 'Снаряжение',
  },
  tool: { icon: 'tabler:tools', modalPrefix: 'Tool', label: 'Инструменты' },
  feat: { icon: 'tabler:star', modalPrefix: 'Feat', label: 'Черты' },
  background: {
    icon: 'tabler:book-2',
    modalPrefix: 'Background',
    label: 'Предыстории',
  },
  species: { icon: 'tabler:user', modalPrefix: 'Species', label: 'Виды' },
  class: {
    icon: 'tabler:users-group',
    modalPrefix: 'Class',
    label: 'Классы',
  },
  spell: { icon: 'tabler:wand', modalPrefix: 'Spell', label: 'Заклинания' },
};

/**
 * Формирует имя модалки по типу и действию (`weapon`+`FormModal`→`WeaponFormModal`).
 *
 * @param type - тип предмета
 * @param action - суффикс (`DetailModal` / `FormModal`)
 * @returns имя модалки
 */
function getModalName(type: string, action: string): string {
  const prefix =
    ITEM_TYPE_CONFIG[type]?.modalPrefix
    ?? type.charAt(0).toUpperCase() + type.slice(1);

  return `${prefix}${action}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Заклинание (Spell), а не GameItem: имеет `type: 'spell'`, но НЕ имеет
 * `quantity` (поле GameItem).
 */
function isSpellEntity(value: unknown): value is Spell {
  return (
    isRecord(value)
    && value.type === 'spell'
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.school === 'string'
    && !('quantity' in value)
  );
}

function isGameItemLike(value: unknown): value is GameItem {
  return (
    isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.description === 'string'
    && typeof value.type === 'string'
    && 'quantity' in value
  );
}

/**
 * Создаёт провайдер типов предметов D&D 5e.
 *
 * @returns реализация `ItemTypeProvider`
 */
export function createDnd5eItemTypeProvider(): ItemTypeProvider {
  const types: ItemTypeMeta[] = Object.entries(ITEM_TYPE_CONFIG).map(
    ([type, config]) => ({ type, icon: config.icon, label: config.label }),
  );

  /** Открывает модалку по вычисленному имени (динамическое имя — каст в одном месте). */
  const openByName = (name: string, props: Record<string, unknown>): void => {
    const { openModal } = useModalManager();

    (openModal as (n: string, p: Record<string, unknown>) => void)(name, props);
  };

  const openDetail = (baseItem: BaseGameItem): void => {
    // Доверенное сужение: ядро отдаёт нейтральный предмет, но в мире D&D он всегда
    // D&D-формы (все D&D-поля опциональны → присваивание без каста).
    const item: DnDGameItem = baseItem;

    // Заклинание: SpellDetailModal ожидает prop `spell` (плоский Spell из spellData).
    if (item.type === 'spell') {
      openByName(getModalName('spell', 'DetailModal'), {
        spell: item.spellData ?? null,
      });

      return;
    }

    // Черта: отдельной модалки нет — стандартное описание (ActorDescriptionModal).
    if (item.type === 'feat') {
      useFeatModal().openFeatDescription(item);

      return;
    }

    // Вид/Класс: *DetailModal ожидают плоское определение из вложенного блоба.
    if (item.type === 'species') {
      openByName(getModalName('species', 'DetailModal'), {
        speciesDefinition: item.speciesData ?? null,
        speciesItemId: item.id ?? null,
      });

      return;
    }

    if (item.type === 'class') {
      openByName(getModalName('class', 'DetailModal'), {
        classDefinition: item.classData ?? null,
        classItemId: item.id ?? null,
      });

      return;
    }

    // Оружие/снаряжение/инструмент/предыстория — обобщённо { item }.
    openByName(getModalName(item.type, 'DetailModal'), { item });
  };

  const openForm = (
    type: string,
    baseItem: BaseGameItem | null,
    ctx: ItemFormContext,
  ): void => {
    // Доверенное сужение к D&D-форме (см. openDetail).
    const item: DnDGameItem | null = baseItem;
    const socket: TypedWebSocketClient | null = ctx.socket;
    const onSave = ctx.onSave;
    const modalName = getModalName(type, 'FormModal');

    // Черта: FeatFormModal ждёт prop `feat`, а не `item`.
    if (type === 'feat') {
      openByName(modalName, { onSave, feat: item ?? null, socket });

      return;
    }

    // Предыстория: реюзает редактор заклинаний/эффектов и грузит черты — нужен socket.
    if (type === 'background') {
      openByName(modalName, { item, onSave, socket });

      return;
    }

    // Вид: SpeciesFormModal ждёт плоский speciesDefinition из вложенного блоба.
    if (type === 'species') {
      openByName(modalName, {
        onSave,
        speciesDefinition: item?.speciesData ?? null,
        speciesItemId: item?.id ?? null,
        socket,
      });

      return;
    }

    // Класс: ClassFormModal ждёт плоский classDefinition из вложенного блоба.
    if (type === 'class') {
      openByName(modalName, {
        onSave,
        classDefinition: item?.classData ?? null,
        classItemId: item?.id ?? null,
        socket,
      });

      return;
    }

    // Оружие/снаряжение/инструмент/заклинание — обобщённо { item, onSave }.
    openByName(modalName, { item, onSave });
  };

  /**
   * Сворачивает сохранённый объект в GameItem. Spell из SpellFormModal
   * оборачивается в GameItem-обёртку со spellData; GameItem — как есть.
   */
  const normalizeSave = (saved: unknown): GameItem | null => {
    if (isSpellEntity(saved)) {
      return {
        id: saved.id,
        name: saved.name,
        nameEn: saved.nameEn,
        description: saved.description,
        type: 'spell',
        quantity: 1,
        weight: 0,
        cost: '',
        rarity: 'common',
        equipped: false,
        sourceKey: saved.sourceKey,
        isSRD: saved.isSRD,
        isReadOnly: false,
        spellData: saved,
      };
    }

    if (isGameItemLike(saved)) {
      return saved;
    }

    return null;
  };

  /**
   * Отправляет карточку предмета в чат. Пока share только у заклинаний: метаданные
   * верхнего уровня сливаются со spellData (карточка чата ждёт объект Spell).
   */
  const shareToChat = (baseItem: BaseGameItem): void => {
    // Доверенное сужение к D&D-форме (см. openDetail).
    const item: DnDGameItem = baseItem;

    if (item.type !== 'spell' || !item.spellData) {
      return;
    }

    const spell = {
      ...item.spellData,
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      description: item.description,
      isSRD: item.isSRD,
      sourceKey: item.sourceKey,
    };

    useChatStore().sendItemCard({
      cardType: 'spell',
      title: item.name,
      payload: JSON.stringify(spell),
    });
  };

  return { types, openDetail, openForm, normalizeSave, shareToChat };
}
