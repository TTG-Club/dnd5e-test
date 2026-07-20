<script setup lang="ts">
  import type { DamagePart } from '@vtt/shared';

  import { describeDamagePart } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  const props = defineProps<{
    /** Части урона/лечения для отображения */
    parts: DamagePart[];
  }>();

  const systemDataStore = useSystemDataStore();

  /** Карта key → локализованное название типа урона */
  const damageTypeMap = computed(() => {
    const map = new Map<string, string>();

    for (const damageType of systemDataStore.damageTypes) {
      map.set(damageType.key, damageType.name);
    }

    return map;
  });

  /**
   * Части с готовыми подписями: «Урон»/«Лечение», формула без токенов и
   * локализованные типы (несколько — через « + »; временные ХП помечаются).
   */
  const items = computed(() =>
    props.parts.map((part) => {
      const info = describeDamagePart(part);

      const labels = info.types.map(
        (type) => damageTypeMap.value.get(type) ?? type,
      );

      if (info.isTemp) {
        labels.push('временные ХП');
      }

      return {
        formula: info.formula,
        isHealing: info.isHealing,
        kind: info.isHealing ? 'Лечение' : 'Урон',
        typeLabel: labels.join(' + '),
      };
    }),
  );
</script>

<template>
  <div
    v-for="(item, index) in items"
    :key="index"
  >
    <span class="block text-xs text-dimmed">{{ item.kind }}</span>

    <p class="flex items-center gap-1.5 text-highlighted">
      <span
        class="font-mono font-semibold"
        :class="item.isHealing ? 'text-healing' : 'text-danger-muted'"
        >{{ item.formula }}</span
      >

      <span
        v-if="item.typeLabel"
        class="text-xs text-muted"
        >{{ item.typeLabel }}</span
      >
    </p>
  </div>
</template>
