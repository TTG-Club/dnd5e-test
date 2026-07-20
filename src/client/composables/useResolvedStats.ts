import type {
  ActiveEffect,
  Actor,
  Creature,
  ResolvedActorStats,
} from '@vtt/shared/system/dnd.js';
import type { Ref } from 'vue';

import { systemRegistry } from '@vtt/shared';
import { isDnDEffect, resolveActorStats } from '@vtt/shared/system/dnd.js';
import { computed, ref } from 'vue';

import { useAuraStore } from '@/stores/auraStore';

export const globalDebugError = ref<string | null>(null);

/**
 * Хук для реактивного получения итоговых статов актера
 * с учетом всех Active Effects и базовых формул системы.
 */
export function useResolvedStats(
  actorRef: Ref<Actor | Creature | null | undefined>,
) {
  const auraStore = useAuraStore();

  const combinedEffects = computed(() => {
    const actor = actorRef.value;

    if (!actor) {
      return [];
    }

    const system = systemRegistry.getSystem();

    const nativeEffectsRaw = system.collectActiveEffects
      ? system.collectActiveEffects(actor)
      : [];

    const nativeEffects = nativeEffectsRaw.filter(
      (eff): eff is ActiveEffect =>
        typeof eff === 'object'
        && eff !== null
        && 'id' in eff
        && typeof eff.id === 'string'
        && 'name' in eff
        && typeof eff.name === 'string',
    );

    // Ambient-ауры контракт отдаёт нейтральной базой — сужаем к D&D-форме.
    const ambient = auraStore
      .getAmbientEffectsForActor(actor.id)
      .filter(isDnDEffect);

    const safeAmbient = ambient.filter((ambientEff: ActiveEffect) => {
      const ambientBaseId = ambientEff.id.split('_aura_')[0];

      return !nativeEffects.some(
        (nativeEff) =>
          nativeEff.id === ambientBaseId
          || (nativeEff.name || '').trim().toLowerCase()
            === (ambientEff.name || '').trim().toLowerCase(),
      );
    });

    return [...nativeEffects, ...safeAmbient];
  });

  /**
   * Итоговые вычисленные статы. Пересчитываются при изменении
   * базовых атрибутов актера или списка активных эффектов.
   */
  const resolvedStats = computed<ResolvedActorStats | undefined>(() => {
    const actor = actorRef.value;

    if (!actor) {
      return undefined;
    }

    try {
      return resolveActorStats(actor, combinedEffects.value);
    } catch (error: unknown) {
      console.error('[useResolvedStats] Ошибка разрешения эффектов:', error);

      return undefined;
    }
  });

  return {
    resolvedStats,
    combinedEffects,
  };
}
