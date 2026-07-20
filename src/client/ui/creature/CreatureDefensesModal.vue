<script setup lang="ts">
  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  /** Блокирующий модал — фиксированный z-index поверх остальных */
  const MODAL_Z_INDEX = Z_INDEX.MODAL_ELEVATED;

  /**
   * Свойства физического пробивания.
   */
  const BYPASS_MODIFIERS = [
    { key: 'bypass-adamantine', label: 'Адамантиновое' },
    { key: 'bypass-magical', label: 'Магическое' },
    { key: 'bypass-silvered', label: 'Посеребрённое' },
  ];

  type DefenseCategory = 'vulnerabilities' | 'resistances' | 'immunities';

  interface Props {
    open: boolean;
    /** Категория защит для настройки */
    category: DefenseCategory;
    /** Текущие выбранные защиты */
    selected: string[];
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [category: DefenseCategory, selected: string[]];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const systemDataStore = useSystemDataStore();

  /** Локальная копия выбранных стандартных значений */
  const localSelected = ref<Set<string>>(new Set());

  /** Строка для особых (кастомных) значений */
  const customValues = ref('');

  /** Опции типов урона из БД */
  const damageOptions = computed(() => {
    return systemDataStore.damageTypes
      .filter((dt) => dt.key !== 'choice')
      .map((dt) => ({ key: dt.key, label: dt.name }));
  });

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        const standardKeys = new Set([
          ...damageOptions.value.map((option) => option.key),
          ...BYPASS_MODIFIERS.map((option) => option.key),
        ]);

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

  /** Конфигурация окна под текущую категорию */
  const modalConfig = computed(() => {
    switch (props.category) {
      case 'vulnerabilities':
        return { title: 'Уязвимости', color: 'text-error' };
      case 'resistances':
        return { title: 'Сопротивления', color: 'text-info' };
      case 'immunities':
        return { title: 'Иммунитеты', color: 'text-warning' };
      default:
        return { title: 'Защиты', color: 'text-default' };
    }
  });

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
   * Применяет выбранные защиты
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

    emit('apply', props.category, finalSelection);
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
    :title="modalConfig.title"
    :z-index="MODAL_Z_INDEX"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-4">
          <!-- Левая колонка: Типы урона -->
          <div
            class="flex flex-col rounded-lg border border-default/50 bg-elevated/30 p-2"
          >
            <div
              class="mb-2 border-b border-default/50 pb-2 text-center text-xs font-bold tracking-wider uppercase"
              :class="modalConfig.color"
            >
              Типы урона
            </div>

            <div
              class="custom-scrollbar max-h-[380px] space-y-0.5 overflow-y-auto pr-1"
            >
              <div
                v-for="option in damageOptions"
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

          <!-- Правая колонка: Пробивание и Особое -->
          <div class="flex flex-col gap-4">
            <div
              class="flex flex-col rounded-lg border border-default/50 bg-elevated/30 p-2"
            >
              <div
                class="mb-2 border-b border-default/50 pb-2 text-center text-xs font-bold tracking-wider text-highlighted uppercase"
              >
                Физическое пробивание
              </div>

              <div class="mb-2 text-xs text-dimmed">
                Предметы с этим свойством игнорируют устойчивость к физическому
                урону.
              </div>

              <div class="space-y-0.5">
                <div
                  v-for="option in BYPASS_MODIFIERS"
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
                placeholder="от немагического оружия..."
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
