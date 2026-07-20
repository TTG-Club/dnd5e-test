/**
 * Минимальный бросок кубиковой формулы урона — server-safe (без внешних
 * зависимостей и без рандом-движка клиента).
 *
 * Поддерживает слагаемые вида `NкM` / `NдM` / `NdM` (кубики) и плоские числа,
 * соединённые `+`/`−`. Используется серверным рантаймом периодического урона
 * (DoT): на клиенте бросок делает rpg-dice-roller, но сервер тикает урон сам.
 *
 * НЕ поддерживает `@`-токены и продвинутую нотацию (kh/kl и т.п.) — токены
 * `@dmg.<type>` нужно снять заранее (через разбор сегментов), а сложные броски
 * для периодического урона не используются.
 */

/** Регэксп одного кубикового слагаемого: `2к6`, `1д8`, `3d10` */
const DICE_TERM_REGEX = /^(\d+)[кдd](\d+)$/i;

/**
 * Бросает кубиковую формулу и возвращает сумму и выпавшие значения кубиков.
 *
 * @param formula - формула без `@`-токенов (напр. «2к6 + 3»)
 * @returns сумма броска и массив выпавших значений (для отображения)
 */
export function rollDamageFormula(formula: string): {
  total: number;
  values: number[];
} {
  const values: number[] = [];

  let total = 0;

  const normalized = formula.replace(/\s+/g, '');
  const terms = normalized.match(/[+-]?[^+-]+/g) ?? [];

  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    const diceMatch = body.match(DICE_TERM_REGEX);

    if (diceMatch) {
      const count = Number.parseInt(diceMatch[1], 10);
      const sides = Number.parseInt(diceMatch[2], 10);

      for (let rollIndex = 0; rollIndex < count; rollIndex++) {
        const roll = Math.floor(Math.random() * sides) + 1;

        values.push(roll);
        total += sign * roll;
      }

      continue;
    }

    const flat = Number.parseInt(body, 10);

    if (!Number.isNaN(flat)) {
      total += sign * flat;
    }
  }

  return { total, values };
}
