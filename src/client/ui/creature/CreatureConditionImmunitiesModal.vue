<script setup lang="ts">
  import { CONDITIONS } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  /** Блокирующий модал — фиксированный z-index поверх остальных */
  const MODAL_Z_INDEX = Z_INDEX.MODAL_ELEVATED;

  interface Props {
    open: boolean;
    /** Текущие выбранные состояния (иммунитеты) */
    selected: string[];
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [selected: string[]];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  /** Локальная копия выбранных стандартных значений */
  const localSelected = ref<Set<string>>(new Set());

  /** Строка для особых (кастомных) значений */
  const customValues = ref('');

  /** Опции состояний из констант (CONDITIONS) */
  const conditionOptions = computed(() => {
    return CONDITIONS.map((condition) => ({
      key: condition.key,
      label: condition.nameRu,
    }));
  });

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        const standardKeys = new Set<string>(
          conditionOptions.value.map((option) => option.key),
        );

        const selectedSet = new Set<string>();
        const custom: string[] = [];

        for (const item of props.selected) {
          if (standardKeys.has(item)) {
            selectedSet.add(item);
          } else {
            custom.push(item);
          }
        }

        localSelected.value = selectedSet;
        customValues.value = custom.join('; ');
      }
    },
  );

  /**
   * Переключает элемент
   */
  function toggleItem(itemKey: string): void {
    const nextSet = new Set(localSelected.value);

    if (nextSet.has(itemKey)) {
      nextSet.delete(itemKey);
    } else {
      nextSet.add(itemKey);
    }

    localSelected.value = nextSet;
  }

  /**
   * Применяет выбранные иммунитеты
   */
  function applySelection(): void {
    const finalSelection = [...localSelected.value];

    // Парсим особые значения
    if (customValues.value.trim()) {
      const parsedCustom = customValues.value
        .split(';')
        .map((segment) => segment.trim())
        .filter(Boolean);

      finalSelection.push(...parsedCustom);
    }

    emit('apply', finalSelection);
    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="600"
    :min-height="400"
    title="Невосприимчивость к состояниям"
    :z-index="MODAL_Z_INDEX"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-4">
          <!-- Левая колонка: Список состояний -->
          <div
            class="flex flex-col rounded-lg border border-default/50 bg-elevated/30 p-2"
          >
            <div
              class="mb-2 border-b border-default/50 pb-2 text-center text-xs font-bold tracking-wider text-warning uppercase"
            >
              Состояния
            </div>

            <div
              class="custom-scrollbar max-h-[380px] space-y-0.5 overflow-y-auto pr-1"
            >
              <div
                v-for="option in conditionOptions"
                :key="option.key"
                class="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-accented/30"
              >
                <span class="flex-1 truncate text-sm text-toned">
                  {{ option.label }}
                </span>

                <UCheckbox
                  :model-value="localSelected.has(option.key)"
                  @update:model-value="toggleItem(option.key)"
                />
              </div>
            </div>
          </div>

          <!-- Правая колонка: Особое -->
          <div class="flex flex-col gap-4">
            <div
              class="flex flex-col rounded-lg border border-default/50 bg-elevated/30 p-2"
            >
              <div
                class="mb-2 border-b border-default/50 pb-2 text-center text-xs font-bold tracking-wider text-highlighted uppercase"
              >
                Особое
              </div>

              <textarea
                v-model="customValues"
                class="w-full resize-none rounded border-none bg-black/20 p-2 text-sm text-default outline-none placeholder:text-dimmed focus:ring-1 focus:ring-primary"
                rows="3"
                placeholder="от заклинаний школы Иллюзии..."
              />

              <div class="mt-1 text-xs text-dimmed">
                Значения разделяются точкой с запятой.
              </div>
            </div>
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
