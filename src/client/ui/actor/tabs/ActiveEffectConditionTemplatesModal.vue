<script setup lang="ts">
  import { EFFECT_CONDITION_SUGGESTIONS } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';

  interface Props {
    open: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'select': [condition: string];
    'bring-to-front': [];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const searchQuery = ref('');

  const filteredSuggestions = computed(() => {
    const q = searchQuery.value.toLowerCase().trim();

    if (!q) {
      return EFFECT_CONDITION_SUGGESTIONS;
    }

    return EFFECT_CONDITION_SUGGESTIONS.filter(
      (item) =>
        item.label.toLowerCase().includes(q)
        || item.value.toLowerCase().includes(q),
    );
  });
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    title="Шаблоны условий"
    :initial-width="400"
    :initial-height="500"
    :min-width="300"
    :min-height="400"
    modal-id="effect-condition-templates-modal"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <div class="flex h-full w-full flex-col gap-3 p-2">
        <!-- Поиск -->
        <UInput
          v-model="searchQuery"
          icon="tabler:search"
          placeholder="Поиск по шаблонам..."
          size="sm"
          class="w-full shrink-0"
          clearable
        />

        <!-- Список -->
        <div class="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          <div
            v-for="item in filteredSuggestions"
            :key="item.value"
            class="group flex cursor-pointer flex-col gap-0.5 rounded border border-transparent px-2 py-1.5 transition-colors hover:border-default/50 hover:bg-elevated/60"
            @click.left.exact.prevent="$emit('select', item.value)"
          >
            <div class="text-[13px] font-medium text-highlighted">
              {{ item.label }}
            </div>

            <div class="font-mono text-[11px] text-dimmed">
              {{ item.value }}
            </div>
          </div>

          <div
            v-if="filteredSuggestions.length === 0"
            class="py-8 text-center text-sm text-dimmed"
          >
            Шаблоны не найдены
          </div>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
