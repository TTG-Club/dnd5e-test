import type {
  BaseActor,
  BaseCreature,
  CompendiumValueFormatter,
  CustomArea,
  DiceRollData,
  GridSettings,
  HealthCondition,
  MeasurementTemplate,
  SceneEntity,
  Token,
} from '../types/index.js';
import type { BaseActiveEffect } from './contracts/activeEffect.js';
import type { ChatCardDefinition } from './contracts/cards.js';
// Результат применения урона — НЕЙТРАЛЬНЫЙ контрактный тип (форма данных); больше
// НЕ импортируется из D&D. Логика расчёта живёт в конкретной системе.
import type { DamageApplyResult } from './contracts/combat.js';
import type { ConditionDefinition } from './contracts/conditions.js';
import type { MacroDefinition } from './contracts/macros.js';
import type { RollDefinition } from './contracts/rolls.js';
import type { ActorSheetDefinition } from './contracts/sheets.js';

/**
 * Результат выполнения системного броска (например, инициативы).
 */
export interface SystemRollResult {
  /** Натуральное значение броска (без модификатора) */
  roll: number;
  /** Примененный модификатор */
  modifier: number;
  /** Итоговое значение (roll + modifier) */
  total: number;
  /** Детальные данные о выпавших кубиках (если доступно, на клиенте) */
  rollData?: DiceRollData;
}

/**
 * Контракт игровой системы.
 *
 * Система — это абстракция над правилами (D&D 5e, Pathfinder, GURPS),
 * которая предоставляет Ядру (Core VTT) необходимые расчеты без жесткой привязки к конкретным полям.
 *
 * Инстанс системы регистрируется в SystemRegistry.
 */
export interface VttSystem {
  /** Уникальный строковый идентификатор системы (например, 'dnd5e') */
  readonly id: string;
  /** Человекочитаемое название системы */
  readonly name: string;
  /** Версия системы */
  readonly version: string;

  /**
   * Возвращает численный модификатор инициативы для указанного актера.
   * Вызывается Ядром (на сервере или клиенте) при формировании списка энкаунтера.
   *
   * @param actor Универсальный объект актера (BaseActor, внутри содержит system: Record<string, unknown>)
   */
  getInitiativeModifier: (actor: BaseActor) => number;

  /**
   * Совершает бросок инициативы по правилам системы.
   *
   * @param actor Участвующий актер
   * @param rollFn Коллбэк для броска кубиков, предоставляемый Ядром (умеет парсить формулы и возвращать результаты)
   */
  rollInitiative: (
    actor: BaseActor,
    rollFn?: (formula: string) => DiceRollData,
  ) => SystemRollResult;

  // ==========================================
  //    Lifecycle (серверная часть, опционально)
  // ==========================================

  /**
   * Вызывается ядром при загрузке системы.
   * На сервере api — это ServerModuleAPI, на клиенте не вызывается.
   *
   * @param api - API ядра (typed as unknown для избежания серверных зависимостей в shared)
   */
  init?: (api: unknown) => void;

  /**
   * Вызывается ядром при остановке мира.
   * Система должна очистить свои ресурсы.
   */
  destroy?: () => void;

  /**
   * Выполняет валидацию данных актера по правилам системы.
   * Вызывается EntityManager'ом перед созданием и обновлением сущности на сервере.
   *
   * @param actor Объект актера для валидации
   */
  validateActor?: (actor: BaseActor) => void;

  /**
   * Выполняет валидацию данных существа (NPC) по правилам системы.
   * Вызывается EntityManager'ом перед созданием и обновлением существа.
   * Ядро передаёт нейтральный `BaseCreature`; конкретную форму (`DnDCreature`)
   * система восстанавливает у себя.
   *
   * @param creature Объект существа для валидации
   */
  validateCreature?: (creature: BaseCreature) => void;

  /**
   * Выполняет структурную валидацию данных предмета (`GameItem`) по правилам
   * системы. Вызывается EntityManager'ом перед созданием и обновлением предмета
   * на сервере. Бросает `Error` при нарушении. Ядро передаёт произвольные данные
   * (`unknown`) — конкретную форму система восстанавливает у себя (в D&D — через
   * Zod-схему предмета). Опционально: `undefined` — система не валидирует предметы.
   *
   * @param item Данные предмета для валидации
   */
  validateItemData?: (item: unknown) => void;

  /**
   * Возвращает шаблон нового актёра системы по умолчанию (без `id`). Ядро
   * использует его как базу при создании актёра, поверх которой накладываются
   * переданные поля. `undefined` — система не предоставляет шаблон (ядро создаёт
   * актёра только из переданных данных).
   */
  createDefaultActor?: () => Partial<BaseActor>;

  /**
   * Валидирует данные актёра по правилам системы для формы создания/редактирования
   * (обязательные поля, допустимые границы характеристик, ХП, опыта) и бросает
   * `Error` с человекочитаемым сообщением при нарушении. В отличие от
   * `validateActor` (структурная Zod-валидация на сервере) — семантические
   * проверки формы над частичными данными.
   */
  validateActorData?: (actor: Partial<BaseActor>) => void;

  /**
   * Нормализует частичные данные актёра по правилам системы (зажимает значения
   * в допустимые границы) и возвращает исправленную копию.
   */
  normalizeActorData?: (actor: Partial<BaseActor>) => Partial<BaseActor>;

  /**
   * Строит Markdown-сводку механических даров черты/предмета/предыстории для
   * таба «Автоматизация» в просмотре (владения, характеристики, языки, защиты,
   * заклинания, эффекты, предусловия). Пустая строка — даров нет (таб скрыт).
   * Форма данных системо-зависима, поэтому текст собирает система.
   */
  getFeatGrantsSummary?: (feat: unknown) => string;

  // ==========================================
  //    Боевая обработка эффектов на границе хода (серверная часть)
  // ==========================================

  /**
   * Прогоняет периодические эффекты сущности на границе хода по правилам системы
   * (в D&D 5e — DoT-урон `recurringDamage` и повторные спасброски `recurringSave`,
   * успех снимает эффект). Мутирует сущность и возвращает флаг изменения плюс
   * готовую сводку для чата (или `null`, если показывать нечего).
   *
   * Опционально: система без периодических эффектов может не реализовывать метод —
   * ядро (модуль инициативы) трактует отсутствие как «изменений нет».
   *
   * @param entity Сущность (актёр/существо), чей момент хода обрабатывается
   * @param timing Момент хода: начало или конец
   */
  runTurnEffects?: (
    entity: SceneEntity,
    timing: 'startOfTurn' | 'endOfTurn',
  ) => { changed: boolean; chatSummary: string | null };

  /**
   * Снимает точные `turn`-эффекты на границе хода участника `turnActorId`
   * (источник-якорь эффекта может висеть на чужой сущности, поэтому метод
   * вызывается для каждого участника энкаунтера). Мутирует `entity`.
   *
   * @param entity Сущность, чьи эффекты проверяются
   * @param turnActorId id участника, чей ход сейчас обрабатывается
   * @param timing Граница хода: начало или конец
   * @returns true, если эффекты сущности изменились
   */
  expireTurnEffects?: (
    entity: SceneEntity,
    turnActorId: string,
    timing: 'start' | 'end',
  ) => boolean;

  /**
   * Уменьшает длительность (в раундах) всех эффектов на сущности на 1 и снимает
   * истёкшие. Вызывается ядром на границе раунда. Мутирует `entity`.
   *
   * @param entity Сущность, чьи эффекты обновляются
   * @returns true, если сущность была модифицирована
   */
  decrementEffectDurations?: (entity: SceneEntity) => boolean;

  /**
   * Синхронизирует эффекты пользовательских зон (`CustomArea`) для сущности по
   * позиционному переходу токена: разовые enter/exit-триггеры (урон/спас/статус)
   * и реконсиляция длящихся `stay`-эффектов. Мутирует `entity`; возвращает флаг
   * изменения и готовую сводку сработавших триггеров для чата (или `null`).
   *
   * @param entity Сущность токена
   * @param previousAreaIds ID зон в предыдущей позиции токена
   * @param currentAreaIds ID зон в текущей позиции токена
   * @param areas Все зоны сцены (источник списков эффектов)
   * @param options Опции синхронизации
   * @param options.triggerOneShots Проигрывать ли разовые enter/exit (по умолч. true)
   */
  syncAreaEffects?: (
    entity: SceneEntity,
    previousAreaIds: ReadonlySet<string>,
    currentAreaIds: ReadonlySet<string>,
    areas: CustomArea[],
    options?: { triggerOneShots?: boolean },
  ) => { changed: boolean; chatSummary: string | null };

  /**
   * Обрабатывает разовые триггер-ауры (enter/exit) при перемещении токена — как
   * для перемещённого токена (вход/выход из чужих аур), так и для чужих токенов,
   * накрытых/освобождённых его аурами. Мутирует затронутые сущности; возвращает
   * по каждой затронутой сущности флаг изменения и сводку для чата.
   *
   * @param scene Сцена (токены + настройки сетки)
   * @param scene.tokens Токены сцены
   * @param scene.gridSettings Настройки сетки сцены
   * @param movedToken Токен после перемещения
   * @param movedEntity Сущность перемещённого токена
   * @param previousToken Токен до перемещения (для покинутых аур)
   * @param getEntity Резолвер сущности по actorId (живые ссылки из стейта)
   */
  applyAuraTriggerEffects?: (
    scene: { tokens?: Token[]; gridSettings?: GridSettings },
    movedToken: Token,
    movedEntity: SceneEntity,
    previousToken: Token | undefined,
    getEntity: (actorId: string) => SceneEntity | undefined,
  ) => Array<{
    entity: SceneEntity;
    changed: boolean;
    chatSummary: string | null;
  }>;

  // ==========================================
  //    Геометрия AoE и броски (системо-зависимо)
  // ==========================================

  /**
   * Проверяет, попадает ли точка в область шаблона измерения (AoE) по правилам
   * геометрии системы (в D&D 5e — круг/конус/куб/линия с 5e-геометрией конуса).
   * Используется ядром для хиттеста токенов под шаблоном заклинания.
   */
  isPointInTemplate?: (
    pointX: number,
    pointY: number,
    gridSize: number,
    template: MeasurementTemplate,
  ) => boolean;

  /**
   * Минимальный (серверный) бросок кубиковой формулы урона системы — сумма и
   * выпавшие значения. В D&D — парсер нотации `NкM`/`NдM`/`NdM` + плоские числа.
   */
  rollDamageFormula?: (formula: string) => { total: number; values: number[] };

  // ==========================================
  //    Ауры токенов (системо-зависимо)
  // ==========================================

  /**
   * Собирает все аура-эффекты сущности из всех источников (эффекты на самой
   * сущности + эффекты с экипированных предметов). Используется клиентом для
   * пересчёта внешних (ambient) аур и отрисовки радиусов на сцене.
   *
   * Опционально: система без аур может не реализовывать метод — ядро трактует
   * отсутствие как «аур нет».
   */
  collectAuraEffects?: (entity: SceneEntity) => BaseActiveEffect[];

  /**
   * Вычисляет внешние (ambient) аура-эффекты, накрывающие целевой токен от
   * токенов-источников в данный момент (хиттест по геометрии системы + фильтр
   * по отношению allies/enemies). Разовые enter/exit-ауры не транслируются.
   */
  calculateAmbientAuras?: (
    targetToken: Token,
    sources: Array<{ token: Token; effects: BaseActiveEffect[] }>,
    gridSettings: GridSettings,
  ) => BaseActiveEffect[];

  // ==========================================
  //    Боевое применение к цели (системо-зависимо)
  // ==========================================

  /**
   * Применяет урон/лечение к сущности (мутирует её ХП) по правилам системы —
   * защиты от урона, временные ХП — и возвращает сводку изменения для UI/чата.
   * Ядро (нейтральный `targetStore`) передаёт глубокую копию цели и после вызова
   * рассылает обновление по WS.
   */
  applyDamageToEntity?: (
    entity: SceneEntity,
    amount: number,
    isHealing: boolean,
    damageType?: string,
  ) => DamageApplyResult;

  /**
   * Накладывает эффекты на сущность по правилам системы (иммунитеты к состояниям,
   * сборка condition-эффектов, слияние без дублей) и возвращает обновлённый список
   * `activeEffects` для записи в сущность. Отключённые эффекты фильтрует вызывающий.
   */
  applyEffectsToEntity?: (
    entity: SceneEntity,
    effects: BaseActiveEffect[],
    origin: string,
  ) => BaseActiveEffect[];

  /**
   * Возвращает итоговый класс доспеха (КД) сущности с учётом активных эффектов и
   * опционального контекста входящей атаки (условные бонусы к КД). `attackContext`
   * системо-зависим (тип `unknown` в нейтральном контракте).
   */
  getEntityArmorClass?: (
    entity: SceneEntity,
    attackContext?: unknown,
  ) => number;

  /**
   * Возвращает набор активных боевых флагов сущности (производных от эффектов) —
   * используется механикой попаданий/спасбросков.
   */
  getEntityActiveFlags?: (entity: SceneEntity) => ReadonlySet<string>;

  // ==========================================
  //    Перемещение (системо-зависимо)
  // ==========================================

  /**
   * Возвращает суммарную скорость перемещения сущности по всем режимам
   * (ходьба/полёт/плавание/лазание/копание) с учётом активных эффектов.
   * Ядро использует значение только как гейт «может ли токен двигаться»
   * (0 и меньше — перемещение заблокировано эффектами).
   *
   * Опционально: `undefined` (метод не реализован) означает, что система не
   * моделирует скорость — ядро не блокирует перемещение.
   */
  getTotalMovementSpeed?: (entity: SceneEntity) => number;

  // ==========================================
  //    Регистрация расширений (Фаза 4)
  // ==========================================

  /**
   * Возвращает определения листов персонажей, предоставляемых системой.
   * Ядро вызывает этот метод при инициализации для заполнения actorSheetRegistry.
   */
  getActorSheets?: () => ActorSheetDefinition[];

  /**
   * Возвращает определения карточек чата, предоставляемых системой.
   * Ядро вызывает этот метод при инициализации для заполнения chatCardRegistry.
   */
  getChatCards?: () => ChatCardDefinition[];

  /**
   * Возвращает определения типов бросков, предоставляемых системой.
   * Ядро вызывает этот метод при инициализации для заполнения rollRegistry.
   */
  getRolls?: () => RollDefinition[];

  /**
   * Возвращает определения состояний (conditions), предоставляемых системой.
   * Используется модулями для отображения списка доступных состояний.
   */
  getConditions?: () => ConditionDefinition[];

  /**
   * Возвращает определения макросов, предоставляемых системой.
   * Используется панелью макросов для отображения доступных быстрых действий.
   */
  getMacros?: () => MacroDefinition[];

  /**
   * Вычисляет итоговые характеристики актера с учетом активных эффектов.
   */
  resolveActorStats?: (
    actor: BaseActor,
    effects?: readonly unknown[],
  ) => Record<string, unknown>;

  /**
   * Собирает все активные эффекты, привязанные к актеру.
   */
  collectActiveEffects?: (actor: BaseActor) => readonly unknown[];

  /**
   * Нормализует ПОЛНОГО актёра на месте при загрузке из хранилища (миграция
   * старого формата, коэрция формы `system`). Вызывается серверным загрузчиком
   * (`worldDataManager` через активную систему). В отличие от
   * `normalizeActorData` (частичные данные формы) — мутирует уже собранного
   * актёра. `undefined` — система не требует нормализации при загрузке.
   */
  normalizeActor?: (actor: BaseActor) => void;

  /**
   * Выполняет нормализацию данных существа.
   */
  normalizeCreature?: (creature: any) => void;

  /**
   * Возвращает список доступных классов в системе для компендиума.
   */
  getClassKeyOptions?: () => Array<{ value: string; label: string }>;

  /**
   * Возвращает форматтер значений компендиума для указанного формата
   * (`spellLevel`/`challengeRating`/`creatureType`/`spellClass`) — управляет
   * подписью и сортировкой опций фильтра и заголовков разделов. Для
   * неизвестного формата возвращает `undefined` (значение трактуется как
   * строка «как есть»), что позволяет любому компендиуму фильтровать по
   * произвольному полю без поддержки в системе.
   */
  getCompendiumValueFormatter?: (
    format: string,
  ) => CompendiumValueFormatter | undefined;

  /**
   * Возвращает предикат для производного булева фильтра-переключателя
   * (напр. 'spellHealing' — лечит ли заклинание), который нельзя выразить
   * одним полем сущности. `undefined` — предикат неизвестен.
   */
  getCompendiumPredicate?: (
    key: string,
  ) => ((entry: unknown) => boolean) | undefined;

  /**
   * Проверяет, активно ли конкретное состояние у актора.
   */
  isConditionActive?: (
    activeEffects: readonly unknown[],
    conditionKey: string,
  ) => boolean;

  /**
   * Переключает (добавляет/удаляет) состояние в списке эффектов актора.
   */
  toggleCondition?: (
    activeEffects: readonly unknown[],
    conditionKey: string,
    generateIdFn: (prefix: string) => string,
  ) => unknown[];

  /**
   * Определяет состояние здоровья по текущим и максимальным ХП по правилам системы.
   */
  getHealthCondition?: (
    currentHp: number,
    maxHp: number,
    isActor?: boolean,
    customConditions?: unknown[],
  ) =>
    | { key: string; nameEn: string; nameRu: string; color: string }
    | undefined;

  /**
   * Возвращает таблицу состояний здоровья системы по умолчанию (пороги %ХП →
   * подпись/цвет). Используется ядром как fallback, когда для мира не заданы
   * кастомные условия. `undefined` — система не моделирует состояния здоровья.
   */
  getDefaultHealthConditions?: () => readonly HealthCondition[];

  // ==========================================
  //    Презентация для HUD/списков ядра (системо-зависимо)
  // ==========================================

  /**
   * Возвращает краткую сводку актёра для HUD выбранного токена (панель над
   * сценой): очки здоровья (текущие/макс/временные). Ядро рисует полоску и цвета
   * обобщённо, НЕ зная имён полей системы. `undefined` — система не моделирует ХП
   * для HUD (ядро показывает нули).
   *
   * @param actor Актёр (нейтральный `BaseActor`; форму система восстанавливает у себя)
   */
  getActorHudSummary?: (
    actor: BaseActor,
  ) => { hp: { current: number; max: number; temp: number } } | undefined;

  /**
   * Возвращает краткую подпись-бейдж существа для списков ядра (панель существ):
   * в D&D — показатель опасности «ПО X». Форма данных системо-зависима, поэтому
   * текст собирает система. `undefined`/пусто — бейджа нет.
   *
   * @param creature Существо (нейтральный `BaseCreature`)
   */
  getEntityListBadge?: (creature: BaseCreature) => string | undefined;
}
