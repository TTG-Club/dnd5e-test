/**
 * Composable загрузки и сопоставления granted-заклинаний.
 *
 * Умения (классов, видов, черт) могут предоставлять заклинания автоматически
 * через поле `grantedSpells` со списком ID заклинаний компендиума.
 * Composable лениво загружает заклинания компендиума с сервера (агрегировано по
 * всем пакам: бандл + скачиваемые + модули) и сопоставляет ID с полными данными
 * заклинаний для отображения в мастерах и записи в лист персонажа.
 */

import type { TypedWebSocketClient } from '@vtt/shared';
import type {
  GrantedSpellSource,
  ResolvedGrantedSpell,
  Spell,
} from '@vtt/shared/system/dnd.js';
import type { Ref } from 'vue';

import { computed, ref, watch } from 'vue';

import { loadCompendiumKind } from '@/core/compendiumDataClient';

import { extractSpellEntries } from './spellCompendium';

/**
 * Composable сопоставления granted-заклинаний с данными компендиума.
 *
 * Загрузка данных запускается лениво — только когда появляется хотя бы
 * одна связь «заклинание → умение» и доступен сокет.
 *
 * @param socket - WebSocket-клиент для запроса данных компендиума
 * @param grantedSpellSources - связи «ID заклинания → умение-источник»
 * @returns `resolvedGrantedSpells` — заклинания с умениями-источниками
 */
export function useGrantedSpellsResolver(
  socket: Ref<TypedWebSocketClient | null>,
  grantedSpellSources: Ref<GrantedSpellSource[]>,
) {
  /** Загруженные заклинания компендиума */
  const compendiumSpells = ref<Spell[]>([]);

  /** Был ли уже отправлен запрос данных (защита от повторных запросов) */
  const hasRequestedData = ref(false);

  /**
   * Загружает заклинания компендиума с сервера (агрегировано по всем пакам).
   *
   * @param socketClient - активный WebSocket-клиент
   */
  async function loadCompendiumSpells(
    socketClient: TypedWebSocketClient,
  ): Promise<void> {
    hasRequestedData.value = true;

    const entries = await loadCompendiumKind(socketClient, 'spell');

    compendiumSpells.value = extractSpellEntries(entries);
  }

  watch(
    [grantedSpellSources, socket],
    ([sources, socketClient]) => {
      if (sources.length === 0 || !socketClient || hasRequestedData.value) {
        return;
      }

      void loadCompendiumSpells(socketClient);
    },
    { immediate: true },
  );

  /** Granted-заклинания, сопоставленные с данными компендиума */
  const resolvedGrantedSpells = computed((): ResolvedGrantedSpell[] => {
    if (
      grantedSpellSources.value.length === 0
      || compendiumSpells.value.length === 0
    ) {
      return [];
    }

    const resolved: ResolvedGrantedSpell[] = [];

    for (const source of grantedSpellSources.value) {
      const spell = compendiumSpells.value.find(
        (entry) => entry.id === source.spellId,
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
