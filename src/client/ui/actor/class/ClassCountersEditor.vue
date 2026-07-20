<script setup lang="ts">
  import type {
    EditableCounter,
    EditableProgressionEntry,
  } from './classEditorTypes';

  import { generateId } from '@vtt/shared';
  import { computed } from 'vue';

  import { RECOVERY_OPTIONS } from './classEditorTypes';

  const props = defineProps<{
    /** Особенности (для привязки счётчика к особенности по ключу). */
    featureOptions?: { value: string; label: string }[];
  }>();

  /** Список счётчиков классовых ресурсов. */
  const counters = defineModel<EditableCounter[]>({ required: true });

  const modeOptions = [
    { value: 'progression', label: 'Таблица по уровням' },
    { value: 'formula', label: 'Формула' },
  ];

  const featureSelectOptions = computed(() => [
    { value: '', label: '— не привязан —' },
    ...(props.featureOptions ?? []),
  ]);

  /** Добавляет новый счётчик. */
  function addCounter(): void {
    counters.value.push({
      key: generateId('cnt'),
      name: '',
      shortName: '',
      nameEn: '',
      description: '',
      startLevel: 1,
      recovery: 'long',
      mode: 'progression',
      progression: [],
      formula: 'level',
      featureKey: '',
    });
  }

  /** Удаляет счётчик по индексу. */
  function removeCounter(index: number): void {
    counters.value.splice(index, 1);
  }

  /** Добавляет ступень прогрессии к счётчику. */
  function addProgression(counter: EditableCounter): void {
    const entry: EditableProgressionEntry = {
      uid: generateId('cpe'),
      level: counter.startLevel,
      value: 1,
    };

    counter.progression.push(entry);
  }

  /** Удаляет ступень прогрессии по индексу. */
  function removeProgression(counter: EditableCounter, index: number): void {
    counter.progression.splice(index, 1);
  }
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="(counter, counterIndex) in counters"
      :key="counter.key"
      class="flex flex-col gap-3 rounded-lg border border-default bg-elevated/20 p-3"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-highlighted">
          {{ counter.name || 'Новый счётчик' }}
        </span>

        <UButton
          icon="tabler:trash"
          color="error"
          variant="ghost"
          size="xs"
          class="ml-auto"
          aria-label="Удалить счётчик"
          @click.left.exact.prevent="removeCounter(counterIndex)"
        />
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <UFormField label="Название">
          <UInput
            v-model="counter.name"
            placeholder="Ярость"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Краткое">
          <UInput
            v-model="counter.shortName"
            placeholder="Яр."
            class="w-full"
          />
        </UFormField>

        <UFormField label="Англ.">
          <UInput
            v-model="counter.nameEn"
            placeholder="Rage"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Уровень начала">
          <UInputNumber
            v-model="counter.startLevel"
            :min="1"
            :max="20"
          />
        </UFormField>

        <UFormField label="Восстановление">
          <USelect
            v-model="counter.recovery"
            :items="RECOVERY_OPTIONS"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Привязка к особенности">
          <USelect
            v-model="counter.featureKey"
            :items="featureSelectOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField label="Описание">
        <UTextarea
          v-model="counter.description"
          :rows="2"
          autoresize
          placeholder="Как работает ресурс, восстановление…"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Источник максимума">
        <USelect
          v-model="counter.mode"
          :items="modeOptions"
          value-key="value"
          class="w-full sm:w-1/2"
        />
      </UFormField>

      <!-- Таблица прогрессии -->
      <div
        v-if="counter.mode === 'progression'"
        class="flex flex-col gap-2"
      >
        <div
          v-for="(entry, entryIndex) in counter.progression"
          :key="entry.uid"
          class="flex items-center gap-2"
        >
          <span class="text-xs text-muted">Уровень</span>

          <UInputNumber
            v-model="entry.level"
            :min="1"
            :max="20"
            class="w-[90px]"
          />

          <span class="text-xs text-muted">→ макс.</span>

          <UInputNumber
            v-model="entry.value"
            :min="0"
            :max="999"
            class="w-[100px]"
          />

          <UButton
            icon="tabler:trash"
            color="error"
            variant="ghost"
            size="xs"
            aria-label="Удалить ступень"
            @click.left.exact.prevent="removeProgression(counter, entryIndex)"
          />
        </div>

        <UButton
          icon="tabler:plus"
          label="Добавить ступень"
          color="neutral"
          variant="soft"
          size="xs"
          class="self-start"
          @click.left.exact.prevent="addProgression(counter)"
        />

        <p class="text-[11px] text-dimmed">
          Указывайте только уровни, где значение МЕНЯЕТСЯ. 999 = без предела.
        </p>
      </div>

      <!-- Формула -->
      <UFormField
        v-else
        label="Формула (level / chaMod / level * N)"
      >
        <UInput
          v-model="counter.formula"
          placeholder="level"
          class="w-full sm:w-1/2"
        />
      </UFormField>
    </div>

    <UButton
      icon="tabler:plus"
      label="Добавить счётчик"
      color="primary"
      variant="soft"
      size="xs"
      class="self-start"
      @click.left.exact.prevent="addCounter"
    />
  </div>
</template>
