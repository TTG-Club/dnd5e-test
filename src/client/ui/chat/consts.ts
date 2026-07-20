/**
 * Маппинг редкости предмета на CSS-класс рамки карточки.
 * Используется в EquipmentCardContent и ToolCardContent.
 */
export const RARITY_BORDER_CLASSES: Record<string, string> = {
  'common': 'border-accented/50',
  'uncommon': 'border-success/40',
  'rare': 'border-info/40',
  'very-rare': 'border-primary/40',
  'legendary': 'border-warning/40',
  'artifact': 'border-error/40',
};

/** Класс рамки по умолчанию (нет редкости или «none») */
export const RARITY_BORDER_DEFAULT = 'border-accented/50';
