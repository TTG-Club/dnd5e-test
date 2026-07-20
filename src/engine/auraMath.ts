import type { GridSettings, Token } from '@vtt/shared';
import type { ActiveEffect } from './activeEffectTypes.js';
import type { DnDSceneEntity } from './dndEntities.js';

import { isDnDEffect } from './activeEffectTypes.js';

/**
 * Отношение между токенами для вычисления аур.
 * В будущем можно усложнить логику (проверять disposition или user ownership).
 */
export type TokenDisposition = 'ally' | 'enemy' | 'neutral';

export interface AuraSourceToken {
  token: Token;
  effects: ActiveEffect[];
}

/**
 * Определяет относительное отношение между двумя токенами.
 */
export function getRelativeDisposition(
  source: Token,
  target: Token,
): TokenDisposition {
  const sourceDisp = source.disposition || 'neutral';
  const targetDisp = target.disposition || 'neutral';

  if (sourceDisp === targetDisp && sourceDisp !== 'neutral') {
    return 'ally';
  }

  if (
    (sourceDisp === 'friendly' && targetDisp === 'hostile')
    || (sourceDisp === 'hostile' && targetDisp === 'friendly')
  ) {
    return 'enemy';
  }

  return 'neutral';
}

/**
 * Фильтрует активные эффекты, возвращая только те, которые имеют активную ауру.
 */
export function getAuraEffects(effects?: ActiveEffect[]): ActiveEffect[] {
  if (!effects) {
    return [];
  }

  return effects.filter(
    (effect) => effect.aura && effect.aura.radius > 0 && !effect.disabled,
  );
}

/**
 * Собирает все аура-эффекты актора из всех источников:
 * 1. Эффекты напрямую на акторе (actor.activeEffects)
 * 2. Эффекты с экипированных предметов (actor.equipment[].activeEffects)
 *
 * @param entity - объект сущности (DnDSceneEntity)
 * @returns массив активных аура-эффектов
 */
export function collectAllAuraEffects(entity: DnDSceneEntity): ActiveEffect[] {
  const allEffects: ActiveEffect[] = [];

  const entityAuras = getAuraEffects(entity.activeEffects);

  allEffects.push(...entityAuras);

  if ('equipment' in entity && entity.equipment) {
    for (const item of entity.equipment) {
      if (!item.equipped || !item.activeEffects) {
        continue;
      }

      const itemAuras = getAuraEffects(
        item.activeEffects.filter(isDnDEffect),
      ).filter((auraEffect) => auraEffect.effectTarget !== 'target');

      allEffects.push(...itemAuras);
    }
  }

  return allEffects;
}

/**
 * Вычисляет все внешние (Ambient) эффекты от аур, которые должны быть
 * наложены на указанный целевой токен в данный момент времени.
 *
 * Проверка попадания: аура действует на цель, когда центр цели
 * находится внутри круга ауры (евклидова дистанция).
 * Круг ауры: центр источника + радиус ауры + половина размера источника.
 *
 * @param targetToken - токен, для которого запрашиваем внешние ауры
 * @param sources - массив токенов-источников с их аура-эффектами
 * @param gridSettings - настройки координатной сетки сцены
 * @returns массив ActiveEffect (аур), которые достают до targetToken
 */
export function calculateAmbientAuras(
  targetToken: Token,
  sources: AuraSourceToken[],
  gridSettings: GridSettings,
): ActiveEffect[] {
  const ambientEffects: ActiveEffect[] = [];

  const cellSize = gridSettings.cellSize ?? 50;
  const distancePerCell = gridSettings.scale ?? 5;

  // Центр целевого токена
  const targetScale = targetToken.scale ?? 1;
  const targetTokenSizePx = targetScale * cellSize;
  const targetCenterX = targetToken.x + targetTokenSizePx / 2;
  const targetCenterY = targetToken.y + targetTokenSizePx / 2;

  // Хитбокс токена: 20% от размера (TOKEN_HITBOX_SIZE = 0.2 из wallsConsts)
  // Для простоты расчетов мы аппроксимируем квадратный хитбокс кругом его радиуса
  const targetHitboxRadiusPx = (targetTokenSizePx / 2) * 0.2;

  for (const source of sources) {
    if (!source.effects || source.effects.length === 0) {
      continue;
    }

    // Центр токена-источника
    const sourceScale = source.token.scale ?? 1;
    const sourceTokenSizePx = sourceScale * cellSize;
    const sourceCenterX = source.token.x + sourceTokenSizePx / 2;
    const sourceCenterY = source.token.y + sourceTokenSizePx / 2;

    // Евклидово расстояние между центрами (в пикселях)
    const dxPx = targetCenterX - sourceCenterX;
    const dyPx = targetCenterY - sourceCenterY;
    const centerDistancePx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

    for (const effect of source.effects) {
      if (!effect.aura || effect.disabled) {
        continue;
      }

      // enter/exit-ауры — разовые (обрабатываются авторитетно на сервере),
      // не транслируются как постоянные ambient-эффекты
      if (effect.areaTrigger === 'enter' || effect.areaTrigger === 'exit') {
        continue;
      }

      // Радиус ауры от центра источника = половина токена + радиус ауры в пикселях
      const auraRadiusPx = (effect.aura.radius / distancePerCell) * cellSize;

      // Аура действует, когда хитбокс цели (круг) пересекается с кругом ауры
      const totalReachPx =
        sourceTokenSizePx / 2 + auraRadiusPx + targetHitboxRadiusPx;

      // Если дистанция между центрами больше суммы радиусов - не достаёт
      if (centerDistancePx > totalReachPx) {
        continue;
      }

      const isSelf = source.token.actorId === targetToken.actorId;

      // Собственные ауры обрабатываются нативно в effectPipeline
      if (isSelf) {
        continue;
      }

      const disposition = getRelativeDisposition(source.token, targetToken);

      if (effect.aura.target === 'allies' && disposition !== 'ally') {
        continue;
      }

      if (effect.aura.target === 'enemies' && disposition !== 'enemy') {
        continue;
      }

      ambientEffects.push({
        ...effect,
        id: `${effect.id}_aura_${source.token.id}`,
      });
    }
  }

  return ambientEffects;
}

/**
 * Достаёт ли круг ауры источника до целевого токена. Евклидов тест по той же
 * формуле, что и `calculateAmbientAuras`: радиус ауры + половина токена-источника
 * + хитбокс цели (0.2 от половины размера).
 *
 * @param sourceToken - токен-источник ауры
 * @param targetToken - целевой токен
 * @param auraRadiusFeet - радиус ауры в футах
 * @param gridSettings - настройки сетки сцены
 * @returns true, если цель в пределах ауры
 */
export function isAuraReachingTarget(
  sourceToken: Token,
  targetToken: Token,
  auraRadiusFeet: number,
  gridSettings: GridSettings,
): boolean {
  const cellSize = gridSettings.cellSize ?? 50;
  const distancePerCell = gridSettings.scale ?? 5;

  const targetScale = targetToken.scale ?? 1;
  const targetTokenSizePx = targetScale * cellSize;
  const targetCenterX = targetToken.x + targetTokenSizePx / 2;
  const targetCenterY = targetToken.y + targetTokenSizePx / 2;
  const targetHitboxRadiusPx = (targetTokenSizePx / 2) * 0.2;

  const sourceScale = sourceToken.scale ?? 1;
  const sourceTokenSizePx = sourceScale * cellSize;
  const sourceCenterX = sourceToken.x + sourceTokenSizePx / 2;
  const sourceCenterY = sourceToken.y + sourceTokenSizePx / 2;

  const dxPx = targetCenterX - sourceCenterX;
  const dyPx = targetCenterY - sourceCenterY;
  const centerDistancePx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

  const auraRadiusPx = (auraRadiusFeet / distancePerCell) * cellSize;

  const totalReachPx =
    sourceTokenSizePx / 2 + auraRadiusPx + targetHitboxRadiusPx;

  return centerDistancePx <= totalReachPx;
}

/** Попадание триггер-ауры (enter/exit) источника на целевой токен */
export interface TriggerAuraHit {
  /** ID токена-источника ауры (для ключа членства) */
  sourceTokenId: string;
  /** Аура-эффект с триггером enter/exit */
  effect: ActiveEffect;
}

/**
 * Собирает enter/exit-ауры источников, достающие до целевого токена сейчас.
 * Применяет те же фильтры, что и ambient: пропуск собственных аур цели и фильтр
 * по отношению (`allies`/`enemies`/`all`). Используется сервером для определения
 * входа/выхода токена в радиус ауры (разовые триггеры).
 *
 * @param targetToken - целевой токен
 * @param sources - токены-источники с их аура-эффектами
 * @param gridSettings - настройки сетки сцены
 * @returns список попаданий триггер-аур на цель
 */
export function collectTriggerAurasForTarget(
  targetToken: Token,
  sources: AuraSourceToken[],
  gridSettings: GridSettings,
): TriggerAuraHit[] {
  const hits: TriggerAuraHit[] = [];

  for (const source of sources) {
    if (source.token.actorId === targetToken.actorId) {
      continue; // собственные ауры не триггерим
    }

    const disposition = getRelativeDisposition(source.token, targetToken);

    for (const effect of source.effects) {
      const aura = effect.aura;

      if (
        !aura
        || effect.disabled
        || (effect.areaTrigger !== 'enter' && effect.areaTrigger !== 'exit')
      ) {
        continue;
      }

      if (aura.target === 'allies' && disposition !== 'ally') {
        continue;
      }

      if (aura.target === 'enemies' && disposition !== 'enemy') {
        continue;
      }

      if (
        isAuraReachingTarget(
          source.token,
          targetToken,
          aura.radius,
          gridSettings,
        )
      ) {
        hits.push({ sourceTokenId: source.token.id, effect });
      }
    }
  }

  return hits;
}
