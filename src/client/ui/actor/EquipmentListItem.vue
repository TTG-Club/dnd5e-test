<script setup lang="ts">
  import type { GameItem } from '@vtt/shared/system/dnd.js';

  import { formatItemCost } from '@vtt/shared';
  import { EQUIPMENT_CATEGORY_ICONS } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import { useContextMenu } from '../../composables/useContextMenu';
  import { GAME_ITEM_MIME } from './constants';
  import ContextMenuOverlay from './ContextMenuOverlay.vue';

  const props = defineProps<{
    /** Данные предмета */
    item: GameItem;
    /** Показывать «Скопировать в предметы» в контекстном меню */
    showCopy?: boolean;
    /** Показывать «Редактировать» в контекстном меню */
    showEdit?: boolean;
    /** Показывать «Удалить» в контекстном меню */
    showDelete?: boolean;
    /** Показывать иконку категории (по умолчанию true) */
    showIcon?: boolean;
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

  const systemDataStore = useSystemDataStore();

  const { isMenuOpen, menuX, menuY, openContextMenu, handleAction, closeMenu } =
    useContextMenu(props, emit);

  /**
   * Отображаемый КД — базовый + магический бонус (`magicBonus`).
   * Для щитов показывает «+N», для остальных — абсолютное значение.
   */
  const displayAC = computed(() => {
    if (!props.item.baseArmorAC) {
      return '';
    }

    const total = props.item.baseArmorAC + (props.item.magicBonus ?? 0);

    if (props.item.equipmentCategory === 'shield') {
      return `+${total}`;
    }

    return String(total);
  });

  /**
   * Иконка по категории экипировки или baseType
   */
  const equipmentIcon = computed(() => {
    const categoryIcon = props.item.equipmentCategory
      ? EQUIPMENT_CATEGORY_ICONS[props.item.equipmentCategory]
      : undefined;

    if (categoryIcon) {
      return categoryIcon;
    }

    if (!props.item.baseType) {
      return 'tabler:shield';
    }

    const found = systemDataStore.armorBaseTypes.find(
      (bt) => bt.key === props.item.baseType,
    );

    return found?.icon ?? 'tabler:shield';
  });

  /**
   * Начинает перетаскивание предмета (D&D на актёра)
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
    <!-- Иконка доспеха -->
    <UIcon
      v-if="showIcon ?? true"
      :name="equipmentIcon"
      class="h-4 w-4 shrink-0 text-muted"
    />

    <!-- Название -->
    <span class="flex-1 truncate text-sm font-medium text-highlighted">
      {{ item.name }}
    </span>

    <!-- Помеха Скрытности -->
    <UIcon
      v-if="item.stealthDisadvantage"
      name="tabler:eye-off"
      class="h-3.5 w-3.5 shrink-0 text-danger/60"
    />

    <!-- КЗ badge -->
    <UBadge
      v-if="displayAC"
      color="neutral"
      variant="subtle"
      size="sm"
      class="shrink-0 font-mono"
    >
      КД {{ displayAC }}
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
