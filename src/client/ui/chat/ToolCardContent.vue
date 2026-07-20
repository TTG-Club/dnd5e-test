<script setup lang="ts">
  import type { GameItem } from '@vtt/shared/system/dnd.js';

  import { formatItemCost } from '@vtt/shared';
  import { RARITY_COLORS, RARITY_OPTIONS } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import CardErrorFallback from '@/shared_ui/components/CardErrorFallback.vue';
  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';

  import { RARITY_BORDER_CLASSES, RARITY_BORDER_DEFAULT } from './consts';

  const props = defineProps<{
    /** Сериализованные данные предмета (JSON-строка) */
    payload: string;
  }>();

  /** Десериализованный предмет */
  const item = computed<GameItem | null>(() => {
    try {
      return JSON.parse(props.payload) as GameItem;
    } catch {
      return null;
    }
  });

  /** Цвет рамки карточки по редкости */
  const rarityBorderClass = computed(() => {
    const rarity = item.value?.rarity;

    if (!rarity || rarity === 'none') {
      return RARITY_BORDER_DEFAULT;
    }

    return RARITY_BORDER_CLASSES[rarity] ?? RARITY_BORDER_DEFAULT;
  });

  /** Название редкости */
  const rarityLabel = computed(() => {
    const rarity = item.value?.rarity;

    if (!rarity || rarity === 'none') {
      return undefined;
    }

    return RARITY_OPTIONS.find((opt) => opt.value === rarity)?.label;
  });
</script>

<template>
  <div
    v-if="item"
    class="overflow-hidden rounded-lg border"
    :class="rarityBorderClass"
  >
    <!-- Заголовок -->
    <div class="flex items-center gap-2 bg-elevated/60 px-3 py-2">
      <UIcon
        name="tabler:tools"
        class="size-4 shrink-0 text-primary-400"
      />

      <span
        class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted"
      >
        {{ item.name }}
      </span>

      <UBadge
        v-if="item.isMagical"
        label="✨"
        color="primary"
        variant="subtle"
        size="xs"
      />
    </div>

    <!-- Тело карточки -->
    <div class="flex flex-col gap-2 bg-default/40 px-3 py-2">
      <!-- Мета-строка: тип + редкость -->
      <div class="flex items-center gap-2 text-xs">
        <span class="text-muted">Инструмент</span>

        <span
          v-if="rarityLabel"
          :class="RARITY_COLORS[item.rarity] ?? 'text-muted'"
        >
          {{ rarityLabel }}
        </span>
      </div>

      <!-- Ключевые характеристики -->
      <div class="flex flex-wrap gap-3 text-xs">
        <!-- Бонус -->
        <div
          v-if="item.toolBonus"
          class="flex items-center gap-1"
        >
          <span class="text-dimmed">Бонус:</span>

          <span class="font-mono font-semibold text-info-muted">
            +{{ item.toolBonus }}
          </span>
        </div>

        <!-- Стоимость -->
        <div
          v-if="item.cost"
          class="flex items-center gap-1"
        >
          <span class="text-dimmed">Цена:</span>

          <span class="text-gold">{{ formatItemCost(item.cost) }}</span>
        </div>

        <!-- Вес -->
        <div
          v-if="item.weight"
          class="flex items-center gap-1"
        >
          <span class="text-dimmed">Вес:</span>

          <span class="text-toned">{{ item.weight }} фнт.</span>
        </div>
      </div>

      <!-- Описание (с кликабельными бросками) -->
      <div
        v-if="item.description"
        class="max-h-40 overflow-y-auto"
      >
        <ItemDescriptionRenderer :content="item.description" />
      </div>
    </div>
  </div>

  <!-- Fallback при ошибке десериализации -->
  <CardErrorFallback
    v-else
    message="Ошибка отображения карточки"
  />
</template>
