<script setup lang="ts">
  import type { ActiveEffect } from '@vtt/shared/system/dnd.js';

  defineProps<{
    /** Эффекты предмета для отображения (только просмотр, без редактирования) */
    effects: ActiveEffect[];
  }>();
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-if="effects.length === 0"
      class="rounded-lg border border-dashed border-default p-3 text-center text-xs text-dimmed italic"
    >
      Нет эффектов
    </div>

    <div
      v-else
      class="space-y-1"
    >
      <div
        v-for="effect in effects"
        :key="effect.id"
        class="flex min-h-[44px] items-center gap-2 rounded-lg bg-elevated/50 p-2"
        :class="{ 'opacity-50 grayscale': effect.disabled }"
      >
        <UIcon
          :name="effect.icon || 'tabler:bolt'"
          class="size-5 shrink-0"
          :class="effect.disabled ? 'text-dimmed' : 'text-gold'"
        />

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-sm leading-none font-medium">
            <span class="truncate">{{ effect.name }}</span>

            <UBadge
              v-if="effect.disabled"
              label="выключен"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>

          <div
            v-if="effect.description"
            class="mt-0.5 text-[10px] text-dimmed"
          >
            {{ effect.description }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
