<script setup lang="ts">
  import type { ClassDefinition } from '@vtt/shared/system/dnd.js';

  import { useContextMenu } from '../../../composables/useContextMenu';
  import { ABILITY_LABELS, CLASS_DEFINITION_MIME } from '../constants';
  import ContextMenuOverlay from '../ContextMenuOverlay.vue';

  defineOptions({
    inheritAttrs: false,
  });

  const HIT_DIE_COLORS: Record<number, string> = {
    6: 'text-danger',
    8: 'text-orange-400',
    10: 'text-warning',
    12: 'text-success',
  };

  const props = defineProps<{
    /** Данные класса из SRD или мира */
    classDefinition: ClassDefinition;
    showEdit?: boolean;
    showDelete?: boolean;
    showCopy?: boolean;
    showCost?: boolean;
    showWeight?: boolean;
  }>();

  const emit = defineEmits<{
    /** Клик по строке (открыть детальник) */
    click: [];
    edit: [];
    delete: [];
    copy: [];
  }>();

  const { isMenuOpen, menuX, menuY, openContextMenu, handleAction, closeMenu } =
    useContextMenu(props, emit);

  /**
   * Начинает перетаскивание класса на лист персонажа
   * @param event - событие dragstart
   */
  function handleDragStart(event: DragEvent): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = 'copy';

    event.dataTransfer.setData(
      CLASS_DEFINITION_MIME,
      JSON.stringify(props.classDefinition),
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
    <!-- Название и описание -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm font-medium text-highlighted">
          {{ classDefinition.name }}
        </span>

        <span class="text-xs text-dimmed">
          {{ classDefinition.nameEn }}
        </span>
      </div>

      <div class="flex items-center gap-3 text-xs text-muted">
        <!-- Кость хитов -->
        <span :class="HIT_DIE_COLORS[classDefinition.hitDie] ?? 'text-muted'">
          к{{ classDefinition.hitDie }}
        </span>

        <!-- Спасброски -->
        <span class="truncate">
          {{
            classDefinition.savingThrowProficiencies
              .map((ability) => ABILITY_LABELS[ability] ?? ability)
              .join(', ')
          }}
        </span>

        <!-- Заклинатель -->
        <span
          v-if="classDefinition.spellcasting"
          class="text-magic"
        >
          Заклинатель
        </span>
      </div>
    </div>

    <!-- Подсказка перетаскивания -->
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
