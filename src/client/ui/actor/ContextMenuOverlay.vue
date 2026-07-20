<script setup lang="ts">
  import type { ContextMenuAction } from '../../composables/useContextMenu';

  import { ContextMenuDangerItem } from '@/shared_ui/components';

  defineProps<{
    /** Показано ли меню */
    isOpen: boolean;
    /** X координата */
    posX: number;
    /** Y координата */
    posY: number;
    /** Показать кнопку «Скопировать» */
    showCopy?: boolean;
    /** Текст кнопки «Скопировать» */
    copyLabel?: string;
    /** Показать кнопку «Редактировать» */
    showEdit?: boolean;
    /** Показать кнопку «Удалить» */
    showDelete?: boolean;
  }>();

  const emit = defineEmits<{
    action: [action: ContextMenuAction];
    close: [];
  }>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-10000"
      @click.left.exact.prevent="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="absolute min-w-[180px] rounded-lg border border-default bg-default py-1 shadow-xl"
        :style="{ left: `${posX}px`, top: `${posY}px` }"
        @click.stop
      >
        <!-- Скопировать -->
        <button
          v-if="showCopy"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="emit('action', 'copy')"
        >
          <UIcon
            name="tabler:copy"
            class="h-4 w-4 text-muted"
          />
          Скопировать в {{ copyLabel || 'предметы' }}
        </button>

        <!-- Редактировать -->
        <button
          v-if="showEdit"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="emit('action', 'edit')"
        >
          <UIcon
            name="tabler:edit"
            class="h-4 w-4 text-muted"
          />
          Редактировать
        </button>

        <!-- Разделитель -->
        <div
          v-if="showDelete && (showCopy || showEdit)"
          class="mx-2 my-1 border-t border-default/50"
        />

        <!-- Удалить -->
        <ContextMenuDangerItem
          v-if="showDelete"
          icon="tabler:trash"
          @click="emit('action', 'delete')"
        >
          Удалить
        </ContextMenuDangerItem>
      </div>
    </div>
  </Teleport>
</template>
