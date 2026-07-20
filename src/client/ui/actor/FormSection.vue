<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      title?: string;
      /** Цвет заголовка: danger, warning, info, primary, success, source, arcane, healing, gold, muted и т.д. */
      titleColor?: string;
      /** Есть ли контент у секции (если false, то паддинги будут симметричными) */
      hasContent?: boolean;
    }>(),
    {
      title: undefined,
      titleColor: undefined,
      hasContent: true,
    },
  );
</script>

<template>
  <div
    class="rounded-lg border border-muted/60 bg-elevated/20 px-3 pt-2 transition-all duration-200"
    :class="props.hasContent ? 'pb-3' : 'pb-2'"
  >
    <!-- Заголовок -->
    <div
      v-if="title || $slots.header || $slots.actions"
      class="flex h-6 items-center justify-between"
      :class="props.hasContent ? 'mb-2' : 'mb-0'"
    >
      <slot name="header">
        <span
          v-if="title"
          class="text-xs font-semibold tracking-wide"
          :class="[
            titleColor === 'danger' && 'text-danger',
            titleColor === 'warning' && 'text-warning',
            titleColor === 'info' && 'text-info',
            titleColor === 'primary' && 'text-primary',
            titleColor === 'success' && 'text-success',
            titleColor === 'source' && 'text-source',
            titleColor === 'arcane' && 'text-arcane',
            titleColor === 'healing' && 'text-healing',
            titleColor === 'gold' && 'text-gold',
            !titleColor && 'text-dimmed',
          ]"
        >
          {{ title }}
        </span>
      </slot>

      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <!-- Контент -->
    <div class="w-full">
      <slot />
    </div>
  </div>
</template>
