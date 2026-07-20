/**
 * Контракты игровой системы.
 *
 * Определяют интерфейсы для расширяемых точек:
 * листы персонажей, карточки чата, броски, состояния, макросы.
 *
 * @module contracts
 */

export type {
  AreaEffectTrigger,
  BaseActiveEffect,
  EffectAura,
  EffectDuration,
  EffectDurationType,
  EffectTurnAnchor,
  EffectTurnTiming,
} from './activeEffect.js';
export type { ChatCardDefinition } from './cards.js';
export type {
  DamageApplyResult,
  DamageDefenseOutcome,
  IncomingAttackContext,
} from './combat.js';
export type { ConditionDefinition } from './conditions.js';
export type { EffectOrigin } from './effects.js';
export type { MacroDefinition } from './macros.js';
export type { RollDefinition, RollType } from './rolls.js';
export type { ActorSheetDefinition, ActorSheetType } from './sheets.js';
