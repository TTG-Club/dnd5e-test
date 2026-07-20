<script setup lang="ts">
  import { computed, useSlots } from 'vue';

  /**
   * Переиспользуемый таб-контейнер для модалок ПРОСМОТРА предметов.
   * Вкладки «Основное» и «Эффекты» — всегда; «Бой» — опциональна и
   * показывается только если передан слот `combat`. Каждая модалка наполняет
   * одноимённые слоты своим содержимым.
   */
  const slots = useSlots();

  const tabItems = computed(() => {
    const items: { label: string; slot: string }[] = [
      { label: 'Основное', slot: 'general' },
    ];

    if (slots.combat) {
      items.push({ label: 'Бой', slot: 'combat' });
    }

    items.push({ label: 'Эффекты', slot: 'effects' });

    return items;
  });
</script>

<template>
  <UTabs
    :items="tabItems"
    variant="pill"
    class="flex flex-col"
    :ui="{
      list: 'mb-3',
      trigger: 'flex-1 justify-center',
      content: 'overflow-y-auto max-h-[600px]',
    }"
  >
    <template #general>
      <slot name="general" />
    </template>

    <template
      v-if="slots.combat"
      #combat
    >
      <slot name="combat" />
    </template>

    <template #effects>
      <slot name="effects" />
    </template>
  </UTabs>
</template>
