<script setup lang="ts">
  import type { BackgroundEquipmentOption } from '@vtt/shared/system/dnd.js';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';

  defineProps<{
    equipmentOptions: BackgroundEquipmentOption[];
  }>();
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h3 class="font-serif text-xl font-medium text-highlighted">
        Стартовое снаряжение
      </h3>

      <p class="text-sm text-muted">
        Выберите один из вариантов стартового снаряжения. Пока что выдача
        предметов не автоматизирована — вам потребуется добавить их из
        справочника в инвентарь вручную после завершения настройки.
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div
        v-for="(option, index) in equipmentOptions"
        :key="index"
        class="flex flex-col rounded-xl border border-default/50 bg-elevated/30 p-4"
      >
        <div
          class="mb-3 flex items-center justify-between border-b border-default/50 pb-2"
        >
          <span
            class="text-xs font-bold tracking-wider text-primary-400 uppercase"
          >
            {{ index === 0 ? 'Вариант А' : 'Вариант Б' }}
          </span>

          <UIcon
            v-if="option.goldAlternative"
            name="tabler:coins"
            class="h-5 w-5 text-warning/80"
          />

          <UIcon
            v-else
            name="tabler:backpack"
            class="h-5 w-5 text-muted"
          />
        </div>

        <div class="flex-1 text-sm text-toned">
          <ItemDescriptionRenderer :content="option.description" />
        </div>

        <div
          v-if="option.goldAlternative"
          class="mt-4 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-warning"
        >
          <UIcon
            name="tabler:coin"
            class="h-5 w-5"
          />

          <span class="text-sm font-semibold"
            >{{ option.goldAlternative }} золотых монет</span
          >
        </div>
      </div>
    </div>
  </div>
</template>
