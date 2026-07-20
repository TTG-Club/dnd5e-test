<script setup lang="ts">
  import { useSourceLabel } from '@/systems/dnd5e/composables/useSourceLabel';

  interface FeatDisplayItem {
    id: string;
    name: string;
    nameEn?: string;
    /** Ключ источника-книги (sources.json) */
    sourceKey?: string;
    repeatable?: boolean;
  }

  const props = defineProps<{
    item: FeatDisplayItem;
  }>();

  const { sourceLabel } = useSourceLabel(() => props.item.sourceKey);
</script>

<template>
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span class="truncate text-sm font-medium text-highlighted">
        {{ item.name }}
      </span>
    </div>

    <div class="mt-0.5 flex items-center gap-3 text-xs text-muted">
      <span
        v-if="sourceLabel"
        class="truncate text-primary-400"
      >
        {{ sourceLabel }}
      </span>

      <UBadge
        v-if="item.repeatable"
        color="warning"
        variant="subtle"
        size="sm"
      >
        Повторяемая
      </UBadge>
    </div>
  </div>
</template>
