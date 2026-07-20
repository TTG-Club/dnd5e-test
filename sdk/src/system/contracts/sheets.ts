/**
 * Контракт листа персонажа (Actor Sheet).
 *
 * Определяет метаданные, необходимые для регистрации
 * компонента листа персонажа игровой системой.
 *
 * @module contracts/sheets
 */

/**
 * Тип актёра, для которого регистрируется лист.
 * Расширяется системами (D&D: 'player', 'npc', 'creature').
 */
export type ActorSheetType = string;

/**
 * Метаданные регистрации листа персонажа.
 * Компонент хранится на клиенте (Vue Component), здесь только контракт.
 */
export interface ActorSheetDefinition {
  /** Тип актёра (например, 'player', 'npc', 'creature') */
  actorType: ActorSheetType;
  /** Человекочитаемое название листа */
  label: string;
  /** ID системы-владельца */
  systemId: string;
}
