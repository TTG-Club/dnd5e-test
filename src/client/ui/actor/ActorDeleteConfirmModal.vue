<script setup lang="ts">
  import type { TypedWebSocketClient } from '@vtt/shared';
  import type { Actor } from '@vtt/shared/system/dnd.js';

  import { useToast } from '@nuxt/ui/composables';
  import { nextTick } from 'vue';

  import { requireSocket } from '@/core/entityUtils';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  interface Props {
    /** Открыта ли модалка */
    open: boolean;
    /** Актор для удаления */
    actor: Actor | null;
    /** WebSocket клиент */
    socket: TypedWebSocketClient | null;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    /** Обновление состояния открытия модалки */
    'update:open': [value: boolean];
    /** Актор успешно удалён */
    'deleted': [];
  }>();

  const toast = useToast();

  /**
   * Выполняет удаление персонажа
   */
  function executeDelete(): void {
    if (!props.actor) {
      return;
    }

    try {
      requireSocket(props.socket);
      props.socket.emit('actor:deleted', props.actor.id);

      const actorName = props.actor.name;

      emit('update:open', false);
      emit('deleted');

      nextTick(() => {
        toast.add({
          title: 'Персонаж удалён',
          description: actorName,
          color: 'warning',
        });
      });
    } catch (error) {
      console.error('Failed to delete actor:', error);

      toast.add({
        title: 'Ошибка',
        description:
          error instanceof Error
            ? error.message
            : 'Не удалось удалить персонажа',
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
    :ui="{
      overlay: `z-${Z_INDEX.MODAL_ELEVATED}`,
      content: `w-[calc(100vw-2rem)] max-w-md z-${Z_INDEX.MODAL_ELEVATED}`,
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="actor"
        class="space-y-4 p-4 text-center"
      >
        <UIcon
          name="tabler:alert-triangle"
          class="mx-auto h-12 w-12 text-warning"
        />

        <p class="text-toned">
          Вы уверены, что хотите удалить персонажа
          <span class="font-semibold text-highlighted">"{{ actor.name }}"</span>
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
