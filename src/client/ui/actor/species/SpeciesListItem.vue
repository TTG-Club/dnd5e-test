<script setup lang="ts">
  import type { SpeciesDefinition } from '@vtt/shared/system/dnd.js';

  import { useContextMenu } from '../../../composables/useContextMenu';
  import { CREATURE_TYPE_LABELS, SPECIES_DEFINITION_MIME } from '../constants';
  import ContextMenuOverlay from '../ContextMenuOverlay.vue';

  defineOptions({
    inheritAttrs: false,
  });

  const props = defineProps<{
    speciesDefinition: SpeciesDefinition;
    showEdit?: boolean;
    showDelete?: boolean;
    showCopy?: boolean;
    showCost?: boolean;
    showWeight?: boolean;
  }>();

  const emit = defineEmits<{
    click: [];
    edit: [];
    delete: [];
    copy: [];
  }>();

  const { isMenuOpen, menuX, menuY, openContextMenu, handleAction, closeMenu } =
    useContextMenu(props, emit);

  function handleDragStart(event: DragEvent): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = 'copy';

    event.dataTransfer.setData(
      SPECIES_DEFINITION_MIME,
      JSON.stringify(props.speciesDefinition),
    );
  }
</script>

<template>
  <div
    v-bind="$attrs"
    draggable="true"
    class="group flex cursor-grab items-center gap-3 rounded-lg border border-transparent bg-elevated/30 px-3 py-2 transition-colors hover:border-default/50 hover:bg-accented/40 active:cursor-grabbing"
    @dragstart="handleDragStart"
    @click.left.exact.prevent="emit('click')"
    @contextmenu="openContextMenu"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm font-medium text-highlighted">
          {{ speciesDefinition.name }}
        </span>

        <span class="text-xs text-dimmed">
          {{ speciesDefinition.nameEn }}
        </span>
      </div>

      <div class="flex items-center gap-3 text-xs text-muted">
        <span class="truncate text-primary-400">
          {{
            CREATURE_TYPE_LABELS[speciesDefinition.creatureType]
            || speciesDefinition.creatureType
          }}
        </span>

        <span> Скорость: {{ speciesDefinition.speed.walk }} фт. </span>
      </div>
    </div>

    <UIcon
      name="tabler:grip-vertical"
      class="h-4 w-4 shrink-0 text-dimmed opacity-0 transition-opacity group-hover:opacity-100"
    />
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
