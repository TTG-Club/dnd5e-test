<script setup lang="ts">
  import { computed, reactive, watch } from 'vue';

  import JournalEditor from '@/shared_ui/components/JournalEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';

  interface FeatureChoice {
    key: string;
    name: string;
    description: string;
  }

  interface EntityData {
    name: string;
    description: string;
    level?: number;
    selectedChoiceKey?: string;
  }

  interface Props {
    open: boolean;
    modalId: string;
    title?: string;
    initialName?: string;
    initialDescription?: string;
    initialLevel?: number;
    showLevel?: boolean;
    /** Варианты для выбора (напр. наследие драконов) */
    choices?: FeatureChoice[];
    /** Ключ текущего выбранного варианта */
    initialChoiceKey?: string;
    /** Заголовок для секции выбора */
    choiceLabel?: string;
    /** Запретить редактирование названия и описания (для SRD-особенностей) */
    readonlyCore?: boolean;
    zIndex?: number;
    savedPosition?: { x: number; y: number };
    savedSize?: { width: number; height: number };
    onSave?: (data: EntityData) => void;
  }

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'bring-to-front': [];
  }>();

  const props = withDefaults(defineProps<Props>(), {
    title: 'Добавление сущности',
    initialName: '',
    initialDescription: '',
    initialLevel: undefined,
    showLevel: false,
    choices: undefined,
    initialChoiceKey: undefined,
    choiceLabel: 'Выберите вариант',
    readonlyCore: false,
    zIndex: undefined,
    savedPosition: undefined,
    savedSize: undefined,
    onSave: () => {},
  });

  const { closeModal } = useModalManager();

  const isOpen = computed({
    get: () => props.open,
    set: (val) => {
      if (!val) {
        handleClose();
      }
    },
  });

  const form = reactive<EntityData>({
    name: '',
    description: '',
    level: 1,
    selectedChoiceKey: undefined,
  });

  /**
   * Текущий выбранный вариант из choices
   */
  const selectedChoice = computed(() => {
    if (!props.choices || !form.selectedChoiceKey) {
      return undefined;
    }

    return props.choices.find(
      (choice) => choice.key === form.selectedChoiceKey,
    );
  });

  /**
   * Список вариантов для USelectMenu
   */
  const choiceItems = computed(() => {
    if (!props.choices) {
      return [];
    }

    return props.choices.map((choice) => ({
      value: choice.key,
      label: choice.name,
    }));
  });

  // При открытии — подставляем переданные значения
  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        form.name = props.initialName;
        form.description = props.initialDescription;
        form.level = props.initialLevel ?? 1;
        form.selectedChoiceKey = props.initialChoiceKey;
      }
    },
    { immediate: true },
  );

  function handleClose() {
    closeModal(props.modalId);
  }

  /**
   * Обрабатывает выбор варианта из выпадающего списка
   */
  function handleChoiceSelect(choiceKey: string) {
    form.selectedChoiceKey = choiceKey;
  }

  function handleSave() {
    const name = form.name.trim();

    if (!name) {
      return;
    }

    if (props.onSave) {
      props.onSave({
        name,
        description: form.description.trim(),
        level: props.showLevel ? form.level : undefined,
        selectedChoiceKey: form.selectedChoiceKey,
      });
    }

    handleClose();
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="true"
    :resizable="true"
    :blocking="false"
    :min-width="450"
    :min-height="400"
    :title="title"
    :z-index="zIndex"
    :saved-position="savedPosition"
    :saved-size="savedSize"
    @on-drag-start="emit('bring-to-front')"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <div class="flex h-full w-full flex-col gap-4 px-1 pb-1">
        <div class="flex w-full gap-4">
          <UFormField
            label="Название"
            class="flex-1"
          >
            <UInput
              v-model="form.name"
              placeholder="Например: Огненный шар, Зелье лечения..."
              size="md"
              autofocus
              :readonly="readonlyCore"
              class="w-full"
              @keydown.enter.prevent="handleSave"
            />
          </UFormField>

          <UFormField
            v-if="showLevel"
            label="Уровень"
            class="w-32"
          >
            <UInput
              v-model.number="form.level"
              type="number"
              min="1"
              max="20"
              size="md"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Секция выбора (для особенностей с choices) -->
        <div
          v-if="choices && choices.length > 0"
          class="flex flex-col gap-2 rounded-lg bg-elevated/40 p-3"
        >
          <span class="text-sm font-medium text-highlighted">
            {{ choiceLabel }}
          </span>

          <USelectMenu
            :model-value="form.selectedChoiceKey"
            :items="choiceItems"
            value-key="value"
            label-key="label"
            placeholder="Выберите вариант..."
            @update:model-value="handleChoiceSelect"
          />

          <!-- Описание выбранного варианта -->
          <div
            v-if="selectedChoice"
            class="mt-1 rounded-md bg-default/50 px-3 py-2 text-sm text-muted"
          >
            {{ selectedChoice.description }}
          </div>
        </div>

        <div class="flex min-h-[250px] flex-1 flex-col gap-1.5">
          <span class="text-sm font-medium text-highlighted">Описание</span>

          <JournalEditor
            v-model="form.description"
            class="flex-1"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-3">
        <UButton
          variant="ghost"
          color="neutral"
          @click.left.exact.prevent="handleClose"
        >
          Отмена
        </UButton>

        <UButton
          color="primary"
          :disabled="!form.name.trim()"
          @click.left.exact.prevent="handleSave"
        >
          Сохранить
        </UButton>
      </div>
    </template>
  </UDraggableModal>
</template>
