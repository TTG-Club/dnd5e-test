<script lang="ts">
  /** Семантические цвета бейджа Nuxt UI */
  export type ItemPropertyBadgeColor =
    | 'primary'
    | 'secondary'
    | 'success'
    | 'info'
    | 'warning'
    | 'error'
    | 'neutral';

  /** Одно свойство предмета для отображения бейджем с тултипом-описанием */
  export interface ItemPropertyBadge {
    /** Уникальный ключ свойства */
    key: string;
    /** Отображаемое название */
    label: string;
    /** Семантический цвет бейджа */
    color: ItemPropertyBadgeColor;
    /** Описание свойства для тултипа */
    description: string;
  }
</script>

<script setup lang="ts">
  defineProps<{
    /** Список свойств для отображения */
    properties: ItemPropertyBadge[];
    /** Заголовок секции */
    title?: string;
  }>();
</script>

<template>
  <div v-if="properties.length > 0">
    <span
      class="mb-1.5 block text-xs font-semibold tracking-wider text-dimmed uppercase"
    >
      {{ title ?? 'Свойства' }}
    </span>

    <div class="flex flex-wrap gap-1.5">
      <UPopover
        v-for="property in properties"
        :key="property.key"
        mode="hover"
        :open-delay="300"
        :ui="{ content: 'max-w-xs p-3' }"
      >
        <UBadge
          :color="property.color"
          variant="subtle"
          size="sm"
        >
          {{ property.label }}
        </UBadge>

        <template #content>
          <p class="text-xs leading-relaxed text-toned">
            {{ property.description }}
          </p>
        </template>
      </UPopover>
    </div>
  </div>
</template>
