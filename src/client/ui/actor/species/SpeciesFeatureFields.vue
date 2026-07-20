<script setup lang="ts" generic="T extends EditableFeatureFields">
  import type { SpellOption } from '../grantedSpellsEditorTypes';
  import type { EditableFeatureFields } from './speciesEditorTypes';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';

  import GrantedSpellsEditor from '../GrantedSpellsEditor.vue';

  defineProps<{
    /** Заклинания компендиума по пакам — пробрасываются в редактор заклинаний. */
    availableSpells?: SpellOption[];
  }>();

  /**
   * Редактируемая особенность (общие поля). Дженерик, чтобы v-model одинаково
   * типизировался и для базовой особенности (с вариантами), и для особенности
   * подвида (без вариантов).
   */
  const feature = defineModel<T>({ required: true });

  const emit = defineEmits<{
    /** Открыть детальный просмотр заклинания (id + предпочтённый пак). */
    'open-spell': [spellId: string, packId?: string];
  }>();

  /** Пробрасывает запрос открытия заклинания из редактора заклинаний наверх. */
  function forwardOpenSpell(spellId: string, packId?: string): void {
    emit('open-spell', spellId, packId);
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
      label="Только информационная (без механики — просто текст, не выдаёт скорость/зрение/заклинания и не попадает в умения)"
    />

    <!-- Механика особенности скрыта у информационных — она всё равно не
         применяется, чтобы не вводить в заблуждение -->
    <template v-if="!feature.isInformationalOnly">
      <UFormField label="Скорость от особенности (фт., 0 = не даёт)">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <UInputNumber
            v-model="feature.movement.walk"
            :min="0"
            :max="200"
            :ui="{ base: 'w-full' }"
            placeholder="Ходьба"
          />

          <UInputNumber
            v-model="feature.movement.fly"
            :min="0"
            :max="200"
            :ui="{ base: 'w-full' }"
            placeholder="Полёт"
          />

          <UInputNumber
            v-model="feature.movement.swim"
            :min="0"
            :max="200"
            :ui="{ base: 'w-full' }"
            placeholder="Плавание"
          />

          <UInputNumber
            v-model="feature.movement.climb"
            :min="0"
            :max="200"
            :ui="{ base: 'w-full' }"
            placeholder="Лазание"
          />

          <UInputNumber
            v-model="feature.movement.burrow"
            :min="0"
            :max="200"
            :ui="{ base: 'w-full' }"
            placeholder="Копание"
          />
        </div>
      </UFormField>

      <UFormField label="Тёмное зрение (фт., 0 = нет)">
        <UInputNumber
          v-model="feature.darkvision"
          :min="0"
          :max="300"
          :step="30"
        />
      </UFormField>

      <UFormField label="Заклинания (выдаются особенностью)">
        <GrantedSpellsEditor
          v-model="feature.grantedSpells"
          :available-spells="availableSpells"
          @open-spell="forwardOpenSpell"
        />
      </UFormField>
    </template>
  </div>
</template>
