<script setup lang="ts">
  import type { SpellOption } from '../grantedSpellsEditorTypes';
  import type { EditableSubclass } from './classEditorTypes';

  import { generateId } from '@vtt/shared';
  import { computed, ref } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';

  import ClassCountersEditor from './ClassCountersEditor.vue';
  import {
    createEmptyLevelTable,
    createEmptySpellcasting,
  } from './classEditorTypes';
  import ClassFeaturesEditor from './ClassFeaturesEditor.vue';
  import ClassLevelTableEditor from './ClassLevelTableEditor.vue';
  import ClassSpellcastingFields from './ClassSpellcastingFields.vue';

  const props = defineProps<{
    /** Заклинания компендиума по пакам — для подсказок связывания. */
    availableSpells?: SpellOption[];
    /** Уровень получения подкласса из базового класса (по умолч. unlockLevel). */
    subclassLevel: number;
  }>();

  /** Список подклассов. */
  const subclasses = defineModel<EditableSubclass[]>({ required: true });

  const emit = defineEmits<{
    'open-spell': [spellId: string, packId?: string];
  }>();

  /** Индекс выбранного подкласса (-1 — ничего не выбрано). */
  const selectedIndex = ref(-1);

  const selected = computed<EditableSubclass | null>(
    () => subclasses.value[selectedIndex.value] ?? null,
  );

  /** Особенности выбранного подкласса как опции привязки счётчиков. */
  const featureOptions = computed(() =>
    (selected.value?.features ?? [])
      .filter((feature) => feature.name.trim().length > 0)
      .map((feature) => ({ value: feature.key, label: feature.name })),
  );

  /** Добавляет подкласс и выбирает его. */
  function addSubclass(): void {
    subclasses.value.push({
      key: generateId('sub'),
      name: '',
      nameEn: '',
      description: '',
      unlockLevel: props.subclassLevel,
      sourceKey: '',
      features: [],
      counters: [],
      spellcasting: createEmptySpellcasting(),
      hasOwnTable: false,
      tableColumns: [],
      levelTable: createEmptyLevelTable(),
    });

    selectedIndex.value = subclasses.value.length - 1;
  }

  /** Удаляет подкласс по индексу. */
  function removeSubclass(index: number): void {
    subclasses.value.splice(index, 1);

    if (selectedIndex.value >= subclasses.value.length) {
      selectedIndex.value = subclasses.value.length - 1;
    }
  }

  function forwardOpenSpell(spellId: string, packId?: string): void {
    emit('open-spell', spellId, packId);
  }
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Список подклассов -->
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        v-for="(subclass, index) in subclasses"
        :key="subclass.key"
        :label="subclass.name || 'Подкласс'"
        :color="index === selectedIndex ? 'primary' : 'neutral'"
        :variant="index === selectedIndex ? 'solid' : 'soft'"
        size="xs"
        @click.left.exact.prevent="selectedIndex = index"
      />

      <UButton
        icon="tabler:plus"
        label="Подкласс"
        color="primary"
        variant="soft"
        size="xs"
        @click.left.exact.prevent="addSubclass"
      />
    </div>

    <div
      v-if="!selected"
      class="rounded-lg border border-dashed border-default p-4 text-center text-xs text-dimmed italic"
    >
      Выберите или добавьте подкласс.
    </div>

    <!-- Детали выбранного подкласса -->
    <div
      v-else
      class="flex flex-col gap-4 rounded-lg border border-default bg-elevated/20 p-3"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-highlighted">
          {{ selected.name || 'Новый подкласс' }}
        </span>

        <UButton
          icon="tabler:trash"
          color="error"
          variant="ghost"
          size="xs"
          class="ml-auto"
          label="Удалить подкласс"
          @click.left.exact.prevent="removeSubclass(selectedIndex)"
        />
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <UFormField label="Название">
          <UInput
            v-model="selected.name"
            placeholder="Чемпион"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Англ.">
          <UInput
            v-model="selected.nameEn"
            placeholder="Champion"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Уровень получения">
          <UInputNumber
            v-model="selected.unlockLevel"
            :min="1"
            :max="20"
          />
        </UFormField>

        <UFormField label="Источник (ключ)">
          <UInput
            v-model="selected.sourceKey"
            placeholder="phb"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField label="Описание (Markdown)">
        <RichTextEditor v-model="selected.description" />
      </UFormField>

      <UFormField label="Заклинательство подкласса">
        <ClassSpellcastingFields v-model="selected.spellcasting" />
      </UFormField>

      <UFormField label="Особенности подкласса">
        <ClassFeaturesEditor
          v-model="selected.features"
          :available-spells="availableSpells"
          @open-spell="forwardOpenSpell"
        />
      </UFormField>

      <UFormField label="Счётчики подкласса">
        <ClassCountersEditor
          v-model="selected.counters"
          :feature-options="featureOptions"
        />
      </UFormField>

      <UCheckbox
        v-model="selected.hasOwnTable"
        label="Своя таблица прогрессии (напр. Мистический рыцарь)"
      />

      <ClassLevelTableEditor
        v-if="selected.hasOwnTable"
        v-model:rows="selected.levelTable"
        v-model:columns="selected.tableColumns"
        :features="selected.features"
        :is-caster="selected.spellcasting.enabled"
      />
    </div>
  </div>
</template>
