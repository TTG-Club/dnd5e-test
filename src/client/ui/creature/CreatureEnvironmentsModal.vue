<script setup lang="ts">
  import { CREATURE_ENVIRONMENTS } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  /** Блокирующий модал — фиксированный z-index поверх остальных */
  const MODAL_Z_INDEX = Z_INDEX.MODAL_ELEVATED;

  interface Props {
    open: boolean;
    /** Выбранные стандартные среды */
    environments: string[];
    /** Особые среды (пользовательский текст) */
    customEnvironments: string;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [environments: string[], customEnvironments: string];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const localSelected = ref<Set<string>>(new Set());
  const localCustom = ref('');

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        localSelected.value = new Set(
          Array.isArray(props.environments) ? props.environments : [],
        );

        localCustom.value = props.customEnvironments || '';
      }
    },
  );

  function toggleItem(itemKey: string): void {
    const nextSet = new Set(localSelected.value);

    if (nextSet.has(itemKey)) {
      nextSet.delete(itemKey);
    } else {
      nextSet.add(itemKey);
    }

    localSelected.value = nextSet;
  }

  function applySelection(): void {
    emit('apply', [...localSelected.value], localCustom.value);
    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="500"
    :min-height="300"
    title="Среда обитания"
    :z-index="MODAL_Z_INDEX"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <!-- Категория (стандартные среды) -->
        <div
          class="flex flex-col rounded-lg border border-default/50 bg-elevated/30 p-2"
        >
          <div
            class="mb-2 border-b border-default/50 pb-2 text-xs font-bold tracking-wider text-warning uppercase"
          >
            Категория
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-1 pr-1">
            <div
              v-for="option in CREATURE_ENVIRONMENTS"
              :key="option.key"
              class="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-accented/30"
            >
              <UCheckbox
                :model-value="localSelected.has(option.key)"
                @update:model-value="toggleItem(option.key)"
              />

              <span class="flex-1 truncate text-sm text-toned">
                {{ option.label }}
              </span>
            </div>
          </div>
        </div>

        <!-- Особая среда -->
        <div
          class="flex flex-col rounded-lg border border-default/50 bg-elevated/30 p-2"
        >
          <div
            class="mb-2 border-b border-default/50 pb-2 text-xs font-bold tracking-wider text-highlighted uppercase"
          >
            Особая
          </div>

          <UInput
            v-model="localCustom"
            class="w-full"
            placeholder="например: Астральный план..."
          />

          <div class="mt-1 text-xs text-dimmed">
            Значения разделяются точкой с запятой.
          </div>
        </div>

        <!-- Кнопки -->
        <div class="flex justify-end gap-2 pt-1">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click.left.exact.prevent="isOpen = false"
          >
            Отмена
          </UButton>

          <UButton
            color="primary"
            size="sm"
            @click.left.exact.prevent="applySelection"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
