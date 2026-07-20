<script setup lang="ts">
  import type { Actor } from '@vtt/shared/system/dnd.js';

  import { ABILITY_OPTIONS } from '@vtt/shared/system/dnd.js';
  import { computed, toRef } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  const props = defineProps<{
    open: boolean;
    actor: Actor;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'update:actor': [updates: Partial<Actor>];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const actorRef = toRef(props, 'actor');

  const explicitSpellcastingAbility = computed({
    get: () => actorRef.value.system?.spellcastingAbility ?? 'auto',
    set: (val: string) => {
      emit('update:actor', {
        system: {
          ...actorRef.value.system,
          spellcastingAbility:
            val === 'auto'
              ? undefined
              : (val as import('@vtt/shared').AbilityType),
        },
      });
    },
  });

  // Автоматическая характеристика (из встроенного класса)
  const defaultClassSpellcastingAbility = computed(() => {
    const casterClass = actorRef.value.system?.classes?.find(
      (entry) => entry.spellcastingAbility != null,
    );

    return casterClass?.spellcastingAbility ?? null;
  });

  // Комбинированный список: Авто + Характеристики
  const options = computed(() => {
    return [
      {
        value: 'auto',
        label: defaultClassSpellcastingAbility.value
          ? `Авто (из класса: ${
              ABILITY_OPTIONS.find(
                (opt) => opt.value === defaultClassSpellcastingAbility.value,
              )?.label
            })`
          : 'Авто',
      },
      ...ABILITY_OPTIONS,
    ];
  });
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="320"
    :min-height="150"
    title="Настройки магии"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm text-muted">Характеристика заклинаний</label>

          <USelect
            v-model="explicitSpellcastingAbility"
            :items="options"
            value-key="value"
            size="md"
            class="w-full"
          />
        </div>

        <p class="text-xs text-dimmed">
          Если выбрано Авто, будет использоваться характеристика первого
          магического класса. Выберите конкретную характеристику, чтобы
          переопределить это поведение.
        </p>

        <div class="flex justify-end pt-2">
          <UButton
            color="primary"
            size="sm"
            @click.left.exact.prevent="isOpen = false"
          >
            Готово
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
