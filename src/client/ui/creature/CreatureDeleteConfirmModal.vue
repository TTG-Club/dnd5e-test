<script setup lang="ts">
  import type { TypedWebSocketClient } from '@vtt/shared';
  import type { Creature } from '@vtt/shared/system/dnd.js';

  import { useToast } from '@nuxt/ui/composables';
  import { nextTick } from 'vue';

  import { requireSocket } from '@/core/entityUtils';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  interface Props {
    /** Открыта ли модалка */
    open: boolean;
    /** Существо для удаления */
    creature: Creature | null;
    /** WebSocket клиент */
    socket: TypedWebSocketClient | null;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    /** Обновление состояния открытия модалки */
    'update:open': [value: boolean];
    /** Существо успешно удалено */
    'deleted': [];
  }>();

  const toast = useToast();

  /**
   * Выполняет удаление существа
   */
  function executeDelete(): void {
    if (!props.creature) {
      return;
    }

    try {
      requireSocket(props.socket);
      props.socket.emit('creature:deleted', props.creature.id);

      const creatureName = props.creature.name;

      emit('update:open', false);
      emit('deleted');

      nextTick(() => {
        toast.add({
          title: 'Существо удалено',
          description: creatureName,
          color: 'warning',
        });
      });
    } catch (error) {
      console.error('Failed to delete creature:', error);

      toast.add({
        title: 'Ошибка',
        description:
          error instanceof Error
            ? error.message
            : 'Не удалось удалить существо',
        color: 'error',
      });
    }
  }

  /**
   * Закрывает модалку
   */
  function closeModal(): void {
    emit('update:open', false);
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    title="Подтверждение удаления"
    :draggable="false"
    blocking
    :z-index="Z_INDEX.MODAL_ELEVATED"
    :ui="{
      content: 'w-[calc(100vw-2rem)] max-w-md',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="creature"
        class="space-y-4 p-4 text-center"
      >
        <UIcon
          name="tabler:alert-triangle"
          class="mx-auto h-12 w-12 text-warning"
        />

        <p class="text-toned">
          Вы уверены, что хотите удалить существо
          <span class="font-semibold text-highlighted"
            >"{{ creature.name }}"</span
          >
          ?
          <br />

          <span class="text-xs text-dimmed">Это действие нельзя отменить.</span>
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-center gap-3">
        <UButton
          variant="ghost"
          color="neutral"
          @click.left.exact.prevent="closeModal"
        >
          Отмена
        </UButton>

        <UButton
          color="error"
          icon="tabler:trash"
          @click.left.exact.prevent="executeDelete"
        >
          Удалить
        </UButton>
      </div>
    </template>
  </UDraggableModal>
</template>
