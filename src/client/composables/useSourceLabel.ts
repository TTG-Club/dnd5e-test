import type { MaybeRefOrGetter } from 'vue';

import { computed, toValue } from 'vue';

import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

/**
 * Возвращает computed с аббревиатурой источника по его ключу.
 * Используется в детальных модалках (Weapon, Tool, Equipment).
 * @param sourceKey — реактивный ключ источника
 */
export function useSourceLabel(
  sourceKey: MaybeRefOrGetter<string | undefined>,
) {
  const systemDataStore = useSystemDataStore();

  const sourceLabel = computed(() => {
    const key = toValue(sourceKey);

    if (!key) {
      return undefined;
    }

    const source = systemDataStore.sources.find(
      (sourceItem) => sourceItem.key === key,
    );

    return source?.abbreviation;
  });

  return { sourceLabel };
}

/**
 * Возвращает функцию-резолвер подписи источника по ключу. Удобно для списков
 * (подклассы, карточки), где ключ известен только в шаблоне на каждый элемент.
 */
export function useSourceLabels(): {
  getSourceLabel: (sourceKey: string | undefined) => string | undefined;
} {
  const systemDataStore = useSystemDataStore();

  function getSourceLabel(sourceKey: string | undefined): string | undefined {
    if (!sourceKey) {
      return undefined;
    }

    return systemDataStore.sources.find(
      (sourceItem) => sourceItem.key === sourceKey,
    )?.abbreviation;
  }

  return { getSourceLabel };
}
