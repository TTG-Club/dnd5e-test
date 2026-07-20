<script setup lang="ts">
  import type { BackgroundDefinition } from '@vtt/shared/system/dnd.js';

  import { TOOLS_LABELS } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  const props = defineProps<{
    backgroundDefinition: BackgroundDefinition;
  }>();

  const toolSelections = defineModel<string[]>('toolSelections', {
    default: () => [],
  });

  const neededSelectionsCount = computed(() => {
    return props.backgroundDefinition.toolGrant.choices?.count || 0;
  });

  const fixedToolsCount = computed(() => {
    return props.backgroundDefinition.toolGrant.items.length;
  });

  const currentSelectionCount = computed(() => {
    return toolSelections.value.length - fixedToolsCount.value;
  });

  const options = computed(() => {
    return props.backgroundDefinition.toolGrant.choices?.from || [];
  });

  function toggleTool(tool: string) {
    if (props.backgroundDefinition.toolGrant.items.includes(tool)) {
      return; // Fixed tools cannot be toggled
    }

    const index = toolSelections.value.indexOf(tool);

    if (index === -1) {
      if (neededSelectionsCount.value === 1) {
        toolSelections.value = [
          ...props.backgroundDefinition.toolGrant.items,
          tool,
        ];
      } else if (currentSelectionCount.value < neededSelectionsCount.value) {
        toolSelections.value.push(tool);
      }
    } else {
      toolSelections.value.splice(index, 1);
    }
  }

  function isSelected(tool: string) {
    return toolSelections.value.includes(tool);
  }
</script>

<template>
  <div class="space-y-6">
    <div class="text-center">
      <h3 class="text-lg font-medium text-highlighted">Выбор инструментов</h3>

      <p class="mt-1 text-sm text-muted">
        Выберите дополнительно инструментов:
        <span class="font-bold text-primary-400">{{
          neededSelectionsCount
        }}</span>
        (выбрано: {{ currentSelectionCount }})
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <button
        v-for="tool in options"
        :key="tool"
        class="flex flex-col items-center justify-center gap-2 rounded-lg border p-4 transition-all"
        :class="[
          isSelected(tool)
            ? 'border-primary-500 bg-primary-500/10 text-primary-400 shadow-[0_0_15px_rgba(var(--color-primary-500),0.15)] ring-1 ring-primary-500'
            : 'border-default text-muted hover:border-accented hover:bg-elevated/50',
        ]"
        @click.left.exact.prevent="toggleTool(tool)"
      >
        <span class="text-center text-sm font-medium">
          {{ TOOLS_LABELS[tool] || tool }}
        </span>
      </button>
    </div>
  </div>
</template>
