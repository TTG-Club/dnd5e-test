<script setup lang="ts">
  import type { TypedWebSocketClient } from '@vtt/shared';
  import type { Actor, GameItem } from '@vtt/shared/system/dnd.js';

  import { generateId } from '@vtt/shared';
  import { computed, ref, watch } from 'vue';

  import { requireSocket } from '@/core/entityUtils';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useWorldStore } from '@/stores/worldStore';

  import { GAME_ITEM_MIME } from './constants';
  import ActorEquipmentTab from './tabs/ActorEquipmentTab.vue';

  interface Props {
    open: boolean;
    actorId: string;
    worldId: string;
    socket: TypedWebSocketClient | null;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
  }>();

  const worldStore = useWorldStore();

  /** Реактивный актёр из worldStore (source of truth) */
  const storeActor = computed(() => {
    const world = worldStore.getWorldById(props.worldId);

    return (
      world?.actors.find((actor: Actor) => actor.id === props.actorId) ?? null
    );
  });

  /** Локальная копия актёра для компонента (синхронизируется из store) */
  const localActor = ref<Actor | null>(null);

  watch(
    storeActor,
    (newActor) => {
      if (newActor) {
        localActor.value = JSON.parse(JSON.stringify(newActor));
      }
    },
    { immediate: true, deep: true },
  );

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  /**
   * Обработчик обновления актёра из дочернего компонента.
   * Применяет обновления к локальной копии.
   *
   * @param updates - частичные обновления актёра
   */
  function handleActorUpdate(updates: Partial<Actor>): void {
    if (!localActor.value) {
      return;
    }

    Object.assign(localActor.value, updates);
  }

  /**
   * Немедленное сохранение актёра на сервер.
   * Вызывается из ActorEquipmentTab при экипировке/удалении предметов.
   */
  function handleImmediateSave(): void {
    if (!localActor.value || !props.socket) {
      return;
    }

    try {
      requireSocket(props.socket);

      props.socket.emit('actor:updated', localActor.value);
    } catch (error) {
      console.error('[QuickEquipmentModal] Immediate save failed:', error);
    }
  }

  // --- Drag & Drop из компендиума ---

  /**
   * Разрешает drop предметов из компендиума.
   */
  function handleDragOver(event: DragEvent): void {
    if (!event.dataTransfer) {
      return;
    }

    const types = Array.from(event.dataTransfer.types);

    if (types.includes(GAME_ITEM_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function isGameItem(value: unknown): value is GameItem {
    return (
      isRecord(value)
      && typeof value.id === 'string'
      && typeof value.name === 'string'
      && typeof value.description === 'string'
      && typeof value.type === 'string'
    );
  }

  /**
   * Обрабатывает drop предмета из компендиума.
   * Добавляет предмет в инвентарь актора и сохраняет на сервер.
   */
  function handleDrop(event: DragEvent): void {
    if (!localActor.value || !event.dataTransfer) {
      return;
    }

    const equipData = event.dataTransfer.getData(GAME_ITEM_MIME);

    if (!equipData) {
      return;
    }

    event.preventDefault();

    try {
      const parsedItem: unknown = JSON.parse(equipData);

      if (!isGameItem(parsedItem)) {
        return;
      }

      const alreadyExists = localActor.value.equipment.some(
        (item) => item.id === parsedItem.id,
      );

      if (alreadyExists) {
        return;
      }

      const newItem: GameItem = {
        ...parsedItem,
        id: generateId('eq'),
        isReadOnly: false,
        equipped: false,
      };

      localActor.value.equipment = [...localActor.value.equipment, newItem];
      handleImmediateSave();
    } catch {
      /* ошибка парсинга — игнорируем */
    }
  }

  /** Ref на внутренний UDraggableModal */
  const draggableModalRef = ref<InstanceType<typeof UDraggableModal> | null>(
    null,
  );

  defineExpose({
    /** Поднимает окно выше всех остальных */
    bringToFront: () => draggableModalRef.value?.bringToFront(),
    /** Текущий z-index окна (Vue auto-unwrap из expose) */
    localZIndex: computed(
      () => draggableModalRef.value?.localZIndex as number | undefined,
    ),
  });
</script>

<template>
  <UDraggableModal
    ref="draggableModalRef"
    v-model:open="isOpen"
    :draggable="true"
    :resizable="true"
    :min-width="400"
    :min-height="300"
    :initial-width="520"
    initial-height="70vh"
    :title="`Инвентарь — ${localActor?.name ?? ''}`"
  >
    <template #body>
      <div
        class="flex h-full flex-col"
        @dragover="handleDragOver"
        @drop="handleDrop"
      >
        <ActorEquipmentTab
          v-if="localActor"
          :actor="localActor"
          :is-edit-mode="false"
          @update:actor="handleActorUpdate"
          @immediate-save="handleImmediateSave"
        />
      </div>
    </template>
  </UDraggableModal>
</template>
