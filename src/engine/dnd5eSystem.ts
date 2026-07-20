import type {
  CompendiumValueFormatter,
  DiceRollData,
  HealthCondition,
} from '@vtt/shared';
import type {
  BaseActor,
  BaseCreature,
  CustomArea,
  Feature,
  GridSettings,
  MeasurementTemplate,
  SceneEntity,
  Token,
} from '@vtt/shared';
import type { BaseActiveEffect } from '@vtt/shared';
import type { ConditionDefinition } from '@vtt/shared';
import type { SystemRollResult, VttSystem } from '@vtt/shared';
import type { ActiveEffect, EffectOrigin } from './activeEffectTypes.js';
import type { BackgroundDefinition } from './backgroundTypes.js';
import type { ConditionKey } from './consts.js';
import type { DamageApplyResult } from './damageUtils.js';
import type {
  DnDActor,
  DnDSceneEntity,
  GameItem,
  Spell,
} from './dndEntities.js';
import type { IncomingAttackContext } from './effectPipeline.js';

import { getHealthCondition, HEALTH_CONDITIONS } from '@vtt/shared';
import { isRecord } from '@vtt/shared';
import { ActiveEffectsArraySchema } from './activeEffectTypes.js';
import {
  normalizeActorData as normalizeDndActorData,
  validateActorData as validateDndActorData,
} from './actorValidation.js';
import {
  collectAllAuraEffects,
  calculateAmbientAuras as computeAmbientAuras,
} from './auraMath.js';
import { normalizeActor, normalizeCreature } from './calculations.js';
import { CLASS_KEY_OPTIONS } from './classTypes.js';
import { buildConditionActiveEffect } from './conditionTemplates.js';
import { CONDITIONS, CREATURE_CATEGORIES, DEFAULT_ACTOR } from './consts.js';
import {
  applyEffectsToEntity as applyEffectsToEntityImpl,
  applyTargetDamage as applyTargetDamageImpl,
  getEntityActiveFlags as getEntityActiveFlagsImpl,
  getEntityArmorClass as getEntityArmorClassImpl,
} from './damageApplication.js';
import { getSpellDamageParts } from './damageParts.js';
import { rollDamageFormula as rollDamageFormulaImpl } from './diceFormula.js';
import { collectActiveEffects, resolveActorStats } from './effectPipeline.js';
import { buildFeatGrantsSummary } from './featGrantsSummary.js';
import { validateFormula } from './formulaParser.js';
import { validateGameItem } from './itemSchemas.js';
import {
  applyAuraTriggerEffects as computeAuraTriggerEffects,
  syncActorAreaEffects,
} from './positionalEffects.js';
import { damagePartIsHealing } from './spellUtils.js';
import { isPointInTemplate as isPointInTemplateGeometry } from './templateGeometry.js';
import {
  decrementActorEffectDurations,
  expireTurnEffects as expireEntityTurnEffects,
  formatEffectsSummary,
  formatTurnEffectsMessage,
  processTurnEffects,
} from './turnEffects.js';

/**
 * Type-guard: Р·РЅР°С‡РµРЅРёРµ вЂ” РІР°Р»РёРґРЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ Р·РґРѕСЂРѕРІСЊСЏ (`HealthCondition`).
 *
 * @param value - РїСЂРѕРІРµСЂСЏРµРјС‹Р№ СЌР»РµРјРµРЅС‚
 * @returns true, РµСЃР»Рё value РёРјРµРµС‚ С„РѕСЂРјСѓ HealthCondition
 */
function isHealthCondition(value: unknown): value is HealthCondition {
  return (
    isRecord(value)
    && typeof value.key === 'string'
    && typeof value.minPercent === 'number'
    && typeof value.maxPercent === 'number'
    && typeof value.color === 'string'
  );
}

/**
 * Type-guard: Р·РЅР°С‡РµРЅРёРµ вЂ” РјР°СЃСЃРёРІ РІР°Р»РёРґРЅС‹С… СЃРѕСЃС‚РѕСЏРЅРёР№ Р·РґРѕСЂРѕРІСЊСЏ.
 * Р’РЅРµС€РЅРёРµ `customConditions` РїСЂРёС…РѕРґСЏС‚ РєР°Рє `unknown[]` (РєРѕРЅС‚СЂР°РєС‚ VttSystem)
 * Рё РІР°Р»РёРґРёСЂСѓСЋС‚СЃСЏ Р·РґРµСЃСЊ РїРµСЂРµРґ РїРµСЂРµРґР°С‡РµР№ РІ С‚РёРїРёР·РёСЂРѕРІР°РЅРЅС‹Р№ СЂР°СЃС‡С‘С‚.
 *
 * @param value - РїСЂРѕРІРµСЂСЏРµРјРѕРµ Р·РЅР°С‡РµРЅРёРµ
 * @returns true, РµСЃР»Рё value вЂ” РјР°СЃСЃРёРІ HealthCondition
 */
function isHealthConditionArray(value: unknown): value is HealthCondition[] {
  return Array.isArray(value) && value.every(isHealthCondition);
}

/** РџРѕРґРїРёСЃРё С‚РёРїРѕРІ СЃСѓС‰РµСЃС‚РІ РїРѕ РєР»СЋС‡Сѓ (РґР»СЏ С„РѕСЂРјР°С‚С‚РµСЂР° РєРѕРјРїРµРЅРґРёСѓРјР°) */
const CREATURE_TYPE_LABELS: Record<string, string> = CREATURE_CATEGORIES;

/** РџРѕРґРїРёСЃРё РєР»Р°СЃСЃРѕРІ РїРѕ РєР»СЋС‡Сѓ (РґР»СЏ С„РѕСЂРјР°С‚С‚РµСЂР° РєРѕРјРїРµРЅРґРёСѓРјР°) */
const CLASS_LABELS: Record<string, string> = Object.fromEntries(
  CLASS_KEY_OPTIONS.map((option) => [option.value, option.label]),
);

/**
 * РџР°СЂСЃРёС‚ РїРѕРєР°Р·Р°С‚РµР»СЊ РѕРїР°СЃРЅРѕСЃС‚Рё (РџРћ) РІ С‡РёСЃР»Рѕ РґР»СЏ СЃРѕСЂС‚РёСЂРѕРІРєРё.
 * РџСѓСЃС‚Рѕ/В«вЂ”В» в†’ -1 (РёРґСѓС‚ РїРµСЂРІС‹РјРё); РїРѕРґРґРµСЂР¶РёРІР°РµС‚ РґСЂРѕР±Рё В«1/8В», В«1/4В», В«1/2В».
 *
 * @param cr - СЃС‚СЂРѕРєРѕРІРѕРµ Р·РЅР°С‡РµРЅРёРµ challengeRating
 */
function parseChallengeRating(cr: string): number {
  if (!cr || cr === 'вЂ”') {
    return -1;
  }

  if (cr.includes('/')) {
    const [numerator, denominator] = cr.split('/');
    const denominatorValue = Number(denominator);

    if (denominatorValue) {
      return Number(numerator) / denominatorValue;
    }
  }

  const parsed = Number(cr);

  return Number.isNaN(parsed) ? -1 : parsed;
}

/**
 * Р¤РѕСЂРјР°С‚С‚РµСЂС‹ Р·РЅР°С‡РµРЅРёР№ РєРѕРјРїРµРЅРґРёСѓРјР° D&D РїРѕ РёРјРµРЅРё С„РѕСЂРјР°С‚Р°. РЈРїСЂР°РІР»СЏСЋС‚ РїРѕРґРїРёСЃСЊСЋ
 * Рё СЃРѕСЂС‚РёСЂРѕРІРєРѕР№ РѕРїС†РёР№ С„РёР»СЊС‚СЂРѕРІ Рё Р·Р°РіРѕР»РѕРІРєРѕРІ СЂР°Р·РґРµР»РѕРІ РІ РѕР±РѕР±С‰С‘РЅРЅРѕРј РґРІРёР¶РєРµ
 * РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ (`useCompendiumView`).
 */
const COMPENDIUM_VALUE_FORMATTERS: Record<string, CompendiumValueFormatter> = {
  spellLevel: {
    label: (value) =>
      Number(value) === 0 ? 'Р—Р°РіРѕРІРѕСЂС‹' : `${Number(value)} РєСЂСѓРі`,
    shortLabel: (value) => String(Number(value)),
    sortKey: (value) => Number(value),
  },
  challengeRating: {
    label: (value) => {
      const cr = String(value ?? '');

      return !cr || cr === 'вЂ”' ? 'РџРћ вЂ” (Р±РµР· СѓСЂРѕРІРЅСЏ РѕРїР°СЃРЅРѕСЃС‚Рё)' : `РџРћ ${cr}`;
    },
    shortLabel: (value) => {
      const cr = String(value ?? '');

      return cr && cr !== 'вЂ”' ? cr : 'вЂ”';
    },
    sortKey: (value) => parseChallengeRating(String(value ?? '')),
  },
  creatureType: {
    label: (value) => CREATURE_TYPE_LABELS[String(value)] ?? String(value),
    sortKey: (value) => CREATURE_TYPE_LABELS[String(value)] ?? String(value),
  },
  spellClass: {
    label: (value) => CLASS_LABELS[String(value)] ?? String(value),
    sortKey: (value) => CLASS_LABELS[String(value)] ?? String(value),
  },
};

/**
 * Type-guard: Р·Р°РїРёСЃСЊ РєРѕРјРїРµРЅРґРёСѓРјР° вЂ” Р·Р°РєР»РёРЅР°РЅРёРµ (РґР»СЏ РїСЂРµРґРёРєР°С‚Р° Р»РµС‡РµРЅРёСЏ).
 *
 * @param entry - РїСЂРѕРІРµСЂСЏРµРјР°СЏ Р·Р°РїРёСЃСЊ
 */
function isSpellEntry(entry: unknown): entry is Spell {
  return isRecord(entry) && entry.type === 'spell';
}

/**
 * РџСЂРѕРёР·РІРѕРґРЅС‹Рµ Р±СѓР»РµРІС‹ РїСЂРµРґРёРєР°С‚С‹ РєРѕРјРїРµРЅРґРёСѓРјР° РїРѕ РєР»СЋС‡Сѓ вЂ” РґР»СЏ С„РёР»СЊС‚СЂРѕРІ, РєРѕС‚РѕСЂС‹Рµ
 * РЅРµР»СЊР·СЏ РІС‹СЂР°Р·РёС‚СЊ РѕРґРЅРёРј РїРѕР»РµРј (Р»РµС‡РµРЅРёРµ РѕРїСЂРµРґРµР»СЏРµС‚СЃСЏ РїРѕ С‡Р°СЃС‚СЏРј СѓСЂРѕРЅР°).
 */
const COMPENDIUM_PREDICATES: Record<string, (entry: unknown) => boolean> = {
  spellHealing: (entry) =>
    isSpellEntry(entry)
    && getSpellDamageParts(entry).some((part) => damagePartIsHealing(part)),
};

/**
 * РРіСЂРѕРІР°СЏ СЃРёСЃС‚РµРјР° D&D 5e (РЇРґСЂРѕ РїСЂР°РІРёР»).
 * РџСЂРµРґРѕСЃС‚Р°РІР»СЏРµС‚ РЇРґСЂСѓ (Core VTT) Р°Р±СЃС‚СЂР°РіРёСЂРѕРІР°РЅРЅС‹Рµ РјРµС‚РѕРґС‹ РґР»СЏ СЂР°Р±РѕС‚С‹
 * СЃ РРЅРёС†РёР°С‚РёРІРѕР№, Р‘РѕРµРІРєРѕР№ Рё С‚.Рґ.
 */
export class Dnd5eVttSystem implements VttSystem {
  readonly id = 'dnd5e-test';

  readonly name = 'Dungeons & Dragons 5th Edition';

  readonly version = '1.0.0';

  /**
   * Р’С‹РїРѕР»РЅСЏРµС‚ РІР°Р»РёРґР°С†РёСЋ РґР°РЅРЅС‹С… Р°РєС‚РµСЂР° РїРѕ РїСЂР°РІРёР»Р°Рј СЃРёСЃС‚РµРјС‹ D&D 5e.
   *
   * @param actor РћР±СЉРµРєС‚ Р°РєС‚РµСЂР° РґР»СЏ РІР°Р»РёРґР°С†РёРё
   */
  // eslint-disable-next-line class-methods-use-this
  validateActor(actor: BaseActor): void {
    const dndActor = actor as DnDActor;

    if ('activeEffects' in dndActor && Array.isArray(dndActor.activeEffects)) {
      ActiveEffectsArraySchema.parse(dndActor.activeEffects);

      for (const effect of dndActor.activeEffects) {
        for (const change of effect.changes) {
          validateFormula(change.value);
        }
      }
    }
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ С€Р°Р±Р»РѕРЅ РЅРѕРІРѕРіРѕ Р°РєС‚С‘СЂР° D&D 5e РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ (Р±РµР· `id`).
   */
  // eslint-disable-next-line class-methods-use-this
  createDefaultActor(): Partial<BaseActor> {
    return { ...DEFAULT_ACTOR };
  }

  /**
   * Р’Р°Р»РёРґРёСЂСѓРµС‚ РґР°РЅРЅС‹Рµ Р°РєС‚С‘СЂР° D&D 5e РґР»СЏ С„РѕСЂРјС‹ СЃРѕР·РґР°РЅРёСЏ/СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ.
   */
  // eslint-disable-next-line class-methods-use-this
  validateActorData(actor: Partial<BaseActor>): void {
    validateDndActorData(actor as Partial<DnDActor>);
  }

  /**
   * РќРѕСЂРјР°Р»РёР·СѓРµС‚ С‡Р°СЃС‚РёС‡РЅС‹Рµ РґР°РЅРЅС‹Рµ Р°РєС‚С‘СЂР° D&D 5e (Р·Р°Р¶РёРјР°РµС‚ Р·РЅР°С‡РµРЅРёСЏ РІ РіСЂР°РЅРёС†С‹).
   */
  // eslint-disable-next-line class-methods-use-this
  normalizeActorData(actor: Partial<BaseActor>): Partial<BaseActor> {
    return normalizeDndActorData(actor as Partial<DnDActor>);
  }

  /**
   * РЎС‚СЂСѓРєС‚СѓСЂРЅРѕ РІР°Р»РёРґРёСЂСѓРµС‚ РґР°РЅРЅС‹Рµ РїСЂРµРґРјРµС‚Р° D&D 5e С‡РµСЂРµР· Zod-СЃС…РµРјСѓ (РѕР±РѕР±С‰С‘РЅРЅС‹Р№
   * РєРѕРЅРІРµСЂС‚ + Р»РµРЅРёРІРѕ РїРѕ С‚РёРїСѓ). Р‘СЂРѕСЃР°РµС‚ `Error` РїСЂРё РЅР°СЂСѓС€РµРЅРёРё.
   */
  // eslint-disable-next-line class-methods-use-this
  validateItemData(item: unknown): void {
    validateGameItem(item);
  }

  /**
   * РЎС‚СЂРѕРёС‚ Markdown-СЃРІРѕРґРєСѓ РјРµС…Р°РЅРёС‡РµСЃРєРёС… РґР°СЂРѕРІ С‡РµСЂС‚С‹/РїСЂРµРґРјРµС‚Р°/РїСЂРµРґС‹СЃС‚РѕСЂРёРё D&D 5e.
   */
  // eslint-disable-next-line class-methods-use-this
  getFeatGrantsSummary(feat: unknown): string {
    return buildFeatGrantsSummary(
      feat as Feature | GameItem | BackgroundDefinition,
    );
  }

  /**
   * Р’С‹С‡РёСЃР»СЏРµС‚ РјРѕРґРёС„РёРєР°С‚РѕСЂ РёРЅРёС†РёР°С‚РёРІС‹ РґР»СЏ D&D 5e СЃ СѓС‡РµС‚РѕРј Р±Р°С„С„РѕРІ Рё РґРµР±Р°С„С„РѕРІ (Active Effects).
   */
  // eslint-disable-next-line class-methods-use-this
  getInitiativeModifier(actor: BaseActor): number {
    // Р’ D&D СЃРёСЃС‚РµРјРµ РјС‹ С‚РѕС‡РЅРѕ Р·РЅР°РµРј, С‡С‚Рѕ BaseActor РёРјРµРµС‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ DnDActor
    const dndActor = actor as DnDActor;

    // Р’С‹Р·С‹РІР°РµРј РїРѕР»РЅС‹Р№ РїР°Р№РїР»Р°Р№РЅ Р°РєС‚РёРІРЅС‹С… СЌС„С„РµРєС‚РѕРІ, С‡С‚РѕР±С‹ РїРѕР»СѓС‡РёС‚СЊ РёС‚РѕРіРѕРІРѕРµ Р·РЅР°С‡РµРЅРёРµ РёРЅРёС†РёР°С‚РёРІС‹
    const resolvedStats = resolveActorStats(dndActor);

    return resolvedStats.initiative;
  }

  /**
   * РЎРѕРІРµСЂС€Р°РµС‚ Р±СЂРѕСЃРѕРє РёРЅРёС†РёР°С‚РёРІС‹ (1Рє20 + РјРѕРґРёС„РёРєР°С‚РѕСЂ)
   */
  rollInitiative(
    actor: BaseActor,
    rollFn?: (formula: string) => DiceRollData,
  ): SystemRollResult {
    const modifier = this.getInitiativeModifier(actor);

    if (rollFn) {
      // РљР»РёРµРЅС‚: Р”РµР»Р°РµРј Р±СЂРѕСЃРѕРє С‡РµСЂРµР· СЃС‚РѕСЂ (DiceRoller)
      const rollData = rollFn('1Рє20');

      return {
        roll: rollData.total, // Р­С‚Рѕ С‡РёСЃС‚РѕРµ Р·РЅР°С‡РµРЅРёРµ РєСѓР±РёРєР° РѕС‚ 1 РґРѕ 20
        modifier,
        total: rollData.total + modifier,
        rollData,
      };
    }

    // РЎРµСЂРІРµСЂ (РёР»Рё РµСЃР»Рё rollFn РЅРµ РїРµСЂРµРґР°РЅ): РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРёР№ РјР°С‚РµРјР°С‚РёС‡РµСЃРєРёР№ Р±СЂРѕСЃРѕРє
    const roll = Math.floor(Math.random() * 20) + 1;

    return {
      roll,
      modifier,
      total: roll + modifier,
    };
  }

  /**
   * РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ СЃРёСЃС‚РµРјС‹ (СЃРµСЂРІРµСЂРЅС‹Р№ lifecycle).
   * РџСѓСЃС‚Р°СЏ СЂРµР°Р»РёР·Р°С†РёСЏ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ вЂ” РїРµСЂРµРѕРїСЂРµРґРµР»СЏРµС‚СЃСЏ СЃРµСЂРІРµСЂРЅС‹Рј РїРѕРґРєР»Р°СЃСЃРѕРј.
   */
  // eslint-disable-next-line class-methods-use-this
  init(_api: unknown): void {
    // РџСѓСЃС‚Р°СЏ СЂРµР°Р»РёР·Р°С†РёСЏ вЂ” override РІ СЃРµСЂРІРµСЂРЅРѕРј РїРѕРґРєР»Р°СЃСЃРµ
  }

  /**
   * РЈРЅРёС‡С‚РѕР¶РµРЅРёРµ СЃРёСЃС‚РµРјС‹ (СЃРµСЂРІРµСЂРЅС‹Р№ lifecycle).
   * РџСѓСЃС‚Р°СЏ СЂРµР°Р»РёР·Р°С†РёСЏ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ вЂ” РїРµСЂРµРѕРїСЂРµРґРµР»СЏРµС‚СЃСЏ СЃРµСЂРІРµСЂРЅС‹Рј РїРѕРґРєР»Р°СЃСЃРѕРј.
   */
  // eslint-disable-next-line class-methods-use-this
  destroy(): void {
    // РџСѓСЃС‚Р°СЏ СЂРµР°Р»РёР·Р°С†РёСЏ вЂ” override РІ СЃРµСЂРІРµСЂРЅРѕРј РїРѕРґРєР»Р°СЃСЃРµ
  }

  /**
   * РџСЂРѕРіРѕРЅСЏРµС‚ РїРµСЂРёРѕРґРёС‡РµСЃРєРёРµ СЌС„С„РµРєС‚С‹ СЃСѓС‰РЅРѕСЃС‚Рё РЅР° РіСЂР°РЅРёС†Рµ С…РѕРґР° (DoT-СѓСЂРѕРЅ +
   * РїРѕРІС‚РѕСЂРЅС‹Рµ СЃРїР°СЃР±СЂРѕСЃРєРё D&D 5e) Рё РІРѕР·РІСЂР°С‰Р°РµС‚ С„Р»Р°Рі РёР·РјРµРЅРµРЅРёСЏ Рё СЃРІРѕРґРєСѓ РґР»СЏ С‡Р°С‚Р°.
   */
  // eslint-disable-next-line class-methods-use-this
  runTurnEffects(
    entity: SceneEntity,
    timing: 'startOfTurn' | 'endOfTurn',
  ): { changed: boolean; chatSummary: string | null } {
    const result = processTurnEffects(entity as DnDSceneEntity, timing);
    const chatSummary = formatTurnEffectsMessage(entity.name, timing, result);

    return { changed: result.changed, chatSummary };
  }

  /**
   * РЎРЅРёРјР°РµС‚ С‚РѕС‡РЅС‹Рµ `turn`-СЌС„С„РµРєС‚С‹ РЅР° РіСЂР°РЅРёС†Рµ С…РѕРґР° СѓС‡Р°СЃС‚РЅРёРєР° `turnActorId`.
   */
  // eslint-disable-next-line class-methods-use-this
  expireTurnEffects(
    entity: SceneEntity,
    turnActorId: string,
    timing: 'start' | 'end',
  ): boolean {
    return expireEntityTurnEffects(
      entity as DnDSceneEntity,
      turnActorId,
      timing,
    );
  }

  /**
   * РЈРјРµРЅСЊС€Р°РµС‚ РґР»РёС‚РµР»СЊРЅРѕСЃС‚СЊ (РІ СЂР°СѓРЅРґР°С…) РІСЃРµС… СЌС„С„РµРєС‚РѕРІ РЅР° СЃСѓС‰РЅРѕСЃС‚Рё, СЃРЅРёРјР°СЏ РёСЃС‚С‘РєС€РёРµ.
   */
  // eslint-disable-next-line class-methods-use-this
  decrementEffectDurations(entity: SceneEntity): boolean {
    return decrementActorEffectDurations(entity as DnDSceneEntity);
  }

  /**
   * РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµС‚ СЌС„С„РµРєС‚С‹ Р·РѕРЅ РїСЂРё РїРµСЂРµРјРµС‰РµРЅРёРё С‚РѕРєРµРЅР° Рё С„РѕСЂРјР°С‚РёСЂСѓРµС‚ СЃРІРѕРґРєСѓ
   * СЃСЂР°Р±РѕС‚Р°РІС€РёС… С‚СЂРёРіРіРµСЂРѕРІ РґР»СЏ С‡Р°С‚Р° (РјРµС‚РєР° В«РѕР±Р»Р°СЃС‚СЊВ»).
   */
  // eslint-disable-next-line class-methods-use-this
  syncAreaEffects(
    entity: SceneEntity,
    previousAreaIds: ReadonlySet<string>,
    currentAreaIds: ReadonlySet<string>,
    areas: CustomArea[],
    options?: { triggerOneShots?: boolean },
  ): { changed: boolean; chatSummary: string | null } {
    const result = syncActorAreaEffects(
      entity as DnDSceneEntity,
      previousAreaIds,
      currentAreaIds,
      areas,
      options,
    );

    const chatSummary = formatEffectsSummary(
      entity.name,
      'РѕР±Р»Р°СЃС‚СЊ',
      result.damageOutcomes,
      result.saveOutcomes,
      (save) => (save.passed ? 'вњ“ СЃРїР°СЃ' : 'вњ— РїСЂРѕРІР°Р»'),
    );

    return { changed: result.changed, chatSummary };
  }

  /**
   * РћР±СЂР°Р±Р°С‚С‹РІР°РµС‚ СЂР°Р·РѕРІС‹Рµ С‚СЂРёРіРіРµСЂ-Р°СѓСЂС‹ РїСЂРё РїРµСЂРµРјРµС‰РµРЅРёРё С‚РѕРєРµРЅР° Рё С„РѕСЂРјР°С‚РёСЂСѓРµС‚ РїРѕ
   * РєР°Р¶РґРѕР№ Р·Р°С‚СЂРѕРЅСѓС‚РѕР№ СЃСѓС‰РЅРѕСЃС‚Рё СЃРІРѕРґРєСѓ РґР»СЏ С‡Р°С‚Р° (РјРµС‚РєР° В«Р°СѓСЂР°В»).
   */
  // eslint-disable-next-line class-methods-use-this
  applyAuraTriggerEffects(
    scene: { tokens?: Token[]; gridSettings?: GridSettings },
    movedToken: Token,
    movedEntity: SceneEntity,
    previousToken: Token | undefined,
    getEntity: (actorId: string) => SceneEntity | undefined,
  ): Array<{
    entity: SceneEntity;
    changed: boolean;
    chatSummary: string | null;
  }> {
    const outcomes = computeAuraTriggerEffects(
      scene,
      movedToken,
      movedEntity as DnDSceneEntity,
      previousToken,
      (actorId) => getEntity(actorId) as DnDSceneEntity | undefined,
    );

    return outcomes.map((outcome) => ({
      entity: outcome.entity,
      changed: outcome.changed,
      chatSummary: formatEffectsSummary(
        outcome.entity.name,
        'Р°СѓСЂР°',
        outcome.damageOutcomes,
        outcome.saveOutcomes,
        (save) => (save.passed ? 'вњ“ СЃРїР°СЃ' : 'вњ— РїСЂРѕРІР°Р»'),
      ),
    }));
  }

  /**
   * РџСЂРѕРІРµСЂСЏРµС‚ РїРѕРїР°РґР°РЅРёРµ С‚РѕС‡РєРё РІ РѕР±Р»Р°СЃС‚СЊ С€Р°Р±Р»РѕРЅР° РёР·РјРµСЂРµРЅРёСЏ РїРѕ РіРµРѕРјРµС‚СЂРёРё D&D 5e
   * (РєСЂСѓРі/РєРѕРЅСѓСЃ/РєСѓР±/Р»РёРЅРёСЏ).
   */
  // eslint-disable-next-line class-methods-use-this
  isPointInTemplate(
    pointX: number,
    pointY: number,
    gridSize: number,
    template: MeasurementTemplate,
  ): boolean {
    return isPointInTemplateGeometry(pointX, pointY, gridSize, template);
  }

  /**
   * РњРёРЅРёРјР°Р»СЊРЅС‹Р№ Р±СЂРѕСЃРѕРє РєСѓР±РёРєРѕРІРѕР№ С„РѕСЂРјСѓР»С‹ СѓСЂРѕРЅР° D&D (СЃСѓРјРјР° + РІС‹РїР°РІС€РёРµ Р·РЅР°С‡РµРЅРёСЏ).
   */
  // eslint-disable-next-line class-methods-use-this
  rollDamageFormula(formula: string): { total: number; values: number[] } {
    return rollDamageFormulaImpl(formula);
  }

  /**
   * РЎРѕР±РёСЂР°РµС‚ РІСЃРµ Р°СѓСЂР°-СЌС„С„РµРєС‚С‹ СЃСѓС‰РЅРѕСЃС‚Рё (РЅР° СЃР°РјРѕР№ СЃСѓС‰РЅРѕСЃС‚Рё + СЃ СЌРєРёРїРёСЂРѕРІРєРё).
   */
  // eslint-disable-next-line class-methods-use-this
  collectAuraEffects(entity: SceneEntity): BaseActiveEffect[] {
    return collectAllAuraEffects(entity as DnDSceneEntity);
  }

  /**
   * Р’С‹С‡РёСЃР»СЏРµС‚ РІРЅРµС€РЅРёРµ (ambient) Р°СѓСЂР°-СЌС„С„РµРєС‚С‹, РЅР°РєСЂС‹РІР°СЋС‰РёРµ С†РµР»РµРІРѕР№ С‚РѕРєРµРЅ.
   */
  // eslint-disable-next-line class-methods-use-this
  calculateAmbientAuras(
    targetToken: Token,
    sources: Array<{ token: Token; effects: BaseActiveEffect[] }>,
    gridSettings: GridSettings,
  ): BaseActiveEffect[] {
    // Р“СЂР°РЅРёС†С‹ СЃРёСЃС‚РµРјС‹ D&D: РЅРµР№С‚СЂР°Р»СЊРЅС‹Рµ СЌС„С„РµРєС‚С‹ РєРѕРЅС‚СЂР°РєС‚Р° вЂ” СЌС‚Рѕ D&D-СЌС„С„РµРєС‚С‹
    // (С‚Р° Р¶Рµ РґРѕРІРµСЂРµРЅРЅРѕСЃС‚СЊ, С‡С‚Рѕ Рё `entity as DnDSceneEntity` РІС‹С€Рµ).
    return computeAmbientAuras(
      targetToken,
      sources as Array<{ token: Token; effects: ActiveEffect[] }>,
      gridSettings,
    );
  }

  /**
   * РЎСѓРјРјР°СЂРЅР°СЏ СЃРєРѕСЂРѕСЃС‚СЊ СЃСѓС‰РЅРѕСЃС‚Рё РїРѕ РІСЃРµРј СЂРµР¶РёРјР°Рј РґРІРёР¶РµРЅРёСЏ СЃ СѓС‡С‘С‚РѕРј СЌС„С„РµРєС‚РѕРІ вЂ”
   * СЏРґСЂРѕ РёСЃРїРѕР»СЊР·СѓРµС‚ РµС‘ РєР°Рє РіРµР№С‚ В«РјРѕР¶РµС‚ Р»Рё С‚РѕРєРµРЅ РґРІРёРіР°С‚СЊСЃСЏВ» (0 вЂ” РЅРµР»СЊР·СЏ).
   */
  // eslint-disable-next-line class-methods-use-this
  getTotalMovementSpeed(entity: SceneEntity): number {
    const dndEntity = entity as DnDSceneEntity;
    const activeEffects = collectActiveEffects(dndEntity);
    const { movement } = resolveActorStats(dndEntity, activeEffects);

    return (
      (movement.walk || 0)
      + (movement.fly || 0)
      + (movement.swim || 0)
      + (movement.climb || 0)
      + (movement.burrow || 0)
    );
  }

  /**
   * РџСЂРёРјРµРЅСЏРµС‚ СѓСЂРѕРЅ/Р»РµС‡РµРЅРёРµ Рє СЃСѓС‰РЅРѕСЃС‚Рё D&D 5e (РјСѓС‚РёСЂСѓРµС‚ РҐРџ СЃ СѓС‡С‘С‚РѕРј Р·Р°С‰РёС‚ Рё
   * РІСЂРµРјРµРЅРЅС‹С… РҐРџ) Рё РІРѕР·РІСЂР°С‰Р°РµС‚ СЃРІРѕРґРєСѓ РёР·РјРµРЅРµРЅРёСЏ.
   */
  // eslint-disable-next-line class-methods-use-this
  applyDamageToEntity(
    entity: SceneEntity,
    amount: number,
    isHealing: boolean,
    damageType?: string,
  ): DamageApplyResult {
    return applyTargetDamageImpl(
      entity as DnDSceneEntity,
      amount,
      isHealing,
      damageType,
    );
  }

  /**
   * РќР°РєР»Р°РґС‹РІР°РµС‚ СЌС„С„РµРєС‚С‹ РЅР° СЃСѓС‰РЅРѕСЃС‚СЊ D&D 5e (РёРјРјСѓРЅРёС‚РµС‚С‹, condition-СЃР±РѕСЂРєР°,
   * СЃР»РёСЏРЅРёРµ) Рё РІРѕР·РІСЂР°С‰Р°РµС‚ РѕР±РЅРѕРІР»С‘РЅРЅС‹Р№ СЃРїРёСЃРѕРє `activeEffects`.
   */
  // eslint-disable-next-line class-methods-use-this
  applyEffectsToEntity(
    entity: SceneEntity,
    effects: BaseActiveEffect[],
    origin: string,
  ): BaseActiveEffect[] {
    return applyEffectsToEntityImpl(
      entity as DnDSceneEntity,
      effects as ActiveEffect[],
      origin as EffectOrigin,
    );
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ РёС‚РѕРіРѕРІС‹Р№ РљР” СЃСѓС‰РЅРѕСЃС‚Рё D&D 5e СЃ СѓС‡С‘С‚РѕРј РєРѕРЅС‚РµРєСЃС‚Р° РІС…РѕРґСЏС‰РµР№ Р°С‚Р°РєРё.
   */
  // eslint-disable-next-line class-methods-use-this
  getEntityArmorClass(entity: SceneEntity, attackContext?: unknown): number {
    return getEntityArmorClassImpl(
      entity as DnDSceneEntity,
      attackContext as IncomingAttackContext | undefined,
    );
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ РЅР°Р±РѕСЂ Р°РєС‚РёРІРЅС‹С… Р±РѕРµРІС‹С… С„Р»Р°РіРѕРІ СЃСѓС‰РЅРѕСЃС‚Рё D&D 5e.
   */
  // eslint-disable-next-line class-methods-use-this
  getEntityActiveFlags(entity: SceneEntity): ReadonlySet<string> {
    return getEntityActiveFlagsImpl(entity as DnDSceneEntity);
  }

  /**
   * Р’С‹С‡РёСЃР»СЏРµС‚ РёС‚РѕРіРѕРІС‹Рµ С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРєРё Р°РєС‚РµСЂР° СЃ СѓС‡РµС‚РѕРј Р°РєС‚РёРІРЅС‹С… СЌС„С„РµРєС‚РѕРІ.
   */
  // eslint-disable-next-line class-methods-use-this
  resolveActorStats(
    actor: BaseActor,
    effects?: readonly unknown[],
  ): Record<string, unknown> {
    return resolveActorStats(
      actor as DnDActor,
      effects as ActiveEffect[],
    ) as unknown as Record<string, unknown>;
  }

  /**
   * РЎРѕР±РёСЂР°РµС‚ РІСЃРµ Р°РєС‚РёРІРЅС‹Рµ СЌС„С„РµРєС‚С‹, РїСЂРёРІСЏР·Р°РЅРЅС‹Рµ Рє Р°РєС‚РµСЂСѓ.
   */
  // eslint-disable-next-line class-methods-use-this
  collectActiveEffects(actor: BaseActor): readonly unknown[] {
    return collectActiveEffects(actor as DnDActor);
  }

  /**
   * РќРѕСЂРјР°Р»РёР·СѓРµС‚ РїРѕР»РЅРѕРіРѕ Р°РєС‚С‘СЂР° D&D РЅР° РјРµСЃС‚Рµ РїСЂРё Р·Р°РіСЂСѓР·РєРµ (РјРёРіСЂР°С†РёСЏ С„РѕСЂРјР°С‚Р°).
   */
  // eslint-disable-next-line class-methods-use-this
  normalizeActor(actor: BaseActor): void {
    normalizeActor(actor as DnDActor);
  }

  /**
   * Р’С‹РїРѕР»РЅСЏРµС‚ РЅРѕСЂРјР°Р»РёР·Р°С†РёСЋ РґР°РЅРЅС‹С… СЃСѓС‰РµСЃС‚РІР°.
   */
  // eslint-disable-next-line class-methods-use-this
  normalizeCreature(creature: any): void {
    normalizeCreature(creature);
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ СЃРїРёСЃРѕРє РґРѕСЃС‚СѓРїРЅС‹С… РєР»Р°СЃСЃРѕРІ РІ СЃРёСЃС‚РµРјРµ РґР»СЏ РєРѕРјРїРµРЅРґРёСѓРјР°.
   */
  // eslint-disable-next-line class-methods-use-this
  getClassKeyOptions(): Array<{ value: string; label: string }> {
    return [...CLASS_KEY_OPTIONS];
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ С„РѕСЂРјР°С‚С‚РµСЂ Р·РЅР°С‡РµРЅРёР№ РєРѕРјРїРµРЅРґРёСѓРјР° РїРѕ РёРјРµРЅРё С„РѕСЂРјР°С‚Р°.
   */
  // eslint-disable-next-line class-methods-use-this
  getCompendiumValueFormatter(
    format: string,
  ): CompendiumValueFormatter | undefined {
    return COMPENDIUM_VALUE_FORMATTERS[format];
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ РїСЂРѕРёР·РІРѕРґРЅС‹Р№ Р±СѓР»РµРІ РїСЂРµРґРёРєР°С‚ РєРѕРјРїРµРЅРґРёСѓРјР° РїРѕ РєР»СЋС‡Сѓ.
   */
  // eslint-disable-next-line class-methods-use-this
  getCompendiumPredicate(
    key: string,
  ): ((entry: unknown) => boolean) | undefined {
    return COMPENDIUM_PREDICATES[key];
  }

  /**
   * РџСЂРѕРІРµСЂСЏРµС‚, Р°РєС‚РёРІРЅРѕ Р»Рё РєРѕРЅРєСЂРµС‚РЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ Сѓ Р°РєС‚РѕСЂР°.
   */
  // eslint-disable-next-line class-methods-use-this
  isConditionActive(
    activeEffects: readonly unknown[],
    conditionKey: string,
  ): boolean {
    const condition = CONDITIONS.find((entry) => entry.key === conditionKey);

    if (!condition) {
      return false;
    }

    return (activeEffects as ActiveEffect[]).some(
      (effect) =>
        effect.origin === 'condition'
        && !(effect.aura && !effect.aura.applyToSelf)
        && (effect.name === condition.nameRu
          || effect.name === condition.nameEn),
    );
  }

  /**
   * РџРµСЂРµРєР»СЋС‡Р°РµС‚ (РґРѕР±Р°РІР»СЏРµС‚/СѓРґР°Р»СЏРµС‚) СЃРѕСЃС‚РѕСЏРЅРёРµ РІ СЃРїРёСЃРєРµ СЌС„С„РµРєС‚РѕРІ Р°РєС‚РѕСЂР°.
   */

  toggleCondition(
    activeEffects: readonly unknown[],
    conditionKey: string,
    generateIdFn: (prefix: string) => string,
  ): unknown[] {
    const condition = CONDITIONS.find((entry) => entry.key === conditionKey);

    if (!condition) {
      return activeEffects as unknown[];
    }

    const effects = activeEffects as ActiveEffect[];
    const key = conditionKey as ConditionKey;

    if (this.isConditionActive(effects, conditionKey)) {
      return effects.filter(
        (effect) =>
          !(
            effect.origin === 'condition'
            && (effect.name === condition.nameRu
              || effect.name === condition.nameEn)
          ),
      );
    } else {
      // Р•РґРёРЅС‹Р№ РёСЃС‚РѕС‡РЅРёРє РїСЂР°РІРґС‹: builder РїСЂРѕСЃС‚Р°РІР»СЏРµС‚ conditionKey,
      // conditionImmunities Рё РґРёРЅР°РјРёС‡РµСЃРєРёРµ changes РСЃС‚РѕС‰РµРЅРёСЏ.
      const newEffect = buildConditionActiveEffect(key);

      if (!newEffect) {
        return [...effects];
      }

      newEffect.id = generateIdFn('effect');

      return [...effects, newEffect];
    }
  }

  /**
   * РћРїСЂРµРґРµР»СЏРµС‚ СЃРѕСЃС‚РѕСЏРЅРёРµ Р·РґРѕСЂРѕРІСЊСЏ РїРѕ С‚РµРєСѓС‰РёРј Рё РјР°РєСЃРёРјР°Р»СЊРЅС‹Рј РҐРџ РїРѕ РїСЂР°РІРёР»Р°Рј СЃРёСЃС‚РµРјС‹.
   */
  // eslint-disable-next-line class-methods-use-this
  getHealthCondition(
    currentHp: number,
    maxHp: number,
    isActor?: boolean,
    customConditions?: unknown[],
  ):
    | { key: string; nameEn: string; nameRu: string; color: string }
    | undefined {
    return getHealthCondition(
      currentHp,
      maxHp,
      isActor,
      isHealthConditionArray(customConditions) ? customConditions : undefined,
    );
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ С‚Р°Р±Р»РёС†Сѓ СЃРѕСЃС‚РѕСЏРЅРёР№ Р·РґРѕСЂРѕРІСЊСЏ D&D 5e РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ (РїРѕСЂРѕРіРё %РҐРџ).
   */
  // eslint-disable-next-line class-methods-use-this
  getDefaultHealthConditions(): readonly HealthCondition[] {
    return HEALTH_CONDITIONS;
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ СЃРІРѕРґРєСѓ РҐРџ Р°РєС‚С‘СЂР° РґР»СЏ HUD РІС‹Р±СЂР°РЅРЅРѕРіРѕ С‚РѕРєРµРЅР° (РїР°РЅРµР»СЊ РЅР°Рґ СЃС†РµРЅРѕР№).
   * Р§РёС‚Р°РµС‚ `system.hitPoints` Р·Р°С‰РёС‚РЅРѕ РёР· РЅРµР№С‚СЂР°Р»СЊРЅРѕРіРѕ Р±Р»РѕР±Р° вЂ” СЏРґСЂРѕ РЅРµ Р·РЅР°РµС‚
   * РёРјС‘РЅ D&D-РїРѕР»РµР№.
   */
  // eslint-disable-next-line class-methods-use-this
  getActorHudSummary(actor: BaseActor): {
    hp: { current: number; max: number; temp: number };
  } {
    const hitPoints = isRecord(actor.system.hitPoints)
      ? actor.system.hitPoints
      : undefined;

    return {
      hp: {
        current: typeof hitPoints?.current === 'number' ? hitPoints.current : 0,
        max: typeof hitPoints?.max === 'number' ? hitPoints.max : 0,
        temp: typeof hitPoints?.temp === 'number' ? hitPoints.temp : 0,
      },
    };
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ Р±РµР№РґР¶ В«РџРћ XВ» (РїРѕРєР°Р·Р°С‚РµР»СЊ РѕРїР°СЃРЅРѕСЃС‚Рё) РґР»СЏ СЃСѓС‰РµСЃС‚РІР° РІ СЃРїРёСЃРєР°С… СЏРґСЂР°.
   * `undefined` вЂ” Сѓ СЃСѓС‰РµСЃС‚РІР° РЅРµС‚ РїРѕРєР°Р·Р°С‚РµР»СЏ РѕРїР°СЃРЅРѕСЃС‚Рё.
   */
  // eslint-disable-next-line class-methods-use-this
  getEntityListBadge(creature: BaseCreature): string | undefined {
    const challengeRating = creature.system.challengeRating;

    // РџРћ С…СЂР°РЅРёС‚СЃСЏ СЃС‚СЂРѕРєРѕР№ ('1/4'), РЅРѕ РІ СЃС‚Р°СЂС‹С… РјРёСЂР°С…/РёРјРїРѕСЂС‚Р°С… РІСЃС‚СЂРµС‡Р°РµС‚СЃСЏ Рё
    // С‡РёСЃР»РѕРј (normalizeCreature РµРіРѕ Рє СЃС‚СЂРѕРєРµ РЅРµ РєРѕСЌСЂСЃРёС‚) вЂ” Р±РµР№РґР¶ РѕР±СЏР·Р°РЅ
    // РїРѕРєР°Р·С‹РІР°С‚СЊСЃСЏ РІ РѕР±РѕРёС… СЃР»СѓС‡Р°СЏС…, РєР°Рє РІ UI РґРѕ СЂР°СЃС€РёРІРєРё СЏРґСЂР°.
    if (typeof challengeRating === 'number') {
      return `РџРћ ${challengeRating}`;
    }

    return typeof challengeRating === 'string' && challengeRating.length > 0
      ? `РџРћ ${challengeRating}`
      : undefined;
  }

  /**
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ СЃРїРёСЃРѕРє РІСЃРµС… РґРѕСЃС‚СѓРїРЅС‹С… СЃРѕСЃС‚РѕСЏРЅРёР№ (conditions) РІ D&D 5e.
   */
  // eslint-disable-next-line class-methods-use-this
  getConditions(): ConditionDefinition[] {
    return CONDITIONS.map((condition) => ({
      key: condition.key,
      label: condition.nameRu,
      icon: condition.icon,
      description: condition.description,
      systemId: 'dnd5e-test',
      customImage: condition.customImage,
    }));
  }
}

/** Р­РєР·РµРјРїР»СЏСЂ СЃРёСЃС‚РµРјС‹ D&D 5e РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ */
export const dnd5eSystemInstance = new Dnd5eVttSystem();
