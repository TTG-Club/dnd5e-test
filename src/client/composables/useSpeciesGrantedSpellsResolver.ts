/**
 * Composable пак-ориентированного сопоставления granted-заклинаний вида.
 *
 * В отличие от {@link useGrantedSpellsResolver} (берёт агрегированный
 * дедуплицированный список и матчит по `spellId`), здесь загружаются заклинания
 * ПО ПАКАМ и каждый источник резолвится с учётом предпочтённого пака
 * (`source.packId`): есть такой пак — берём заклинание из него; нет — откат к
 * поиску по `spellId` в любом паке. Это сохраняет переносимость вида.
 */

import type { TypedWebSocketClient } from '@vtt/shared';
import type {
  GrantedSpellSource,
  ResolvedGrantedSpell,
  Spell,
} from '@vtt/shared/system/dnd.js';
import type { Ref } from 'vue';

import { computed, ref, watch } from 'vue';

import { loadCompendiumKindByPack } from '@/core/compendiumDataClient';

import { extractSpellEntries, findSpellInPacks } from './spellCompendium';

/** Заклинания одного пака. */
interface PackSpells {
  packId: string;
  spells: Spell[];
}

/**
 * Резолвит granted-заклинания вида по пакам, уважая предпочтённый пак источника.
 *
 * @param socket - WebSocket-клиент для запроса данных компендиума
 * @param grantedSpellSources - связи «id заклинания (+ пак) → умение-источник»
 * @returns `resolvedGrantedSpells` — заклинания с умениями-источниками
 */
export function useSpeciesGrantedSpellsResolver(
  socket: Ref<TypedWebSocketClient | null>,
  grantedSpellSources: Ref<GrantedSpellSource[]>,
) {
  /** Загруженные заклинания компендиума по пакам */
  const packSpells = ref<PackSpells[]>([]);

  /** Был ли уже отправлен запрос данных (защита от повторных запросов) */
  const hasRequestedData = ref(false);

  /**
   * Загружает заклинания компендиума по пакам.
   *
   * @param socketClient - активный WebSocket-клиент
   */
  async function loadPackSpells(
    socketClient: TypedWebSocketClient,
  ): Promise<void> {
    hasRequestedData.value = true;

    const packs = await loadCompendiumKindByPack(socketClient, 'spell');

    packSpells.value = packs.map((pack) => ({
      packId: pack.packId,
      spells: extractSpellEntries(pack.entries),
    }));
  }

  watch(
    [grantedSpellSources, socket],
    ([sources, socketClient]) => {
      if (sources.length === 0 || !socketClient || hasRequestedData.value) {
        return;
      }

      void loadPackSpells(socketClient);
    },
    { immediate: true },
  );

  /** Granted-заклинания, сопоставленные с данными компендиума */
  const resolvedGrantedSpells = computed((): ResolvedGrantedSpell[] => {
    if (
      grantedSpellSources.value.length === 0
      || packSpells.value.length === 0
    ) {
      return [];
    }

    const resolved: ResolvedGrantedSpell[] = [];

    for (const source of grantedSpellSources.value) {
      const spell = findSpellInPacks(
        packSpells.value,
        source.spellId,
        source.packId,
      );

      if (spell) {
        resolved.push({ spell, featureName: source.featureName });
      }
    }

    return resolved;
  });

  return {
    resolvedGrantedSpells,
  };
}
