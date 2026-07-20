<script setup lang="ts">
  import { computed, reactive, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { Z_INDEX } from '@/shared_ui/consts';

  interface EquipmentData {
    name: string;
    description: string;
    cost: string;
  }

  interface Props {
    open: boolean;
    modalId: string;
    title?: string;
    initialName?: string;
    initialDescription?: string;
    initialCost?: string;
    savedPosition?: { x: number; y: number };
    savedSize?: { width: number; height: number };
    onSave?: (data: EquipmentData) => void;
  }

  const props = withDefaults(defineProps<Props>(), {
    title: 'Добавить предмет',
    initialName: '',
    initialDescription: '',
    initialCost: '',
    savedPosition: undefined,
    savedSize: undefined,
    onSave: () => {},
  });

  const { closeModal } = useModalManager();

  const emit = defineEmits<{
    'bring-to-front': [];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (val) => {
      if (!val) {
        handleClose();
      }
    },
  });

  const form = reactive<EquipmentData>({
    name: '',
    description: '',
    cost: '',
  });

  const isFormValid = computed(() => {
    return !!form.name.trim();
  });

  // При открытии — подставляем переданные значения
  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        form.name = props.initialName;
        form.description = props.initialDescription;
        form.cost = props.initialCost;
      }
    },
    { immediate: true },
  );

  function handleClose() {
    closeModal(props.modalId);
  }

  function handleSave() {
    if (!isFormValid.value) {
      return;
    }

    if (props.onSave) {
      props.onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        cost: form.cost.trim(),
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
    :min-height="350"
    :title="title"
    :z-index="Z_INDEX.MODAL_ELEVATED"
    :saved-position="savedPosition"
    :saved-size="savedSize"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <div class="flex h-full w-full flex-col gap-4 px-1 pb-1">
        <!-- Name Input -->
        <UFormField
          label="Название"
          required
          class="w-full shrink-0"
          :ui="{ label: 'after:content-none' }"
        >
          <UInput
            v-model="form.name"
            placeholder="Например: Верёвка (50 футов)"
            size="md"
            autofocus
            class="w-full"
            @keydown.enter.prevent="handleSave"
          />
        </UFormField>

        <!-- Cost Input -->
        <UFormField
          label="Стоимость"
          class="w-full shrink-0"
          :ui="{ label: 'after:content-none' }"
        >
          <UInput
            v-model="form.cost"
            placeholder="Например: 50 зм"
            size="md"
            class="w-full"
            @keydown.enter.prevent="handleSave"
          />
        </UFormField>

        <!-- Description Textarea -->
        <UFormField
          label="Описание"
          class="flex min-h-0 w-full flex-1 flex-col"
          :ui="{ container: 'flex-1 flex flex-col min-h-0 relative mt-1' }"
        >
          <UTextarea
            v-model="form.description"
            placeholder="Подробное описание предмета..."
            size="md"
            class="min-h-[50px] w-full flex-1"
            :ui="{ base: 'h-full resize-none' }"
          />
        </UFormField>
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
          :disabled="!isFormValid"
          @click.left.exact.prevent="handleSave"
        >
          Сохранить
        </UButton>
      </div>
    </template>
  </UDraggableModal>
</template>
