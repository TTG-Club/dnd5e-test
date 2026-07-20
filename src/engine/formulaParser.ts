/**
 * Безопасный парсер арифметических формул с @-переменными
 *
 * Используется в системе Active Effects для вычисления значений
 * из формул вроде `@mod.cha + 2` или `@prof * 2`.
 *
 * Архитектура:
 * 1. Лексер (tokenize) — строка → массив токенов
 * 2. Парсер (parse) — рекурсивный спуск с приоритетами (Pratt parser)
 * 3. Evaluator (evaluate) — обход AST с подстановкой @-переменных
 *
 * Отличается от @ttg-club/dice-roller-parser:
 * - Тот парсит нотацию кубиков (2d20kh1) и бросает рандом
 * - Этот — детерминированная арифметика с контекстом актора
 *
 * Безопасность:
 * - НЕ использует eval() или Function()
 * - Поддерживает ТОЛЬКО: числа, +, -, ×, /, скобки, @-переменные, min/max/floor/ceil
 * - Отклоняет любой невалидный ввод
 */

import { isActorEntity } from '@vtt/shared';
import { getTotalLevel } from './classTypes.js';

// ── Типы ──────────────────────────────────────────────────────

/** Контекст для подстановки @-переменных в формулах */
export interface FormulaContext {
  /** Характеристики с модификаторами */
  abilities: Record<string, { value: number; mod: number }>;
  /** Бонус мастерства */
  prof: number;
  /** Уровень персонажа */
  level: number;
  /**
   * Модификатор заклинательной характеристики (для токена `@mod.spell`).
   *
   * Заполняется на стороне вызова при касте заклинания, т.к. зависит от
   * конкретного заклинания (его `attackAbility` может переопределять класс).
   * Если не задан — `@mod.spell` считается ошибкой.
   */
  spellMod?: number;
  /**
   * Состояние цели для условных токенов `@target.full` / `@target.notFull`.
   *
   * Заполняется при разрешении формулы в контексте конкретной цели (per-target).
   * Если не задан — `@target.full` → 0, `@target.notFull` → 1 (безопасный дефолт,
   * чтобы формула не падала вне таргет-контекста).
   */
  target?: {
    /** У цели полный запас хитов */
    isFull: boolean;
  };
}

/**
 * Сокращённые коды характеристик → полные имена.
 *
 * Используется для синтаксиса `@mod.str` / `@str`.
 * Единый стандарт для заклинаний и эффектов.
 */
export const ABILITY_ABBREVIATIONS: Readonly<Record<string, string>> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

/** Результат валидации формулы */
export interface FormulaValidationResult {
  /** Валидна ли формула */
  valid: boolean;
  /** Описание ошибки (если невалидна) */
  error?: string;
}

/** Подсказка для UI автокомплита @-переменных */
export interface FormulaVariableHint {
  /** Полный ключ переменной (напр. @mod.str) */
  key: string;
  /** Локализованное описание */
  label: string;
  /** Группа для группировки в UI */
  group: string;
}

/** Тип токена лексера */
type TokenType =
  | 'number'
  | 'operator'
  | 'leftParen'
  | 'rightParen'
  | 'variable'
  | 'function'
  | 'comma';

/** Токен лексера */
interface FormulaToken {
  type: TokenType;
  value: string;
}

/** Тип узла AST */
type AstNodeType =
  | 'number'
  | 'variable'
  | 'binaryOp'
  | 'unaryOp'
  | 'functionCall';

/** Узел AST */
interface AstNode {
  type: AstNodeType;
  /** Значение (для number — число, для variable — путь, для operator — символ) */
  value?: string;
  /** Числовое значение (для number) */
  numericValue?: number;
  /** Левый операнд (для binaryOp) */
  left?: AstNode;
  /** Правый операнд (для binaryOp, unaryOp) */
  right?: AstNode;
  /** Аргументы функции (для functionCall) */
  args?: AstNode[];
}

/** Ошибка парсинга формулы */
export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

// ── Константы ─────────────────────────────────────────────────

/** Поддерживаемые функции */
const SUPPORTED_FUNCTIONS = new Set(['min', 'max', 'floor', 'ceil', 'abs']);

/** Приоритет операторов */
const OPERATOR_PRECEDENCE: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

// ── Лексер ────────────────────────────────────────────────────

/**
 * Токенизирует строку формулы в массив токенов.
 *
 * @param formula - исходная строка формулы
 * @returns массив токенов
 * @throws FormulaError при невалидных символах
 */
function tokenize(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];

  let position = 0;

  while (position < formula.length) {
    const char = formula[position];

    // Пробелы — пропускаем
    if (char === ' ' || char === '\t') {
      position++;

      continue;
    }

    // Числа (включая десятичные)
    if (char >= '0' && char <= '9') {
      let numberStr = '';

      while (
        position < formula.length
        && ((formula[position] >= '0' && formula[position] <= '9')
          || formula[position] === '.')
      ) {
        numberStr += formula[position];
        position++;
      }

      tokens.push({ type: 'number', value: numberStr });

      continue;
    }

    // @-переменные: @mod.str, @prof, @level
    if (char === '@') {
      let variablePath = '';
      position++; // пропускаем @

      while (
        position < formula.length
        && (isAlphaNumeric(formula[position]) || formula[position] === '.')
      ) {
        variablePath += formula[position];
        position++;
      }

      if (variablePath.length === 0) {
        throw new FormulaError(
          `Ожидалось имя переменной после @ на позиции ${position}`,
        );
      }

      tokens.push({ type: 'variable', value: variablePath });

      continue;
    }

    // Операторы
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ type: 'operator', value: char });
      position++;

      continue;
    }

    // Скобки
    if (char === '(') {
      tokens.push({ type: 'leftParen', value: '(' });
      position++;

      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'rightParen', value: ')' });
      position++;

      continue;
    }

    // Запятая (для функций)
    if (char === ',') {
      tokens.push({ type: 'comma', value: ',' });
      position++;

      continue;
    }

    // Идентификаторы (функции: min, max, floor, ceil)
    if (isAlpha(char)) {
      let identifier = '';

      while (position < formula.length && isAlphaNumeric(formula[position])) {
        identifier += formula[position];
        position++;
      }

      if (SUPPORTED_FUNCTIONS.has(identifier)) {
        tokens.push({ type: 'function', value: identifier });
      } else {
        throw new FormulaError(
          `Неизвестный идентификатор: "${identifier}". Переменные должны начинаться с @`,
        );
      }

      continue;
    }

    throw new FormulaError(
      `Неожиданный символ "${char}" на позиции ${position}`,
    );
  }

  return tokens;
}

// ── Парсер (рекурсивный спуск) ────────────────────────────────

/**
 * Парсит массив токенов в AST (абстрактное синтаксическое дерево).
 *
 * Использует Pratt parser — рекурсивный спуск с приоритетами операторов.
 *
 * @param tokens - массив токенов
 * @returns корневой узел AST
 * @throws FormulaError при синтаксической ошибке
 */
function parse(tokens: FormulaToken[]): AstNode {
  let position = 0;

  /**
   * Парсит выражение с учётом приоритета оператора.
   *
   * @param minPrecedence - минимальный приоритет для текущего уровня
   */
  function parseExpression(minPrecedence: number): AstNode {
    let left = parsePrimary();

    while (position < tokens.length) {
      const token = tokens[position];

      if (token.type !== 'operator') {
        break;
      }

      const precedence = OPERATOR_PRECEDENCE[token.value] ?? 0;

      if (precedence < minPrecedence) {
        break;
      }

      position++; // пропускаем оператор

      const right = parseExpression(precedence + 1);

      left = {
        type: 'binaryOp',
        value: token.value,
        left,
        right,
      };
    }

    return left;
  }

  /** Парсит первичное выражение (число, переменная, функция, скобки, унарный минус) */
  function parsePrimary(): AstNode {
    if (position >= tokens.length) {
      throw new FormulaError('Неожиданный конец формулы');
    }

    const token = tokens[position];

    // Числа
    if (token.type === 'number') {
      position++;

      return {
        type: 'number',
        numericValue: Number.parseFloat(token.value),
      };
    }

    // @-переменные
    if (token.type === 'variable') {
      position++;

      return {
        type: 'variable',
        value: token.value,
      };
    }

    // Функции: min(a, b), max(a, b), floor(a), ceil(a)
    if (token.type === 'function') {
      position++;

      const funcName = token.value;

      if (position >= tokens.length || tokens[position].type !== 'leftParen') {
        throw new FormulaError(`Ожидалась '(' после функции ${funcName}`);
      }

      position++; // пропускаем (

      const args: AstNode[] = [];

      // Парсим аргументы через запятую
      if (position < tokens.length && tokens[position].type !== 'rightParen') {
        args.push(parseExpression(0));

        while (position < tokens.length && tokens[position].type === 'comma') {
          position++; // пропускаем ,
          args.push(parseExpression(0));
        }
      }

      if (position >= tokens.length || tokens[position].type !== 'rightParen') {
        throw new FormulaError(
          `Ожидалась ')' после аргументов функции ${funcName}`,
        );
      }

      position++; // пропускаем )

      return {
        type: 'functionCall',
        value: funcName,
        args,
      };
    }

    // Скобки
    if (token.type === 'leftParen') {
      position++; // пропускаем (

      const expression = parseExpression(0);

      if (position >= tokens.length || tokens[position].type !== 'rightParen') {
        throw new FormulaError('Незакрытая скобка');
      }

      position++; // пропускаем )

      return expression;
    }

    // Унарный минус
    if (token.type === 'operator' && token.value === '-') {
      position++;

      const operand = parsePrimary();

      return {
        type: 'unaryOp',
        value: '-',
        right: operand,
      };
    }

    // Унарный плюс (просто пропускаем)
    if (token.type === 'operator' && token.value === '+') {
      position++;

      return parsePrimary();
    }

    throw new FormulaError(`Неожиданный токен: "${token.value}"`);
  }

  const result = parseExpression(0);

  if (position < tokens.length) {
    throw new FormulaError(`Лишний токен: "${tokens[position].value}"`);
  }

  return result;
}

// ── Evaluator ─────────────────────────────────────────────────

/**
 * Вычисляет значение AST с подстановкой @-переменных из контекста.
 *
 * @param node - узел AST
 * @param context - контекст @-переменных
 * @returns числовое значение
 * @throws FormulaError при неизвестной переменной или операции
 */
function evaluateNode(node: AstNode, context: FormulaContext): number {
  switch (node.type) {
    case 'number':
      return node.numericValue ?? 0;
    case 'variable':
      return resolveVariable(node.value ?? '', context);
    case 'binaryOp': {
      const leftVal = evaluateNode(node.left!, context);
      const rightVal = evaluateNode(node.right!, context);

      return applyBinaryOperator(node.value ?? '+', leftVal, rightVal);
    }
    case 'unaryOp':
      if (node.value === '-') {
        return -evaluateNode(node.right!, context);
      }

      return evaluateNode(node.right!, context);
    case 'functionCall':
      return evaluateFunction(
        node.value ?? '',
        (node.args ?? []).map((arg) => evaluateNode(arg, context)),
      );
    default:
      throw new FormulaError(`Неизвестный тип узла: ${node.type}`);
  }
}

/**
 * Разрешает @-переменную в числовое значение из контекста.
 *
 * Поддерживаемые пути:
 * - str → context.abilities.strength.value (короткий код значения)
 * - mod.str → context.abilities.strength.mod (mod.spell — заклинательная)
 * - prof → context.prof
 * - level → context.level
 * - target.full / target.notFull → 1/0 по состоянию цели
 *
 * @param variablePath - путь переменной (без @)
 * @param context - контекст формул
 * @returns числовое значение переменной
 * @throws FormulaError при неизвестном пути
 */
function resolveVariable(
  variablePath: string,
  context: FormulaContext,
): number {
  const parts = variablePath.split('.');

  // Простые переменные: prof, level
  if (parts.length === 1) {
    const simpleKey = parts[0];

    if (simpleKey === 'prof') {
      return context.prof;
    }

    if (simpleKey === 'level') {
      return context.level;
    }

    // Короткий код характеристики @int → значение (16), парно к @mod.int (мод)
    const fullAbility = ABILITY_ABBREVIATIONS[simpleKey];

    if (fullAbility) {
      const ability = context.abilities[fullAbility];

      if (!ability) {
        throw new FormulaError(`Неизвестная характеристика: @${simpleKey}`);
      }

      return ability.value;
    }

    throw new FormulaError(`Неизвестная переменная: @${variablePath}`);
  }

  // Короткий синтаксис: mod.str, mod.dex, ..., mod.spell
  if (parts[0] === 'mod' && parts.length === 2) {
    const target = parts[1];

    // @mod.spell — модификатор заклинательной характеристики
    if (target === 'spell') {
      if (context.spellMod === undefined) {
        throw new FormulaError(
          'Переменная @mod.spell недоступна вне контекста заклинания',
        );
      }

      return context.spellMod;
    }

    // @mod.str → strength.mod и т.д.
    const fullAbility = ABILITY_ABBREVIATIONS[target];

    if (fullAbility) {
      const ability = context.abilities[fullAbility];

      if (!ability) {
        throw new FormulaError(`Неизвестная характеристика: @mod.${target}`);
      }

      return ability.mod;
    }

    throw new FormulaError(
      `Неизвестный код характеристики: @mod.${target}. Допустимо: str, dex, con, int, wis, cha, spell`,
    );
  }

  // Условные токены цели: @target.full / @target.notFull → 1 или 0.
  // В Active Effects используются как множитель/значение; в формулах урона
  // заклинаний обрабатываются раньше (гейт на слагаемое, см. applyTargetConditionals).
  if (parts[0] === 'target' && parts.length === 2) {
    const isFull = context.target?.isFull ?? false;

    if (parts[1] === 'full') {
      return isFull ? 1 : 0;
    }

    if (parts[1] === 'notFull') {
      return isFull ? 0 : 1;
    }

    throw new FormulaError(
      `Неизвестный токен цели: @target.${parts[1]}. Допустимо: full, notFull`,
    );
  }

  throw new FormulaError(`Неизвестная переменная: @${variablePath}`);
}

/**
 * Применяет бинарный оператор к двум значениям.
 *
 * @param operator - символ оператора (+, -, *, /)
 * @param left - левый операнд
 * @param right - правый операнд
 * @returns результат операции
 */
function applyBinaryOperator(
  operator: string,
  left: number,
  right: number,
): number {
  switch (operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) {
        throw new FormulaError('Деление на ноль');
      }

      return left / right;
    default:
      throw new FormulaError(`Неизвестный оператор: ${operator}`);
  }
}

/**
 * Вычисляет встроенную функцию.
 *
 * @param funcName - имя функции
 * @param args - вычисленные аргументы
 * @returns результат функции
 */
function evaluateFunction(funcName: string, args: number[]): number {
  switch (funcName) {
    case 'min':
      if (args.length < 2) {
        throw new FormulaError('min() требует минимум 2 аргумента');
      }

      return Math.min(...args);
    case 'max':
      if (args.length < 2) {
        throw new FormulaError('max() требует минимум 2 аргумента');
      }

      return Math.max(...args);
    case 'floor':
      if (args.length !== 1) {
        throw new FormulaError('floor() требует ровно 1 аргумент');
      }

      return Math.floor(args[0]);
    case 'ceil':
      if (args.length !== 1) {
        throw new FormulaError('ceil() требует ровно 1 аргумент');
      }

      return Math.ceil(args[0]);
    case 'abs':
      if (args.length !== 1) {
        throw new FormulaError('abs() требует ровно 1 аргумент');
      }

      return Math.abs(args[0]);
    default:
      throw new FormulaError(`Неизвестная функция: ${funcName}()`);
  }
}

// ── Вспомогательные функции ───────────────────────────────────

/** Проверяет, является ли символ буквой */
function isAlpha(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_'
  );
}

/** Проверяет, является ли символ буквой или цифрой */
function isAlphaNumeric(char: string): boolean {
  return isAlpha(char) || (char >= '0' && char <= '9');
}

// ── Публичный API ─────────────────────────────────────────────

/**
 * Строит контекст формул из данных актора D&D 5e.
 *
 * Извлекает из актора все значения, доступные через @-переменные
 * в формулах Active Effects.
 *
 * @param actor - объект DnDActor
 * @returns контекст с @-переменными для парсера
 */
export function buildFormulaContext(
  actor:
    | import('./dndEntities.js').DnDActor
    | import('./dndEntities.js').Creature,
): FormulaContext {
  const abilityNames = [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
  ] as const;

  const abilities: Record<string, { value: number; mod: number }> = {};

  for (const abilityName of abilityNames) {
    const score = actor.system.abilities[abilityName] ?? 10;

    abilities[abilityName] = {
      value: score,
      mod: Math.floor((score - 10) / 2),
    };
  }

  let level = 1;
  let prof = 2;

  if (isActorEntity(actor)) {
    level = getTotalLevel(actor.system.classes);
    prof = calculateProficiencyBonus(level);
  } else if ('proficiencyBonus' in actor.system) {
    // Существо: классовых уровней нет (@level остаётся 1) — бонус мастерства
    // берётся напрямую из system.proficiencyBonus.
    const creatureProficiencyBonus = actor.system.proficiencyBonus;

    prof =
      typeof creatureProficiencyBonus === 'number'
        ? creatureProficiencyBonus
        : 2;
  }

  return {
    abilities,
    prof,
    level,
  };
}

/**
 * Вычисляет формулу с подстановкой @-переменных.
 *
 * Если строка содержит простое число (без операторов и переменных),
 * возвращает его напрямую без парсинга.
 *
 * @param formula - строка формулы (напр. "@mod.cha + 2")
 * @param context - контекст @-переменных актора
 * @returns вычисленное числовое значение
 * @throws FormulaError при невалидной формуле
 */
export function evaluateFormula(
  formula: string,
  context: FormulaContext,
): number {
  const trimmed = formula.trim();

  // Быстрый путь: простое число
  const simpleNumber = Number(trimmed);

  if (!Number.isNaN(simpleNumber) && trimmed.length > 0) {
    return simpleNumber;
  }

  const tokens = tokenize(trimmed);

  if (tokens.length === 0) {
    throw new FormulaError('Пустая формула');
  }

  const ast = parse(tokens);

  return evaluateNode(ast, context);
}

/** Регэксп для поиска @-переменных в смешанной формуле (кости + @) */
const VARIABLE_TOKEN_REGEX = /@([a-z][\w.]*)/gi;

/**
 * Подставляет числовые значения @-переменных в смешанную формулу,
 * НЕ затрагивая кубиковую нотацию (`1к4`, `2d6` и т.п.).
 *
 * Это «мост» между двумя движками: детерминированный парсер @-переменных
 * (этот модуль) и кубиковый роллер (`@ttg-club/dice-roller-parser`),
 * который НЕ понимает `@`. Вызывается перед броском там, где формула урона
 * может содержать `@mod.str`, `@mod.spell`, `@prof` и т.д.
 *
 * Пример: `"1к4+1+@mod.int"` + (int.mod = 3) → `"1к4+1+3"`.
 * Отрицательные значения оборачиваются в скобки: `"1к6+@mod.str"` (-1) → `"1к6+(-1)"`.
 *
 * @param formula - смешанная формула (кости + @-переменные)
 * @param context - контекст @-переменных актора
 * @returns формула, готовая для кубикового роллера
 * @throws FormulaError при неизвестной переменной
 */
export function substituteFormulaVariables(
  formula: string,
  context: FormulaContext,
): string {
  if (!formula.includes('@')) {
    return formula;
  }

  return formula.replace(VARIABLE_TOKEN_REGEX, (_match, rawPath: string) => {
    // Отсекаем хвостовую точку (напр. "@mod." — невалидно, но не падаем грубо)
    const path = rawPath.replace(/\.+$/, '');
    const value = resolveVariable(path, context);

    return value < 0 ? `(${value})` : String(value);
  });
}

/** Регэксп: @-переменная вместе с предшествующим соединяющим оператором (+/-) */
const VARIABLE_WITH_OPERATOR_REGEX = /\s*(?:([+\-])\s*)?@[a-z][\w.]*/gi;

/**
 * Убирает @-переменные из формулы для отображения, когда контекст актора
 * недоступен (напр. глобальный список предметов, не привязанный к персонажу).
 *
 * В отличие от {@link substituteFormulaVariables}, не подставляет значения, а
 * удаляет токены вместе с соединяющим оператором, оставляя только кубиковую
 * часть: `"8к6+@mod.spell"` → `"8к6"`. Кубиковая нотация не затрагивается.
 *
 * Если после удаления ничего не осталось (формула состояла только из
 * @-переменных), возвращается исходная строка — лучше показать токен, чем пусто.
 *
 * @param formula - смешанная формула (кости + @-переменные)
 * @returns формула без @-переменных, готовая для отображения
 */
export function stripFormulaVariables(formula: string): string {
  if (!formula.includes('@')) {
    return formula;
  }

  const stripped = formula
    .replace(VARIABLE_WITH_OPERATOR_REGEX, '')
    .replace(/^\s*[+\-]\s*/, '')
    .trim();

  return stripped.length > 0 ? stripped : formula;
}

/**
 * Валидирует формулу без вычисления.
 *
 * Проверяет синтаксис и наличие переменных,
 * НЕ проверяет конкретные значения (нет контекста).
 *
 * @param formula - строка формулы
 * @returns результат валидации с описанием ошибки
 */
export function validateFormula(formula: string): FormulaValidationResult {
  const trimmed = formula.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Формула не может быть пустой' };
  }

  // Простое число — всегда валидно
  if (!Number.isNaN(Number(trimmed))) {
    return { valid: true };
  }

  try {
    const tokens = tokenize(trimmed);

    parse(tokens);

    return { valid: true };
  } catch (parseError) {
    const errorMessage =
      parseError instanceof FormulaError
        ? parseError.message
        : 'Невалидная формула';

    return { valid: false, error: errorMessage };
  }
}

/**
 * Вычисляет бонус мастерства по уровню (D&D 5e).
 *
 * @param level - уровень персонажа (1-20)
 * @returns бонус мастерства
 */
function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// ── Подсказки для UI ──────────────────────────────────────────

/**
 * Все доступные @-переменные для формул Active Effects.
 *
 * Используется в UI автокомплита при вводе формул.
 * Каждая запись содержит ключ, локализованное описание и группу.
 */
export const FORMULA_VARIABLES: readonly FormulaVariableHint[] = [
  // Характеристики (значения) — короткий синтаксис @<код>
  {
    key: '@str',
    label: 'Сила (значение)',
    group: 'Характеристики',
  },
  {
    key: '@dex',
    label: 'Ловкость (значение)',
    group: 'Характеристики',
  },
  {
    key: '@con',
    label: 'Телосложение (значение)',
    group: 'Характеристики',
  },
  {
    key: '@int',
    label: 'Интеллект (значение)',
    group: 'Характеристики',
  },
  {
    key: '@wis',
    label: 'Мудрость (значение)',
    group: 'Характеристики',
  },
  {
    key: '@cha',
    label: 'Харизма (значение)',
    group: 'Характеристики',
  },
  // Характеристики (модификаторы) — короткий синтаксис @mod.<код>
  {
    key: '@mod.str',
    label: 'Сила (модификатор)',
    group: 'Модификаторы',
  },
  {
    key: '@mod.dex',
    label: 'Ловкость (модификатор)',
    group: 'Модификаторы',
  },
  {
    key: '@mod.con',
    label: 'Телосложение (модификатор)',
    group: 'Модификаторы',
  },
  {
    key: '@mod.int',
    label: 'Интеллект (модификатор)',
    group: 'Модификаторы',
  },
  {
    key: '@mod.wis',
    label: 'Мудрость (модификатор)',
    group: 'Модификаторы',
  },
  {
    key: '@mod.cha',
    label: 'Харизма (модификатор)',
    group: 'Модификаторы',
  },
  {
    key: '@mod.spell',
    label: 'Заклинательная характеристика (модификатор)',
    group: 'Модификаторы',
  },
  // Общие
  { key: '@prof', label: 'Бонус мастерства', group: 'Общее' },
  { key: '@level', label: 'Уровень персонажа', group: 'Общее' },
  // Условные токены цели. В формулах урона заклинаний гасят своё слагаемое
  // (голый токен, без `*`); в Active Effects резолвятся в 1/0 как множитель.
  {
    key: '@target.full',
    label: 'Цель с полным HP (1/0)',
    group: 'Цель',
  },
  {
    key: '@target.notFull',
    label: 'Цель ранена / не полное HP (1/0)',
    group: 'Цель',
  },
] as const;
