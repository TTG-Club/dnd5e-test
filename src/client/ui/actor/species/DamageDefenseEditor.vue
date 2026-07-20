<script setup lang="ts">
  import type { DamageDefenseEntry } from '@vtt/shared/system/dnd.js';

  import { typedObjectEntries } from '@vtt/shared';
  import {
    DAMAGE_DEFENSE_KIND_LABELS,
    DAMAGE_TYPE_LABELS,
    DEFENSIBLE_DAMAGE_TYPES,
  } from '@vtt/shared/system/dnd.js';

  /**
   * Построчный редактор защит от типов урона: для каждого типа — вид защиты
   * (сопротивление/иммунитет/уязвимость). Переиспользуется для основного вида
   * (вкладка «Дары») и для подвида (всплывающий редактор узла).
   */
  const model = defineModel<DamageDefenseEntry[]>({ required: true });

  const damageTypeOptions = DEFENSIBLE_DAMAGE_TYPES.map((damageType) => ({
    value: damageType,
    label: DAMAGE_TYPE_LABELS[damageType],
  }));

  const kindOptions = typedObjectEntries(DAMAGE_DEFENSE_KIND_LABELS).map(
    ([kind, label]) => ({ value: kind, label }),
  );

  function addEntry(): void {
    model.value = [...model.value, { damageType: 'fire', kind: 'resistance' }];
  }

  function removeEntry(index: number): void {
    model.value = model.value.filter((_, entryIndex) => entryIndex !== index);
  }
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="(entry, index) in model"
      :key="index"
      class="flex items-center gap-2"
    >
      <USelect
        v-model="entry.damageType"
        :items="damageTypeOptions"
        value-key="value"
        label-key="label"
        class="flex-1"
      />

      <USelect
        v-model="entry.kind"
        :items="kindOptions"
        value-key="value"
        label-key="label"
        class="w-44"
      />

      <UButton
        icon="tabler:trash"
        color="error"
        variant="ghost"
        :aria-label="`Удалить защиту ${index + 1}`"
        @click.left.exact.prevent="removeEntry(index)"
      />
    </div>

    <UButton
      icon="tabler:plus"
      label="Добавить защиту"
      color="neutral"
      variant="subtle"
      class="self-start"
      @click.left.exact.prevent="addEntry"
    />
  </div>
</template>
