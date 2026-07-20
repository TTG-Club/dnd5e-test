/**
 * Контракт карточки чата (Chat Card).
 *
 * Определяет метаданные для регистрации компонентов,
 * отображающих карточки предметов/заклинаний/способностей в чате.
 *
 * @module contracts/cards
 */

import type { ChatCardType } from '../../types/index.js';

/**
 * Метаданные регистрации карточки чата.
 * Компонент хранится на клиенте (Vue Component), здесь только контракт.
 */
export interface ChatCardDefinition {
  /** Уникальный тип карточки (например, 'spell', 'weapon') */
  cardType: ChatCardType;
  /** Человекочитаемое название */
  label: string;
  /** ID системы-владельца */
  systemId: string;
}
