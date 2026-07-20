<script setup lang="ts">
  import type { GameItem } from '@vtt/shared/system/dnd.js';

  import { formatItemCost } from '@vtt/shared';
  import { formatWeaponDamageFormula } from '@vtt/shared/system/dnd.js';

  import { useContextMenu } from '../../composables/useContextMenu';
  import { GAME_ITEM_MIME } from './constants';
  import ContextMenuOverlay from './ContextMenuOverlay.vue';
  import WeaponIcon from './WeaponIcon.vue';

  const props = defineProps<{
    /** Данные предмета */
    item: GameItem;
    /** Показывать «Скопировать в предметы» в контекстном меню */
    showCopy?: boolean;
    /** Показывать «Редактировать» в контекстном меню */
    showEdit?: boolean;
    /** Показывать «Удалить» в контекстном меню */
    showDelete?: boolean;
    /** Показывать стоимость (по умолчанию true) */
    showCost?: boolean;
    /** Показывать вес (по умолчанию true) */
    showWeight?: boolean;
  }>();

  const emit = defineEmits<{
    /** Клик по строке (открыть детальник) */
    click: [];
    /** Скопировать в предметы */
    copy: [];
    /** Редактировать */
    edit: [];
    /** Удалить */
    delete: [];
  }>();

  const { isMenuOpen, menuX, menuY, openContextMenu, handleAction, closeMenu } =
    useContextMenu(props, emit);

  /**
   * Начинает перетаскивание предмета (D&D на актёра)
   * @param event - событие dragstart
   * @param weapon - данные предмета
   */
  function handleDragStart(event: DragEvent, item: GameItem): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(GAME_ITEM_MIME, JSON.stringify(item));
  }
</script>

<template>
  <div
    draggable="true"
    class="flex cursor-grab items-center gap-3 rounded-lg bg-elevated/30 px-3 py-2 transition-colors hover:bg-accented/40 active:cursor-grabbing"
    @click.left.exact.prevent="$emit('click')"
    @contextmenu="openContextMenu"
    @dragstart="handleDragStart($event, item)"
  >
    <!-- Иконка оружия по baseType -->
    <WeaponIcon
      :base-type="item.baseType"
      class="h-4 w-4 shrink-0 text-muted"
    />

    <!-- Название -->
    <span class="flex-1 truncate text-sm font-medium text-highlighted">
      {{ item.name }}
    </span>

    <!-- Тип (дальнобойное/ближний) -->
    <span
      v-if="item.rangeType"
      class="shrink-0 text-xs text-dimmed"
    >
      {{ item.rangeType === 'ranged' ? 'Дальн.' : 'Ближн.' }}
    </span>

    <!-- Урон -->
    <UBadge
      v-if="item.damageParts?.length"
      color="neutral"
      variant="subtle"
      size="sm"
      class="shrink-0 font-mono"
    >
      {{ formatWeaponDamageFormula(item) }}
    </UBadge>

    <!-- Стоимость -->
    <span
      v-if="item.cost && (showCost ?? true)"
      class="shrink-0 text-xs text-gold/80"
    >
      {{ formatItemCost(item.cost) }}
    </span>

    <!-- Вес -->
    <span
      v-if="item.weight && (showWeight ?? true)"
      class="shrink-0 text-xs text-dimmed"
    >
      {{ item.weight }} фнт.
    </span>
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
