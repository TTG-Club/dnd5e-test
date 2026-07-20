<script setup lang="ts">
  import type { SpellOption } from '../grantedSpellsEditorTypes';
  import type {
    EditableClassFeature,
    EditableClassFeatureChoice,
    EditableGrantedSpellLevel,
  } from './classEditorTypes';

  import { generateId } from '@vtt/shared';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';

  import GrantedSpellsEditor from '../GrantedSpellsEditor.vue';

  defineProps<{
    /** Заклинания компендиума по пакам — для подсказок связывания. */
    availableSpells?: SpellOption[];
  }>();

  /** Редактируемая особенность класса/подкласса. */
  const feature = defineModel<EditableClassFeature>({ required: true });

  const emit = defineEmits<{
    'open-spell': [spellId: string, packId?: string];
  }>();

  function forwardOpenSpell(spellId: string, packId?: string): void {
    emit('open-spell', spellId, packId);
  }

  /** Добавляет вариант-выбор (боевой стиль / манёвр). */
  function addChoice(): void {
    const choice: EditableClassFeatureChoice = {
      uid: generateId('cfc'),
      key: generateId('cfc'),
      name: '',
      description: '',
    };

    feature.value.choices.push(choice);
  }

  /** Удаляет вариант по индексу. */
  function removeChoice(index: number): void {
    feature.value.choices.splice(index, 1);
  }

  /** Добавляет уровень поуровневой выдачи заклинаний. */
  function addSpellLevel(): void {
    const entry: EditableGrantedSpellLevel = {
      uid: generateId('gsl'),
      level: 1,
      spells: [],
    };

    feature.value.grantedSpellsByLevel.push(entry);
  }

  /** Удаляет уровень поуровневой выдачи по индексу. */
  function removeSpellLevel(index: number): void {
    feature.value.grantedSpellsByLevel.splice(index, 1);
  }
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-[1fr_auto] gap-3">
      <UFormField label="Название">
        <UInput
          v-model="feature.name"
          placeholder="Название особенности"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Уровень">
        <UInputNumber
          v-model="feature.level"
          :min="1"
          :max="20"
          class="w-[110px]"
        />
      </UFormField>
    </div>

    <UFormField label="Описание (Markdown)">
      <RichTextEditor v-model="feature.description" />
    </UFormField>

    <UCheckbox
      v-model="feature.isInformationalOnly"
      label="Только информационная (заглушка-подсказка, не попадает в умения актёра)"
    />

    <!-- Варианты-выборы (боевой стиль, манёвры) -->
    <UFormField label="Варианты на выбор (напр. боевой стиль)">
      <div class="flex flex-col gap-2">
        <div
          v-for="(choice, choiceIndex) in feature.choices"
          :key="choice.uid"
          class="flex flex-col gap-1.5 rounded-md border border-default bg-elevated/30 p-2"
        >
          <div class="flex items-center gap-2">
            <UInput
              v-model="choice.name"
              placeholder="Название варианта"
              class="flex-1"
            />

            <UButton
              icon="tabler:trash"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Удалить вариант"
              @click.left.exact.prevent="removeChoice(choiceIndex)"
            />
          </div>

          <UTextarea
            v-model="choice.description"
            :rows="2"
            autoresize
            placeholder="Описание варианта"
            class="w-full"
          />
        </div>

        <UButton
          icon="tabler:plus"
          label="Добавить вариант"
          color="neutral"
          variant="soft"
          size="xs"
          class="self-start"
          @click.left.exact.prevent="addChoice"
        />
      </div>
    </UFormField>

    <!-- Заклинания на 1 уровне особенности -->
    <UFormField label="Заклинания особенности (всегда подготовлены)">
      <GrantedSpellsEditor
        v-model="feature.grantedSpells"
        :available-spells="availableSpells"
        @open-spell="forwardOpenSpell"
      />
    </UFormField>

    <!-- Поуровневая выдача заклинаний (домены/клятвы/покровители) -->
    <UFormField label="Поуровневые заклинания (домены/клятвы)">
      <div class="flex flex-col gap-2">
        <div
          v-for="(entry, levelIndex) in feature.grantedSpellsByLevel"
          :key="entry.uid"
          class="flex flex-col gap-1.5 rounded-md border border-default bg-elevated/30 p-2"
        >
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted">Уровень класса:</span>

            <UInputNumber
              v-model="entry.level"
              :min="1"
              :max="20"
              class="w-[100px]"
            />

            <UButton
              icon="tabler:trash"
              color="error"
              variant="ghost"
              size="xs"
              class="ml-auto"
              aria-label="Удалить уровень"
              @click.left.exact.prevent="removeSpellLevel(levelIndex)"
            />
          </div>

          <GrantedSpellsEditor
            v-model="entry.spells"
            :available-spells="availableSpells"
            @open-spell="forwardOpenSpell"
          />
        </div>

        <UButton
          icon="tabler:plus"
          label="Добавить уровень выдачи"
          color="neutral"
          variant="soft"
          size="xs"
          class="self-start"
          @click.left.exact.prevent="addSpellLevel"
        />
      </div>
    </UFormField>
  </div>
</template>
