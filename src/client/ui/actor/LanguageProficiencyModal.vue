<script setup lang="ts">
  import { LANGUAGE_TYPES } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  /** Блокирующий модал — фиксированный z-index поверх остальных */
  const MODAL_Z_INDEX = Z_INDEX.MODAL_ELEVATED;

  interface Props {
    open: boolean;
    /** Текущие владения языками */
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

  /** Локальная копия владений */
  const localSelected = ref<Set<string>>(new Set());

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        localSelected.value = new Set(props.selected);
      }
    },
  );

  /** Конфигурация панелей */
  const panels = computed(() => [
    {
      key: 'standard' as const,
      title: 'Стандартные',
      color: 'text-gold',
      items: LANGUAGE_TYPES.slice(0, 8),
    },
    {
      key: 'rare' as const,
      title: 'Редкие',
      color: 'text-gold',
      items: LANGUAGE_TYPES.slice(8, 16),
    },
    {
      key: 'exotic' as const,
      title: 'Экзотические',
      color: 'text-gold',
      items: LANGUAGE_TYPES.slice(16),
    },
  ]);

  /**
   * Переключает владение конкретным языком
   */
  function toggleItem(key: string): void {
    const set = new Set(localSelected.value);

    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }

    localSelected.value = set;
  }

  /**
   * Переключает «Все» в категории
   */
  function toggleAllCategory(category: string): void {
    const panel = panels.value.find((playlist) => playlist.key === category);

    if (!panel) {
      return;
    }

    const allKeys = panel.items;
    const set = new Set(localSelected.value);
    const allSelected = allKeys.every((key) => set.has(key));

    if (allSelected) {
      for (const key of allKeys) {
        set.delete(key);
      }
    } else {
      for (const key of allKeys) {
        set.add(key);
      }
    }

    localSelected.value = set;
  }

  /**
   * Проверяет, выбраны ли все элементы категории
   */
  function isAllCategorySelected(category: string): boolean {
    const panel = panels.value.find((playlist) => playlist.key === category);

    if (!panel || panel.items.length === 0) {
      return false;
    }

    return panel.items.every((item) => localSelected.value.has(item));
  }

  /**
   * Применяет выбранные владения
   */
  function applySelection(): void {
    emit('apply', [...localSelected.value]);
    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="800"
    :min-height="350"
    title="Владение языками"
    :z-index="MODAL_Z_INDEX"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <!-- 3 панели: 3 столбца -->
        <div class="grid grid-cols-3 gap-4">
          <div
            v-for="panel in panels"
            :key="panel.key"
            class="rounded-lg border border-default/50 bg-elevated/30 p-2"
          >
            <div
              class="mb-2 border-b border-default/50 pb-2 text-center text-xs font-bold tracking-wider uppercase"
              :class="panel.color"
            >
              {{ panel.title }}
            </div>

            <!-- Заголовок столбца -->
            <div
              class="mb-1 grid items-center px-1"
              style="grid-template-columns: 1fr 16px; gap: 4px"
            >
              <span />

              <UTooltip text="Владение">
                <UIcon
                  name="tabler:circle-dot"
                  class="mx-auto block h-3.5 w-3.5 text-healing"
                />
              </UTooltip>
            </div>

            <!-- Все категории -->
            <div
              class="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-accented/30"
            >
              <span class="flex-1 text-sm font-semibold text-highlighted">
                Все {{ panel.title }}
              </span>

              <UCheckbox
                :model-value="isAllCategorySelected(panel.key)"
                @update:model-value="toggleAllCategory(panel.key)"
              />
            </div>

            <!-- Список -->
            <div
              v-for="item in panel.items"
              :key="item"
              class="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-accented/30"
            >
              <span class="flex-1 truncate text-sm text-toned">
                {{ item }}
              </span>

              <UCheckbox
                :model-value="localSelected.has(item)"
                @update:model-value="toggleItem(item)"
              />
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
