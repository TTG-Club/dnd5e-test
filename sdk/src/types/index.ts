import type { BaseActiveEffect } from '../system/contracts/activeEffect.js';
// Импортируем из base.ts для локального использования в D&D-зависимых типах
import type {
  ChatMessage,
  CompendiumSeparator,
  CursorPosition,
  CustomAreaShape,
  Drawing,
  EncounterState,
  FogBrushPoint,
  GameItemType,
  ItemRarity,
  LightSource,
  MeasurementTemplate,
  Note,
  OnlineUserData,
  Playlist,
  SceneAsset,
  SceneEntityType,
  ServerUser,
  Token,
  TokenSettings,
  TransitionArea,
  UserSettings,
  WorldMetadata,
} from './base.js';

// Реэкспортируем все независимые базовые типы
export * from './assets.js';
export * from './base.js';
export * from './module.js';
/** Пользовательская область на сцене (произвольный полигон) */
export interface CustomArea {
  id: string;
  shape: CustomAreaShape;
  /** Вершины полигона */
  points: { x: number; y: number }[];
  /** Цвет заливки (hex строка, напр. '#ef4444') */
  color: string;
  /** Прозрачность заливки (0–1, по умолчанию 0.3) */
  opacity: number;
  /** Отображать поверх токенов */
  aboveTokens: boolean;
  /** Блокирует ли область зрение (работает как стена для FoW) */
  blocksVision: boolean;
  /** Блокирует ли область свет (работает как стена для освещения) */
  blocksLight: boolean;
  /** ID автора */
  createdBy: string;
  /** Активные эффекты, применяемые к токенам внутри области */
  effects?: BaseActiveEffect[];
  /** Скрыть визуальное отображение от игроков (видна только админу) */
  hiddenFromPlayers?: boolean;
  /** Скрыта ли область в трансляционной рамке ГМа (на сцене у ГМа видна). */
  hideFromBroadcast?: boolean;
}
export interface Scene {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundImage: string;
  backgroundAudio?: string; // Путь к аудио файлу для фона
  playlistId?: string; // ID плейлиста для автозапуска
  gridSettings: import('./base.js').GridSettings;
  tokens: Token[];
  drawings: Drawing[];
  assets?: SceneAsset[];
  visibility: 'hidden' | 'visible' | 'navigable'; // Видимость сцены для игроков
  forceView: boolean; // Принудительное перемещение всех игроков на сцену
  lightSources?: LightSource[]; // Источники света на сцене
  // Настройки зрения и Fog of War
  visionSettings?: {
    playerVisionEnabled: boolean; // Режим "Player Vision" для GM (видит как игроки)
    fogOfWarEnabled: boolean; // Включен ли Fog of War
  };
  // Нарисованный туман войны (кисть)
  fogBrushPoints?: FogBrushPoint[];
  // Настройки освещения (продвинутая архитектура)
  lightingSettings?: {
    darknessLevel: number; // Уровень темноты (0 = день, 1 = полная темнота)
    darknessLevelLock: boolean; // Блокировка изменения уровня темноты
    globalIllumination: {
      enabled: boolean; // Включено ли глобальное освещение
      threshold: number; // Порог темноты, при котором отключается глобальное освещение (0-1)
    };
    lightControlsVisible: boolean; // Видимость иконок источников света для админа
  };
  // Области переходов (порталы)
  transitionAreas?: TransitionArea[];
  // AoE-шаблоны измерений (конус, круг, луч)
  measurementTemplates?: MeasurementTemplate[];
  // Пользовательские области (полигоны, круги)
  customAreas?: CustomArea[];
}
/**
 * Нейтральная база предмета — ядро и персистентность знают только эти
 * системо-агностичные поля (структурная идентичность + обобщённый инвентарь +
 * провенанс). Зеркало `BaseActor`/`BaseCreature`. Системо-специфичную форму
 * (D&D-механика оружия/брони/заклинаний и т.д.) добавляет наследник конкретной
 * системы (`DnDGameItem`); прочие системы кладут свою форму в `systemData`.
 */
export interface BaseGameItem {
  /** Уникальный идентификатор */
  id: string;
  /** Название предмета */
  name: string;
  /** Английское название (опционально) */
  nameEn?: string;
  /** Описание предмета */
  description: string;
  /** Путь к изображению */
  image?: string;
  /** Тип предмета */
  type: GameItemType;
  /** Отображаемое название типа/категории предмета (напр. «Оружие», «Черты») */
  typeLabel?: string;
  /** Количество */
  quantity: number;
  /** Вес (в фунтах) */
  weight: number;
  /** Стоимость (напр. "15 зм" или { value: 15, currency: 'gp' } в SRD) */
  cost: string | { value: number; currency?: string };
  /** Редкость */
  rarity: ItemRarity;
  /** Экипирован ли предмет */
  equipped: boolean;
  /**
   * Источник записи — ключ из справочника `sources.json` (`'phb'`, `'dmg'`,
   * для своего контента `'hb'`). По нему UI берёт подпись (`useSourceLabel`).
   * Это «поле источника».
   */
  sourceKey?: string;
  /** Принадлежит ли предмет к System Reference Document (SRD) */
  isSRD?: boolean;
  /** Read-only в компедиуме, editable в предметах/актёре */
  isReadOnly: boolean;
  /**
   * Активные эффекты предмета (переносятся на актора при equipped + transfer).
   * Кросс-катный VTT-концепт (как у `BaseActor`); детальную форму
   * (`ActiveEffect`) определяет игровая система.
   */
  activeEffects?: BaseActiveEffect[];
  /**
   * Системо-специфичные данные предмета для НЕ-D&D систем (Pathfinder, D&D 2014
   * и т.д.). Ядро персистентности хранит это как непрозрачный JSON-блоб в колонке
   * `system_data` рядом с обобщёнными колонками (`id`/`name`/`type`/`quantity`/
   * `weight`/`cost`/`rarity`/`equipped`), не интерпретируя содержимое. Позволяет
   * другой системе сохранять свою форму предмета БЕЗ добавления D&D-колонок в
   * схему. Для dnd5e не используется — D&D-поля живут в выделенных колонках.
   */
  systemData?: Record<string, unknown>;
}
/**
 * Элемент компендиума в НЕЙТРАЛЬНОЙ форме — предмет (`BaseGameItem`) или
 * разделитель секции. Ядро (транспорт/кэш компендиума на клиенте и сервере)
 * знает только эту форму и НЕ читает D&D-поля. D&D-форму (`DnDGameItem`-элементы,
 * чтение level/damageParts/spellData в UI компендиума) даёт одноимённый тип на
 * субпути `@vtt/shared/system/dnd.js`, куда система сужает при отображении.
 */
export type CompendiumEntry = BaseGameItem | CompendiumSeparator;
/**
 * Базовый актор — ядро знает только эти нейтральные поля.
 * Поле `system` — «чёрный ящик»: содержимое определяется игровой системой.
 * Живёт здесь (а не в base.ts), т.к. `activeEffects` ссылается на `ActiveEffect`.
 */
export interface BaseActor {
  id: string;
  /** Дискриминатор типа сущности — позволяет автоматически определять тип */
  entityType: SceneEntityType;
  /** ID владельца (пользователя) */
  ownerId?: string;
  /** Виден ли всем */
  isPublic?: boolean;
  /** Автоматически кидать спасброски при AoE-заклинаниях (по умолчанию false) */
  autoSaves?: boolean;
  name: string;
  description?: string;
  /** Аватар персонажа */
  avatar?: string;
  /** Настройки токена */
  token?: TokenSettings;
  /**
   * Активные эффекты (временные модификаторы) — кросс-катный VTT-концепт.
   * Ядро/сцена читают их для зрения, аур, состояний; детальную форму
   * (`ActiveEffect`) определяет игровая система.
   */
  activeEffects?: BaseActiveEffect[];
  /** Системные данные — определяются игровой системой (D&D, Pathfinder, etc.) */
  system: Record<string, unknown>;
}
/**
 * Базовое существо (NPC) — ядро знает только эти нейтральные поля
 * (зеркало `BaseActor`). Системо-специфичные корневые коллекции живут в
 * наследнике конкретной системы (`DnDCreature`).
 */
export interface BaseCreature {
  id: string;
  /** Дискриминатор типа сущности */
  entityType: 'creature';
  /** ID владельца (пользователя), которому ГМ передал существо под контроль */
  ownerId?: string;
  /** Виден ли всем (игроки видят, но не управляют, если не владельцы) */
  isPublic?: boolean;
  /**
   * Экземпляр существа, поставленный токеном на стол (Shift-перетаскивание) —
   * независимая копия, скрытая из списка бестиария.
   */
  isInstance?: boolean;
  /** Автоматически кидать спасброски при AoE (по умолчанию true для NPC) */
  autoSaves?: boolean;
  name: string;
  /** Английское название */
  nameEn?: string;
  description?: string;
  /** Заголовок (напр. «Средняя нежить, нейтральная злая») */
  header?: string;
  /** Настройки токена */
  token?: TokenSettings;
  /** Активные эффекты (временные модификаторы) — кросс-катный VTT-концепт */
  activeEffects?: BaseActiveEffect[];
  /** Системные данные — определяются игровой системой */
  system: Record<string, unknown>;
}
/**
 * Сущность сцены — нейтральная пара (Актёр | Существо) в терминах базовых
 * типов. Ядро и контракт `VttSystem` знают ТОЛЬКО эту форму (без D&D-полей);
 * системо-специфичную форму даёт `DnDSceneEntity`.
 */
export type SceneEntity = BaseActor | BaseCreature;
/**
 * Определяет тип сущности на сцене по дискриминаторному полю `entityType`.
 * Поле обязательное: проставляется в `normalizeActor`/`normalizeCreature`
 * при загрузке и в `EntityManager` при создании/обновлении.
 *
 * При добавлении нового типа сущности:
 * 1. Расширить `SceneEntityType` union
 * 2. Добавить конфиг в `SCENE_ENTITY_CONFIG`
 *
 * @param entity - сущность сцены
 * @returns тип сущности
 */
export function resolveEntityType(entity: SceneEntity): SceneEntityType {
  return entity.entityType;
}
/**
 * Type-guard: является ли сущность сцены актёром.
 *
 * @param entity - сущность сцены
 * @returns true если entity является Actor
 */
export function isActorEntity(entity: SceneEntity): entity is BaseActor {
  return resolveEntityType(entity) === 'actor';
}
/**
 * Type-guard: является ли сущность сцены существом (Creature).
 *
 * @param entity - сущность сцены
 * @returns true если entity является Creature
 */
export function isCreatureEntity(entity: SceneEntity): entity is BaseCreature {
  return resolveEntityType(entity) === 'creature';
}
/**
 * Полный рантайм-объект мира.
 * Собирается при загрузке из world.db + scenes.db + creatures/ + actors/.
 */
export interface World extends WorldMetadata {
  isRunning: boolean;
  scenes: Scene[];
  // Ядро знает мир в НЕЙТРАЛЬНОЙ форме: сущности — базовые (`system` — чёрный ящик).
  // D&D-форму (`DnDActor`/`DnDCreature`) восстанавливает конкретная система у себя.
  creatures: BaseCreature[];
  actors: BaseActor[];
  isMissing?: boolean;
}
export interface SocketServerToClientEvents {
  'users:list': (users: OnlineUserData[]) => void;
  'user:connected': (user: OnlineUserData) => void;
  'user:disconnected': (userId: string) => void;
  /** Сервер отверг user:register (токен недействителен или истёк) */
  'auth:register-rejected': () => void;
  'scene:created': (scene: Scene) => void;
  'scene:updated': (scene: Scene) => void;
  /** Ре-синк сцены при входе — восстанавливает пропущенные scene-scoped события. */
  'scene:resync': (scene: Scene) => void;
  'scene:deleted': (sceneId: string) => void;
  // События для мульти-сценовой системы
  'scene:force-view': (sceneId: string) => void;
  'scene:navigable-changed': (sceneId: string, isNavigable: boolean) => void;
  'scene:clearAllFogOfWar': (sceneId: string) => void;
  'scene:clearActorFogOfWar': (sceneId: string, actorId: string) => void;
  'fog:brush-stroke-added': (sceneId: string, point: FogBrushPoint) => void;
  /** Лёгкое событие очистки brush-точек — заменяет тяжёлый scene:updated */
  'fog:brush-cleared': (sceneId: string) => void;
  'player:location-changed': (
    playerId: string,
    sceneId: string | null,
    username: string,
  ) => void;
  'creature:created': (creature: BaseCreature) => void;
  'creature:updated': (creature: BaseCreature) => void;
  'creature:deleted': (creatureId: string) => void;
  'actor:created': (actor: BaseActor) => void;
  'actor:updated': (actor: BaseActor) => void;
  'actor:deleted': (actorId: string) => void;
  'actor:effects-changed': (
    actorId: string,
    effects: BaseActiveEffect[] | undefined,
  ) => void;
  'token:created': (sceneId: string, token: Token) => void;
  'token:updated': (sceneId: string, token: Token) => void;
  'token:deleted': (sceneId: string, tokenId: string) => void;
  'asset:created': (sceneId: string, asset: SceneAsset) => void;
  'asset:updated': (sceneId: string, asset: SceneAsset) => void;
  'asset:deleted': (sceneId: string, assetId: string) => void;
  'drawing:created': (sceneId: string, drawing: Drawing) => void;
  'drawing:updated': (sceneId: string, drawing: Drawing) => void;
  'drawing:deleted': (sceneId: string, drawingId: string) => void;
  'drawings:batch-deleted': (sceneId: string, drawingIds: string[]) => void;
  'drawing:clear': (sceneId: string) => void;
  'walls:clear': (sceneId: string) => void;
  'lighting:changed': (sceneId: string, mode: 'day' | 'night') => void;
  'light-source:created': (sceneId: string, lightSource: LightSource) => void;
  'light-source:updated': (sceneId: string, lightSource: LightSource) => void;
  'light-source:deleted': (sceneId: string, lightSourceId: string) => void;
  'world:updated': (world: World) => void;
  'fog:updated': (data: {
    sceneId: string;
    actorId: string;
    points?: Array<{ x: number; y: number; radius: number }>;
  }) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'chat:cleared': () => void;
  // Transition areas
  'transition:created': (sceneId: string, area: TransitionArea) => void;
  'transition:updated': (sceneId: string, area: TransitionArea) => void;
  'transition:deleted': (sceneId: string, areaId: string) => void;
  // Custom areas
  'custom-area:created': (sceneId: string, area: CustomArea) => void;
  'custom-area:updated': (sceneId: string, area: CustomArea) => void;
  'custom-area:deleted': (sceneId: string, areaId: string) => void;
  'transition:teleport-result': (data: {
    success: boolean;
    tokenId: string;
    targetSceneId: string;
    targetX: number;
    targetY: number;
    error?: string;
    initiatedBy?: string;
  }) => void;
  // Token selection (серверное сохранение выделения)
  'token:selected': (tokenId: string | null) => void;
  // Measurement templates (AoE шаблоны)
  'template:created': (sceneId: string, template: MeasurementTemplate) => void;
  'template:updated': (sceneId: string, template: MeasurementTemplate) => void;
  'template:deleted': (sceneId: string, templateId: string) => void;
  'template:cleared': (sceneId: string) => void;
  // Плейлисты
  'playlist:created': (playlist: Playlist) => void;
  'playlist:updated': (playlist: Playlist) => void;
  'playlist:deleted': (playlistId: string) => void;
  // Курсоры игроков
  'cursor:update': (cursor: CursorPosition) => void;
  'cursor:remove': (userId: string) => void;
  'cursor:ping': (cursor: CursorPosition) => void;
  'cursor:gm-ping': (cursor: CursorPosition) => void;
  // Настройки пользователя
  'user:settings': (settings: UserSettings) => void;
  // Управление пользователями (ответ админу)
  'admin:manage-users-result': (data: {
    success: boolean;
    restarting: boolean;
    error?: string;
  }) => void;
  // Журнал
  'journal:created': (note: Note) => void;
  'journal:updated': (note: Note) => void;
  'journal:deleted': (noteId: string) => void;
  'journal:list': (notes: Note[]) => void;
  // Initiative / Encounter
  'initiative:state': (
    encounters: EncounterState[],
    activeEncounterId: string | null,
  ) => void;
  // Game pause
  /** Уведомление всем клиентам об изменении состояния паузы */
  'game:paused': (isPaused: boolean) => void;
}
/** Fog of War data payload for socket events */
export interface FogSavePayload {
  version: number;
  width: number;
  height: number;
  points: {
    x: number;
    y: number;
    radius: number;
    polygon?: number[];
  }[];
}
/** Response from fog:load socket event */
export interface FogLoadResponse {
  fogData: FogSavePayload | null;
}
/** Response from fog:load-scene socket event */
export interface FogLoadSceneResponse {
  allFogData: Record<string, FogSavePayload>;
}
export interface SocketClientToServerEvents {
  /** Ping-замер. Сервер возвращает своё текущее время (мс) для синхронизации часов. */
  'ping': (callback: (serverTime: number) => void) => void;
  /**
   * Регистрация WS-сессии по токену из `/api/login` (не голый userId).
   * Актуальная сигнатура — в `wsEvents.ts` (`ClientToServerEvents`).
   */
  'user:register': (sessionToken: string) => void;
  'world:updated': (world: World) => void;
  'scene:created': (scene: Scene) => void;
  'scene:updated': (scene: Scene) => void;
  'scene:updateFogOfWar': (
    sceneId: string,
    actorId: string,
    exploredData: string,
  ) => void;
  'scene:clearAllFogOfWar': (sceneId: string) => void;
  'scene:clearActorFogOfWar': (sceneId: string, actorId: string) => void;
  'scene:deleted': (sceneId: string) => void;
  // Новые события для текстурной системы тумана войны
  'fog:save': (data: {
    sceneId: string;
    actorId: string;
    fogData: FogSavePayload;
  }) => void;
  'fog:append': (
    data: {
      sceneId: string;
      actorId: string;
      deltaPoints: Array<{
        x: number;
        y: number;
        radius: number;
        polygon?: number[];
      }>;
    },
    callback: (response: { success: boolean }) => void,
  ) => void;
  'fog:load': (
    data: { sceneId: string; actorId: string },
    callback: (response: FogLoadResponse) => void,
  ) => void;
  'fog:load-scene': (
    sceneId: string,
    callback: (response: FogLoadSceneResponse) => void,
  ) => void;
  'fog:updated': (data: {
    sceneId: string;
    actorId: string;
    points?: Array<{ x: number; y: number; radius: number }>;
  }) => void;
  'fog:brush-stroke': (
    sceneId: string,
    point: FogBrushPoint,
    callback: (response: { ok: boolean }) => void,
  ) => void;
  'fog:brush-points-erased': (sceneId: string, pointIds: string[]) => void;
  'fog:clear-brush': (sceneId: string) => void;
  // События для мульти-сценовой системы
  'player:change-scene': (sceneId: string | null) => void;
  'gm:summon-all': (sceneId?: string) => void;
  'gm:toggle-navigable': (sceneId: string) => void;
  'creature:created': (creature: BaseCreature) => void;
  'creature:updated': (creature: BaseCreature) => void;
  'creature:deleted': (creatureId: string) => void;
  'actor:created': (actor: BaseActor) => void;
  'actor:updated': (actor: BaseActor) => void;
  'actor:deleted': (actorId: string) => void;
  'token:created': (sceneId: string, token: Token) => void;
  'token:updated': (sceneId: string, token: Token) => void;
  'token:deleted': (sceneId: string, tokenId: string) => void;
  'asset:created': (sceneId: string, asset: SceneAsset) => void;
  'asset:updated': (sceneId: string, asset: SceneAsset) => void;
  'asset:deleted': (sceneId: string, assetId: string) => void;
  'drawing:created': (sceneId: string, drawing: Drawing) => void;
  'drawing:updated': (sceneId: string, drawing: Drawing) => void;
  'drawing:deleted': (sceneId: string, drawingId: string) => void;
  'drawings:batch-deleted': (sceneId: string, drawingIds: string[]) => void;
  'drawing:clear': (sceneId: string) => void;
  'walls:clear': (sceneId: string) => void;
  'lighting:changed': (sceneId: string, mode: 'day' | 'night') => void;
  'light-source:created': (sceneId: string, lightSource: LightSource) => void;
  'light-source:updated': (sceneId: string, lightSource: LightSource) => void;
  'light-source:deleted': (sceneId: string, lightSourceId: string) => void;
  'chat:send': (
    worldId: string,
    message: Omit<ChatMessage, 'id' | 'timestamp'>,
  ) => void;
  'chat:request-history': (worldId: string) => void;
  'chat:clear': (worldId: string) => void;
  // Transition areas
  'transition:create': (
    sceneId: string,
    area: Omit<TransitionArea, 'id' | 'sceneId'>,
  ) => void;
  'transition:update': (sceneId: string, area: TransitionArea) => void;
  'transition:delete': (sceneId: string, areaId: string) => void;
  // Custom areas
  'custom-area:create': (
    sceneId: string,
    areaData: Omit<CustomArea, 'id'>,
  ) => void;
  'custom-area:update': (
    sceneId: string,
    areaId: string,
    updates: Partial<
      Pick<
        CustomArea,
        | 'color'
        | 'points'
        | 'opacity'
        | 'aboveTokens'
        | 'blocksVision'
        | 'blocksLight'
        | 'effects'
      >
    >,
  ) => void;
  'custom-area:delete': (sceneId: string, areaId: string) => void;
  'transition:teleport': (
    sceneId: string,
    areaId: string,
    tokenId: string,
  ) => void;
  // Token selection (серверное сохранение выделения)
  'token:select': (sceneId: string, tokenId: string | null) => void;
  'token:get-selection': (
    sceneId: string,
    userId: string,
    callback: (tokenId: string | null) => void,
  ) => void;
  // Measurement templates (AoE шаблоны)
  'template:create': (sceneId: string, template: MeasurementTemplate) => void;
  'template:update': (sceneId: string, template: MeasurementTemplate) => void;
  'template:delete': (sceneId: string, templateId: string) => void;
  'template:clear': (sceneId: string) => void;
  // Плейлисты
  'playlist:create': (
    playlist: Omit<Playlist, 'isPlaying' | 'currentTrackIndex'>,
  ) => void;
  'playlist:update': (
    playlist: Omit<Playlist, 'isPlaying' | 'currentTrackIndex'>,
  ) => void;
  'playlist:delete': (playlistId: string) => void;
  // Курсоры игроков
  'cursor:move': (sceneId: string, x: number, y: number) => void;
  'cursor:hide': () => void;
  'cursor:ping': (sceneId: string, x: number, y: number) => void;
  'cursor:gm-ping': (sceneId: string, x: number, y: number) => void;
  // Настройки пользователя
  'user:update-settings': (settings: Partial<UserSettings>) => void;
  // Управление пользователями (только для админа)
  'admin:manage-users': (
    users: ServerUser[],
    callback: (result: { success: boolean; error?: string }) => void,
  ) => void;
  // Журнал
  'journal:create': (
    worldId: string,
    noteData: Omit<
      Note,
      'id' | 'authorId' | 'authorName' | 'createdAt' | 'updatedAt'
    >,
  ) => void;
  'journal:update': (
    worldId: string,
    noteData: Pick<Note, 'id' | 'title' | 'content' | 'images' | 'isHidden'>,
  ) => void;
  'journal:delete': (worldId: string, noteId: string) => void;
  'journal:request-list': (worldId: string) => void;
  // Initiative / Encounter
  'initiative:start-encounter': () => void;
  'initiative:add-entries': (actorIds: string[]) => void;
  'initiative:roll': (actorId: string, roll: number, modifier: number) => void;
  'initiative:next-turn': () => void;
  'initiative:prev-turn': () => void;
  'initiative:end-encounter': () => void;
  'initiative:remove-entry': (actorId: string) => void;
  'initiative:set-manual': (actorId: string, total: number) => void;
  'initiative:select-encounter': (encounterId: string) => void;
  'initiative:delete-encounter': (encounterId: string) => void;
  'initiative:request-state': () => void;
  // Game pause
  /** Запрос на переключение состояния паузы (только для пользователей с правом TOGGLE_PAUSE) */
  'game:toggle-pause': () => void;
}
