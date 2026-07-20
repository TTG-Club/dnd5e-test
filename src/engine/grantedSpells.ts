/**
 * Утилиты заклинаний, автоматически предоставляемых умениями (granted spells).
 *
 * Умения классов, видов, предысторий и черт могут содержать поле
 * `grantedSpells` — список ID заклинаний компендиума, которые персонаж
 * получает автоматически (напр. «Избранный враг» следопыта даёт
 * «Метку охотника»). Такие заклинания всегда подготовлены и не тратят
 * лимит ручного выбора заклинаний.
 */

import type { Spell } from './dndEntities.js';

import { generateId } from '@vtt/shared';

// ── Типы ──────────────────────────────────────────────────────

/** Минимальная форма умения, способного предоставлять заклинания */
export interface FeatureWithGrantedSpells {
  /** Название умения (используется как источник в бейджах и при откате) */
  name: string;
  /** ID заклинаний компендиума, предоставляемых умением */
  grantedSpells?: string[];
}

/** Связь «заклинание компендиума → умение-источник» */
export interface GrantedSpellSource {
  /** ID заклинания в компендиуме */
  spellId: string;
  /** Название умения, предоставившего заклинание */
  featureName: string;
  /** Предпочтённый пак-компендиум (id манифеста); откат — любой пак по `spellId`. */
  packId?: string;
}

/** Заклинание компендиума, сопоставленное с умением-источником */
export interface ResolvedGrantedSpell {
  /** Полные данные заклинания из компендиума */
  spell: Spell;
  /** Название умения, предоставившего заклинание */
  featureName: string;
}

// ── Утилиты ───────────────────────────────────────────────────

/**
 * Собирает связи «заклинание → умение-источник» из списка умений.
 *
 * @param features - умения (класса, вида, черты), возможно с `grantedSpells`
 * @returns плоский список связей без дубликатов по ID заклинания
 */
export function collectGrantedSpellSources(
  features: ReadonlyArray<FeatureWithGrantedSpells>,
): GrantedSpellSource[] {
  const sources: GrantedSpellSource[] = [];
  const seenSpellIds = new Set<string>();

  for (const feature of features) {
    for (const spellId of feature.grantedSpells ?? []) {
      if (seenSpellIds.has(spellId)) {
        continue;
      }

      seenSpellIds.add(spellId);
      sources.push({ spellId, featureName: feature.name });
    }
  }

  return sources;
}

/**
 * Умение класса с поуровневой выдачей заклинаний.
 *
 * Расширяет {@link FeatureWithGrantedSpells} уровнем получения умения
 * и картой «уровень класса → ID заклинаний» для списков, выдаваемых
 * частями (домены жреца, клятвы паладина, покровители колдуна).
 */
export interface LeveledFeatureWithGrantedSpells extends FeatureWithGrantedSpells {
  /** Уровень класса, на котором умение получается */
  level?: number;
  /** Поуровневая выдача: ключ — уровень класса (строка «1»–«20») */
  grantedSpellsByLevel?: Record<string, string[]>;
}

/**
 * Собирает granted-заклинания, получаемые ровно на указанном уровне класса.
 *
 * Учитываются два источника:
 * - `grantedSpells` умений, получаемых именно на этом уровне;
 * - `grantedSpellsByLevel[level]` всех умений, полученных не позже этого
 *   уровня (поуровневые списки доменов/клятв/покровителей).
 *
 * @param features - все умения класса и активного подкласса
 * @param classLevel - получаемый уровень класса
 * @returns плоский список связей без дубликатов по ID заклинания
 */
export function collectGrantedSpellSourcesForClassLevel(
  features: ReadonlyArray<LeveledFeatureWithGrantedSpells>,
  classLevel: number,
): GrantedSpellSource[] {
  const sources: GrantedSpellSource[] = [];
  const seenSpellIds = new Set<string>();

  for (const feature of features) {
    const gainedAtLevel = feature.level ?? 1;

    if (gainedAtLevel > classLevel) {
      continue;
    }

    const spellIds: string[] = [];

    if (gainedAtLevel === classLevel) {
      spellIds.push(...(feature.grantedSpells ?? []));
    }

    spellIds.push(
      ...(feature.grantedSpellsByLevel?.[String(classLevel)] ?? []),
    );

    for (const spellId of spellIds) {
      if (seenSpellIds.has(spellId)) {
        continue;
      }

      seenSpellIds.add(spellId);
      sources.push({ spellId, featureName: feature.name });
    }
  }

  return sources;
}

/**
 * Нормализует название заклинания для сравнения на дубликаты.
 *
 * @param name - название заклинания
 * @returns название без крайних пробелов в нижнем регистре
 */
export function normalizeSpellName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Добавляет granted-заклинания в список заклинаний актора.
 *
 * Дубликаты отсеиваются по нормализованному названию (при добавлении в лист
 * персонажа заклинанию выдаётся новый id, поэтому id компендиума с ним
 * никогда не совпадает). Каждое добавленное заклинание помечается
 * `prepared`/`alwaysPrepared` и получает `grantedByFeature` с названием
 * умения-источника.
 *
 * @param existingSpells - текущий список заклинаний актора
 * @param grantedSpells - granted-заклинания с умениями-источниками
 * @returns новый список заклинаний (исходный не мутируется)
 */
export function appendGrantedSpells(
  existingSpells: Spell[],
  grantedSpells: ResolvedGrantedSpell[],
): Spell[] {
  const result = [...existingSpells];

  const existingNames = new Set(
    result.map((spell) => normalizeSpellName(spell.name)),
  );

  for (const granted of grantedSpells) {
    const normalizedName = normalizeSpellName(granted.spell.name);

    if (existingNames.has(normalizedName)) {
      continue;
    }

    existingNames.add(normalizedName);

    result.push({
      ...granted.spell,
      id: generateId('spell'),
      prepared: true,
      alwaysPrepared: true,
      grantedByFeature: granted.featureName,
    });
  }

  return result;
}

/**
 * Удаляет granted-заклинания, выданные указанными умениями.
 *
 * Используется при откате источника (смена вида, замена черты предыстории):
 * заклинания, у которых `grantedByFeature` совпадает с одним из названий
 * умений, исключаются из списка.
 *
 * @param spells - текущий список заклинаний актора
 * @param featureNames - названия умений, чьи заклинания нужно убрать
 * @returns новый список заклинаний (исходный не мутируется)
 */
export function removeGrantedSpellsByFeatureNames(
  spells: Spell[],
  featureNames: ReadonlyArray<string>,
): Spell[] {
  const namesToRemove = new Set(featureNames);

  return spells.filter(
    (spell) =>
      !spell.grantedByFeature || !namesToRemove.has(spell.grantedByFeature),
  );
}
