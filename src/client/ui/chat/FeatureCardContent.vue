<script setup lang="ts">
  import type { Feature } from '@vtt/shared';

  import { computed } from 'vue';

  import CardErrorFallback from '@/shared_ui/components/CardErrorFallback.vue';
  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';

  const props = defineProps<{
    /** Сериализованные данные особенности (JSON-строка) */
    payload: string;
  }>();

  interface ParsedFeature extends Feature {
    type?: string;
  }

  /** Десериализованная особенность */
  const feature = computed<ParsedFeature | null>(() => {
    try {
      return JSON.parse(props.payload) as ParsedFeature;
    } catch {
      return null;
    }
  });

  const isFeat = computed(() => {
    if (!feature.value) {
      return false;
    }

    return (
      feature.value.type === 'feat' || feature.value.featureType === 'feat'
    );
  });
</script>

<template>
  <div
    v-if="feature"
    class="overflow-hidden rounded-lg border border-indigo-500/30"
  >
    <!-- Заголовок -->
    <div class="flex items-center gap-2 bg-elevated/60 px-3 py-2">
      <span
        class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted"
      >
        {{ feature.name }}
      </span>
    </div>

    <!-- Тело карточки -->
    <div class="flex flex-col gap-2 bg-default/40 px-3 py-2">
      <!-- Мета-строка -->
      <div class="flex items-center gap-2 text-xs">
        <span class="font-medium text-indigo-400">
          {{ isFeat ? 'Черта' : 'Особенность' }}
        </span>
      </div>

      <!-- Описание (с кликабельными бросками если будут) -->
      <div
        v-if="feature.description"
        class="max-h-40 overflow-y-auto"
      >
        <ItemDescriptionRenderer :content="feature.description" />
      </div>
    </div>
  </div>

  <!-- Fallback при ошибке десериализации -->
  <CardErrorFallback
    v-else
    message="Ошибка отображения карточки особенности"
  />
</template>
