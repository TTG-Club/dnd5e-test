<script setup lang="ts">
  /**
   * Шаг мастера: Спасброски.
   *
   * Информационный шаг — отображает спасброски класса (read-only).
   * При мультиклассе сообщает, что спасброски не изменяются.
   */
  import type { ClassDefinition } from '@vtt/shared/system/dnd.js';

  import { ABILITY_LABELS } from './constants';

  defineProps<{
    classDefinition: ClassDefinition;
    isFirstClass: boolean;
  }>();
</script>

<template>
  <div class="space-y-3">
    <span class="mb-2 block text-sm font-medium text-toned"> Спасброски </span>

    <!-- Первый класс — показываем спасброски -->
    <div v-if="isFirstClass">
      <p class="mb-2 text-sm text-muted">
        Ваш класс даёт владение следующими спасбросками:
      </p>

      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="ability in classDefinition.savingThrowProficiencies"
          :key="ability"
          :label="ABILITY_LABELS[ability] ?? ability"
          color="primary"
          variant="subtle"
          size="md"
        />
      </div>
    </div>

    <!-- Мультикласс / Level Up — спасброски не меняются -->
    <div
      v-else
      class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5"
    >
      <span class="text-sm text-muted">
        Спасброски не изменяются при повышении уровня или мультиклассе.
      </span>
    </div>
  </div>
</template>
