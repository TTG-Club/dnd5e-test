<script setup lang="ts">
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  defineOptions({
    inheritAttrs: false,
  });

  /** Опция выбора цели (сущность на сцене) */
  interface ChooseTargetOption {
    /** ID сущности (актор или существо) */
    id: string;
    /** Отображаемое имя */
    name: string;
  }

  const props = defineProps<{
    open: boolean;
    modalId: string;
    /** Заголовок модалки (напр. "Огненный шар — выбор цели") */
    title: string;
    /** Описание того, что применяется к выбранной цели (напр. "Лечение 2к8") */
    description: string;
    /** Доступные цели на сцене */
    options: ChooseTargetOption[];
    /** Колбэк выбора: id выбранной сущности или null при отмене */
    onConfirm: (entityId: string | null) => void;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'close': [];
    'bringToFront': [];
  }>();

  function close(): void {
    emit('update:open', false);
    emit('close');
  }

  function handlePick(entityId: string): void {
    close();
    props.onConfirm(entityId);
  }

  function handleCancel(): void {
    close();
    props.onConfirm(null);
  }
</script>

<template>
  <UDraggableModal
    :open="props.open"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="320"
    :min-height="200"
    :title="props.title"
    :z-index="Z_INDEX.MODAL_ELEVATED"
    @update:open="(value: boolean) => !value && handleCancel()"
  >
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-toned">
          {{ props.description }}
        </p>

        <div
          v-if="props.options.length > 0"
          class="flex max-h-72 flex-col gap-1 overflow-y-auto"
        >
          <UButton
            v-for="option in props.options"
            :key="option.id"
            color="neutral"
            variant="soft"
            block
            class="justify-start"
            icon="tabler:target"
            @click.left.exact.prevent="handlePick(option.id)"
          >
            {{ option.name }}
          </UButton>
        </div>

        <p
          v-else
          class="text-sm text-muted"
        >
          Нет доступных целей на сцене.
        </p>

        <div class="flex justify-end pt-1">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            @click.left.exact.prevent="handleCancel"
          >
            Отмена
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
