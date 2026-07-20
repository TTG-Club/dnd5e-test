<script setup lang="ts">
  /**
   * Элемент списка существ в компендиуме.
   * Отображает имя, подзаголовок (header) и показатель опасности.
   * Поддерживает контекстное меню (ПКМ) для копирования.
   */
  import { useContextMenu } from '@/systems/dnd5e/composables/useContextMenu';
  import ContextMenuOverlay from '@/systems/dnd5e/ui/actor/ContextMenuOverlay.vue';

  interface Props {
    /** Название существа */
    name: string;
    /** Английское название существа */
    nameEn?: string;
    /** Подзаголовок (размер, тип, мировоззрение) */
    header?: string;
    /** Показатель опасности (из system.challengeRating) */
    challengeRating?: string;
    /** Показать кнопку «Скопировать» в ПКМ-меню */
    showCopy?: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    click: [];
    copy: [];
    edit: [];
    delete: [];
  }>();

  const { isMenuOpen, menuX, menuY, openContextMenu, handleAction, closeMenu } =
    useContextMenu(props, emit);
</script>

<template>
  <div
    class="flex cursor-pointer items-center gap-3 rounded-lg bg-elevated/30 px-3 py-2 transition-colors hover:bg-accented/40"
    @click.left.exact.prevent="emit('click')"
    @contextmenu="openContextMenu"
  >
    <UIcon
      name="tabler:alien"
      class="size-5 shrink-0 text-muted"
    />

    <div class="min-w-0 flex-1">
      <div class="truncate text-sm font-medium text-toned">
        {{ name }}
        <span
          v-if="nameEn"
          class="ml-1 text-xs font-normal text-muted"
          >/ {{ nameEn }}</span
        >
      </div>

      <div
        v-if="header"
        class="truncate text-xs text-dimmed"
      >
        {{ header }}
      </div>
    </div>

    <UBadge
      v-if="challengeRating"
      color="neutral"
      variant="subtle"
      size="xs"
      class="shrink-0"
    >
      ПО {{ challengeRating }}
    </UBadge>
  </div>

  <ContextMenuOverlay
    :is-open="isMenuOpen"
    :pos-x="menuX"
    :pos-y="menuY"
    :show-copy="showCopy"
    copy-label="существа"
    @action="handleAction"
    @close="closeMenu"
  />
</template>
