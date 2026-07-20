<script setup lang="ts">
  import type { SpellOption } from '../grantedSpellsEditorTypes';
  import type { EditableClassFeature } from './classEditorTypes';

  import { ref } from 'vue';

  import { createEmptyFeature } from './classEditorTypes';
  import ClassFeatureFields from './ClassFeatureFields.vue';

  defineProps<{
    /** Заклинания компендиума по пакам — для подсказок связывания. */
    availableSpells?: SpellOption[];
  }>();

  /** Список особенностей класса/подкласса. */
  const features = defineModel<EditableClassFeature[]>({ required: true });

  const emit = defineEmits<{
    'open-spell': [spellId: string, packId?: string];
  }>();

  /** Ключи раскрытых (редактируемых) особенностей. */
  const expandedKeys = ref<Set<string>>(new Set());

  function isExpanded(key: string): boolean {
    return expandedKeys.value.has(key);
  }

  function toggle(key: string): void {
    if (expandedKeys.value.has(key)) {
      expandedKeys.value.delete(key);
    } else {
      expandedKeys.value.add(key);
    }
  }

  /** Добавляет особенность и сразу раскрывает её редактор. */
  function addFeature(): void {
    const feature = createEmptyFeature('Новая особенность');

    features.value.push(feature);
    expandedKeys.value.add(feature.key);
  }

  /** Удаляет особенность по индексу. */
  function removeFeature(index: number): void {
    const [removed] = features.value.splice(index, 1);

    if (removed) {
      expandedKeys.value.delete(removed.key);
    }
  }

  function forwardOpenSpell(spellId: string, packId?: string): void {
    emit('open-spell', spellId, packId);
  }
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-if="features.length === 0"
      class="rounded-lg border border-dashed border-default p-4 text-center text-xs text-dimmed italic"
    >
      Особенностей пока нет.
    </div>

    <div
      v-for="(feature, featureIndex) in features"
      :key="feature.key"
      class="rounded-lg border border-default bg-elevated/20"
    >
      <div class="flex items-center gap-2 p-2">
        <UButton
          :icon="
            isExpanded(feature.key)
              ? 'tabler:chevron-down'
              : 'tabler:chevron-right'
          "
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="isExpanded(feature.key) ? 'Свернуть' : 'Развернуть'"
          @click.left.exact.prevent="toggle(feature.key)"
        />

        <button
          class="min-w-0 flex-1 truncate text-left text-sm font-medium text-highlighted"
          @click.left.exact.prevent="toggle(feature.key)"
        >
          {{ feature.name || 'Особенность' }}
        </button>

        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
        >
          {{ feature.level }} ур.
        </UBadge>

        <UButton
          icon="tabler:trash"
          color="error"
          variant="ghost"
          size="xs"
          aria-label="Удалить особенность"
          @click.left.exact.prevent="removeFeature(featureIndex)"
        />
      </div>

      <div
        v-if="isExpanded(feature.key)"
        class="border-t border-default/50 p-3"
      >
        <ClassFeatureFields
          v-model="features[featureIndex]"
          :available-spells="availableSpells"
          @open-spell="forwardOpenSpell"
        />
      </div>
    </div>

    <UButton
      icon="tabler:plus"
      label="Добавить особенность"
      color="primary"
      variant="soft"
      size="xs"
      class="self-start"
      @click.left.exact.prevent="addFeature"
    />
  </div>
</template>
