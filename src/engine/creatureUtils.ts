/**
 * Утилиты для работы с данными существ (Бестиарий) D&D 5e.
 *
 * Содержит чистые функции для преобразования полей существ
 * (например, склейку абзацев описания действий в Markdown).
 */

import type { CreatureAction } from './creatureTypes.js';

/** Разделитель абзацев Markdown в описаниях действий существ. */
const ACTION_DESCRIPTION_PARAGRAPH_SEPARATOR = '\n\n';

/**
 * Объединяет абзацы описания действия существа в единую Markdown-строку.
 * @param action - действие существа
 * @returns описание действия в формате Markdown
 */
export function getActionDescriptionMarkdown(action: CreatureAction): string {
  return action.description.join(ACTION_DESCRIPTION_PARAGRAPH_SEPARATOR);
}

/**
 * Преобразует Markdown-описание из редактора в массив абзацев,
 * совместимый с моделью `CreatureAction`.
 * @param description - описание из редактора
 * @returns массив описаний для действия существа
 */
export function buildActionDescription(description: string): string[] {
  const trimmedDescription = description.trim();

  return trimmedDescription ? [trimmedDescription] : [];
}
