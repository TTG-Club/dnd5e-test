import type { BaseGameItem } from '../types/index.js';

/**
 * Форматирует стоимость предмета (строка или объект { value, currency }) в удобную строку.
 * @param cost Стоимость предмета
 * @returns Отформатированная строка
 */
export function formatItemCost(cost: BaseGameItem['cost']): string {
  if (!cost) {
    return '';
  }

  if (typeof cost === 'string') {
    return cost;
  }

  const currencyMap: Record<string, string> = {
    cp: 'мм',
    sp: 'см',
    ep: 'эм',
    gp: 'зм',
    pp: 'пм',
  };

  const currencyStr = cost.currency
    ? (currencyMap[cost.currency.toLowerCase()] ?? cost.currency)
    : 'зм';

  return `${cost.value} ${currencyStr}`;
}
