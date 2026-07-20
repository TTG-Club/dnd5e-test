<script setup lang="ts">
  import type { BackgroundDefinition } from '@vtt/shared/system/dnd.js';

  import { computed } from 'vue';

  import { useContextMenu } from '../../../composables/useContextMenu';
  import { useSourceLabels } from '../../../composables/useSourceLabel';
  import { BACKGROUND_DEFINITION_MIME } from '../constants';
  import ContextMenuOverlay from '../ContextMenuOverlay.vue';

  defineOptions({
    inheritAttrs: false,
  });

  const props = defineProps<{
    backgroundDefinition?: BackgroundDefinition;
    item?: BackgroundDefinition;
    showEdit?: boolean;
    showDelete?: boolean;
    showCopy?: boolean;
    showCost?: boolean;
    showWeight?: boolean;
  }>();

  const data = computed(() => props.item ?? props.backgroundDefinition!);

  const { getSourceLabel } = useSourceLabels();

  const emit = defineEmits<{
    click: [];
    edit: [];
    delete: [];
    copy: [];
  }>();

  const { isMenuOpen, menuX, menuY, openContextMenu, handleAction, closeMenu } =
    useContextMenu(props, emit);

  function onDragStart(event: DragEvent) {
    if (event.dataTransfer) {
      event.dataTransfer.setData(
        BACKGROUND_DEFINITION_MIME,
        JSON.stringify(data.value),
      );

      event.dataTransfer.effectAllowed = 'copy';
    }
  }
</script>

<template>
  <div
    v-bind="$attrs"
    draggable="true"
    class="flex cursor-grab items-center gap-3 rounded-lg bg-elevated/30 px-3 py-2 transition-colors hover:bg-accented/40 active:cursor-grabbing"
    @dragstart="onDragStart"
    @click.left.exact.prevent="emit('click')"
    @contextmenu="openContextMenu"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm font-medium text-highlighted">
          {{ data.name }}
        </span>
      </div>

      <div class="mt-0.5 flex items-center gap-3 text-xs text-muted">
        <span
          v-if="getSourceLabel(data.sourceKey)"
          class="truncate text-primary-400"
        >
          {{ getSourceLabel(data.sourceKey) }}
        </span>

        <span v-if="data.skillGrant?.skills?.length"> 2 навыка </span>

        <span
          v-if="
            data.skillGrant?.skills?.length
            && (data.featGrant?.featName || data.featGrant?.featChoices?.length)
          "
          class="text-dimmed"
        >
          &bull;
        </span>

        <span
          v-if="data.featGrant?.featName"
          class="truncate"
        >
          {{ data.featGrant.featName }}
        </span>

        <span
          v-else-if="data.featGrant?.featChoices?.length"
          class="truncate"
        >
          Черта на выбор
        </span>
      </div>
    </div>
  </div>

  <ContextMenuOverlay
    :is-open="isMenuOpen"
    :pos-x="menuX"
    :pos-y="menuY"
    :show-copy="showCopy"
    :show-edit="showEdit"
    :show-delete="showDelete"
    @action="handleAction"
    @close="closeMenu"
  />
</template>
