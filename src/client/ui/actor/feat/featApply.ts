/**
 * Применение черты к актору и откат при удалении.
 *
 * Когда черту перетаскивают на лист персонажа, она должна не просто появиться в
 * списке, а реально «заработать»: выдать заклинания, перенести активные эффекты,
 * добавить владения/языки, повесить защиты и повышение характеристик. Эти
 * функции собирают соответствующие обновления актора (по образцу
 * `useSpeciesWizard.buildUpdates`) и умеют их откатывать по провенансу.
 */

import type { Feature, TypedWebSocketClient } from '@vtt/shared';
import type {
  ActiveEffect,
  Actor,
  FeatData,
  ResolvedGrantedSpell,
  Spell,
} from '@vtt/shared/system/dnd.js';

import { pushUnique, removeItems } from '@vtt/shared';
import {
  appendGrantedSpells,
  buildFeatGrantEffect,
  collectFeatGrantedSpellSources,
  isFeatOwnedEffect,
  prepareTransferredFeatEffects,
  removeGrantedSpellsByFeatureNames,
} from '@vtt/shared/system/dnd.js';

import { loadCompendiumKind } from '@/core/compendiumDataClient';
import { generateEntityId } from '@/core/entityUtils';
import { extractSpellEntries } from '@/systems/dnd5e/composables/spellCompendium';

/** Владения актора (структурно — то, что черта правит). */
type ActorProficiencies = Actor['system']['proficiencies'];

/**
 * Особенность-черта, несущая дары для применения/отката. Базовый `Feature`
 * (`@vtt/shared`) намеренно не знает о `system/dnd` (иначе циклическая
 * зависимость), поэтому несомые чертой `featData`/`activeEffects` добавляются
 * здесь, на стороне клиента. Эти поля переживают сериализацию актора
 * (`normalizeActor` не трогает `features`).
 */
export interface AppliedFeatFeature extends Feature {
  featData?: FeatData;
  activeEffects?: ActiveEffect[];
}

/** Обновления актора, получаемые при применении/откате черты. */
export interface FeatApplyResult {
  features: Feature[];
  spells: Spell[];
  activeEffects: ActiveEffect[];
  proficiencies: ActorProficiencies;
  /**
   * Обновлённые настройки токена (поднятое тёмное зрение). Задаётся только если
   * черта повысила тёмное зрение — иначе `undefined` (токен не трогаем, чтобы не
   * затереть его при отсутствии изменений).
   */
  token?: Actor['token'];
}

/**
 * Глубокая копия владений (чтобы не мутировать исходный объект актора).
 *
 * Клонируем через JSON, а НЕ `structuredClone`: актор приходит из `ref` листа
 * (`localActor`), поэтому `actor.system.proficiencies` — реактивный Proxy Vue, на
 * котором `structuredClone` бросает `DataCloneError` («could not be cloned»).
 * Владения — чистый JSON (массивы строк + запись строка→строка), так что клон
 * без потерь. Тот же приём используется в `applyFeatDarkvision` ниже.
 */
function cloneProficiencies(
  proficiencies: ActorProficiencies,
): ActorProficiencies {
  return JSON.parse(JSON.stringify(proficiencies));
}

/** Применяет владения черты к копии владений актора (in-place). */
function applyFeatProficiencies(
  proficiencies: ActorProficiencies,
  featData: FeatData | null | undefined,
): void {
  for (const skill of featData?.skillProficiencies ?? []) {
    proficiencies.skills[skill] = 'proficient';
  }

  pushUnique(proficiencies.weapons, featData?.weaponProficiencies ?? []);
  pushUnique(proficiencies.armor, featData?.armorProficiencies ?? []);
  pushUnique(proficiencies.tools, featData?.toolProficiencies ?? []);
  pushUnique(proficiencies.languages, featData?.languages ?? []);

  pushUnique(
    proficiencies.savingThrows,
    featData?.savingThrowProficiencies ?? [],
  );
}

/** Откатывает владения черты из копии владений актора (in-place). */
function removeFeatProficiencies(
  proficiencies: ActorProficiencies,
  featData: FeatData | null | undefined,
): void {
  for (const skill of featData?.skillProficiencies ?? []) {
    Reflect.deleteProperty(proficiencies.skills, skill);
  }

  removeItems(proficiencies.weapons, featData?.weaponProficiencies ?? []);
  removeItems(proficiencies.armor, featData?.armorProficiencies ?? []);
  removeItems(proficiencies.tools, featData?.toolProficiencies ?? []);
  removeItems(proficiencies.languages, featData?.languages ?? []);

  removeItems(
    proficiencies.savingThrows,
    featData?.savingThrowProficiencies ?? [],
  );
}

/**
 * Загружает заклинания компендиума и сопоставляет связанные `grantedSpells`
 * черты с их полными данными. Без сокета или связей — пустой список.
 *
 * @param socket - WebSocket-клиент (для загрузки компендиума)
 * @param feat - перетаскиваемая черта (имя + блоб даров)
 * @param feat.name - имя черты (источник при выдаче заклинаний)
 * @param feat.featData - блоб даров черты с выдаваемыми заклинаниями
 */
export async function resolveFeatGrantedSpells(
  socket: TypedWebSocketClient | null | undefined,
  feat: { name: string; featData?: FeatData | null },
): Promise<ResolvedGrantedSpell[]> {
  const sources = collectFeatGrantedSpellSources(feat);

  if (sources.length === 0 || !socket) {
    return [];
  }

  const entries = await loadCompendiumKind(socket, 'spell');
  const spells = extractSpellEntries(entries);

  const resolved: ResolvedGrantedSpell[] = [];

  for (const source of sources) {
    const spell = spells.find((entry) => entry.id === source.spellId);

    if (spell) {
      resolved.push({ spell, featureName: source.featureName });
    }
  }

  return resolved;
}

/**
 * Собирает обновления актора для ПРИМЕНЕНИЯ черты: добавляет особенность-черту
 * (несущую `featData`/`activeEffects` для отката), выдаёт заклинания, переносит
 * эффекты + синтетический эффект даров, дописывает владения.
 *
 * @param actor - текущий актор
 * @param droppedFeat - перетащенная черта (с `featData`/`activeEffects`)
 * @param resolvedSpells - сопоставленные с компендиумом выдаваемые заклинания
 */
export function applyFeatToActor(
  actor: Actor,
  droppedFeat: AppliedFeatFeature,
  resolvedSpells: ResolvedGrantedSpell[],
): FeatApplyResult {
  const featureId = generateEntityId('feature');
  const featData = droppedFeat.featData ?? null;

  // Конструируем особенность явно (без полей GameItem-обёртки), сохраняя дары
  // для последующего редактирования/отката на акторе.
  const newFeature: AppliedFeatFeature = {
    id: featureId,
    name: droppedFeat.name,
    nameEn: droppedFeat.nameEn,
    description: droppedFeat.description,
    featureType: 'feat',
    sourceKey: droppedFeat.sourceKey,
    isSRD: droppedFeat.isSRD,
    repeatable: droppedFeat.repeatable,
    repeatableText: droppedFeat.repeatableText,
    ...(featData ? { featData } : {}),
    ...(droppedFeat.activeEffects
      ? { activeEffects: droppedFeat.activeEffects }
      : {}),
  };

  const features = [...actor.features, newFeature];

  const proficiencies = cloneProficiencies(actor.system.proficiencies);

  applyFeatProficiencies(proficiencies, featData);

  const spells = appendGrantedSpells(actor.spells ?? [], resolvedSpells);

  const transferred = prepareTransferredFeatEffects(
    featureId,
    droppedFeat.activeEffects,
  );

  const grantEffect = buildFeatGrantEffect(
    featureId,
    newFeature.name,
    featData,
  );

  const activeEffects = [
    ...(actor.activeEffects ?? []),
    ...transferred,
    ...(grantEffect ? [grantEffect] : []),
  ];

  // Тёмное зрение: поднимаем дальность зрения токена до максимума (как у вида).
  // Не понижаем — у тёмного зрения может быть другой источник (вид/класс).
  const token = applyFeatDarkvision(actor.token, featData?.darkvision ?? 0);

  return { features, spells, activeEffects, proficiencies, token };
}

/**
 * Возвращает обновлённые настройки токена с поднятым до `darkvision` тёмным
 * зрением, либо `undefined`, если поднимать нечего (черта не даёт тёмного зрения
 * или у токена оно уже не ниже).
 *
 * @param token - текущие настройки токена актора
 * @param darkvision - тёмное зрение черты (футы)
 */
function applyFeatDarkvision(
  token: Actor['token'],
  darkvision: number,
): Actor['token'] | undefined {
  if (darkvision <= 0) {
    return undefined;
  }

  const next: NonNullable<Actor['token']> = JSON.parse(
    JSON.stringify(token ?? {}),
  );

  if (!next.vision) {
    next.vision = { enabled: true, range: 60, darkvision: 0, angle: 360 };
  }

  if (darkvision <= next.vision.darkvision) {
    return undefined;
  }

  next.vision.darkvision = darkvision;

  return next;
}

/**
 * Собирает обновления актора для ОТКАТА черты: удаляет особенность, снимает её
 * заклинания (по `grantedByFeature`), эффекты (по провенансу `feat:<id>`) и
 * выданные владения. Тёмное зрение НЕ понижается (нет провенанса источника —
 * могло прийти от вида/класса; недеструктивно, как и у вида).
 *
 * Инвариант: ключ отката заклинаний — текущее имя черты (`grantedByFeature`).
 * Имя фиксируется при выдаче и при пере-применении (`reapplyFeatToActor`
 * переносит заклинания на новое имя), поэтому откат всегда сходится по имени
 * применённой особенности.
 *
 * @param actor - текущий актор
 * @param feature - удаляемая особенность-черта (с `featData` для точного отката)
 */
export function removeFeatFromActor(
  actor: Actor,
  feature: AppliedFeatFeature,
): FeatApplyResult {
  const features = actor.features.filter((entry) => entry.id !== feature.id);

  const spells = removeGrantedSpellsByFeatureNames(actor.spells ?? [], [
    feature.name,
  ]);

  const activeEffects = (actor.activeEffects ?? []).filter(
    (effect) => !isFeatOwnedEffect(effect, feature.id),
  );

  const proficiencies = cloneProficiencies(actor.system.proficiencies);

  removeFeatProficiencies(proficiencies, feature.featData ?? null);

  return { features, spells, activeEffects, proficiencies };
}

/**
 * Пере-применяет отредактированную черту: снимает дары старой версии и
 * применяет новую (по образцу смены вида). Заклинания берёт из
 * `resolvedSpells`, который формирует вызывающий — на дропе резолвится
 * компендиум (`resolveFeatGrantedSpells`), на листе без сокета переносятся уже
 * выданные заклинания черты (новые связанные заклинания через лист не
 * подтянутся — для них правьте черту в «Предметах» и перетащите заново).
 *
 * @param actor - текущий актор
 * @param oldFeature - применённая ранее версия черты (для снятия её даров)
 * @param updatedFeat - обновлённая черта (её дары применяются)
 * @param resolvedSpells - выдаваемые заклинания для повторной выдачи
 */
export function reapplyFeatToActor(
  actor: Actor,
  oldFeature: AppliedFeatFeature,
  updatedFeat: AppliedFeatFeature,
  resolvedSpells: ResolvedGrantedSpell[],
): FeatApplyResult {
  const removed = removeFeatFromActor(actor, oldFeature);

  const intermediate: Actor = {
    ...actor,
    features: removed.features,
    spells: removed.spells,
    activeEffects: removed.activeEffects,
    system: { ...actor.system, proficiencies: removed.proficiencies },
  };

  return applyFeatToActor(intermediate, updatedFeat, resolvedSpells);
}
