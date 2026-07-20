<script setup lang="ts">
  import { computed, reactive } from 'vue';

  import { useContextMenu } from '../../composables/useContextMenu';
  import { GAME_FEATURE_MIME } from './constants';
  import ContextMenuOverlay from './ContextMenuOverlay.vue';
  import FeatListItemCompendium from './FeatListItemCompendium.vue';
  import FeatListItemSheet from './FeatListItemSheet.vue';

  /** Минимальный набор полей, необходимых для отображения черты */
  interface FeatDisplayItem {
    id: string;
    name: string;
    nameEn?: string;
    source?: string;
    repeatable?: boolean;
  }

  const props = defineProps<{
    item: FeatDisplayItem;
    showEdit?: boolean;
    showDelete?: boolean;
    showCopy?: boolean;
    showCost?: boolean;
    showWeight?: boolean;
    variant?: 'sheet' | 'compendium';
  }>();

  const isSheet = computed(() => props.variant === 'sheet');

  const emit = defineEmits<{
    click: [];
    edit: [];
    delete: [];
    copy: [];
  }>();

  const contextMenuProps = computed(() => ({
    showCopy: isSheet.value ? false : props.showCopy,
    showEdit: isSheet.value ? false : props.showEdit,
    showDelete: isSheet.value ? false : props.showDelete,
  }));

  const { isMenuOpen, menuX, menuY, openContextMenu, handleAction, closeMenu } =
    useContextMenu(
      reactive({
        get showCopy() {
          return contextMenuProps.value.showCopy;
        },
        get showEdit() {
          return contextMenuProps.value.showEdit;
        },
        get showDelete() {
          return contextMenuProps.value.showDelete;
        },
      }),
      emit,
    );

  /**
   * Обработчик начала перетаскивания черты из компендиума.
   * Сериализует объект Feature в dataTransfer.
   * @param event - событие dragstart
   */
  function handleDragStart(event: DragEvent): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(GAME_FEATURE_MIME, JSON.stringify(props.item));
  }
</script>

<template>
  <div
    draggable="true"
    :class="[
      'flex cursor-grab items-center gap-3 rounded-lg px-3 py-2 transition-colors active:cursor-grabbing',
      isSheet
        ? 'min-h-[44px] bg-accented/30 hover:bg-accented/50'
        : 'bg-elevated/30 hover:bg-accented/40',
    ]"
    @dragstart="handleDragStart"
    @click.left.exact.prevent="emit('click')"
    @contextmenu="openContextMenu"
  >
    <!-- Вид для листа персонажа -->
    <FeatListItemSheet
      v-if="isSheet"
      :item="item"
      :show-edit="showEdit"
      :show-delete="showDelete"
      @edit="emit('edit')"
      @delete="emit('delete')"
    />

    <!-- Классический вид для компендиума -->
    <FeatListItemCompendium
      v-else
      :item="item"
    />
  </div>

  <ContextMenuOverlay
    :is-open="isMenuOpen"
    :pos-x="menuX"
    :pos-y="menuY"
    :show-copy="contextMenuProps.showCopy"
    :show-edit="contextMenuProps.showEdit"
    :show-delete="contextMenuProps.showDelete"
    @action="handleAction"
    @close="closeMenu"
  />
</template>
