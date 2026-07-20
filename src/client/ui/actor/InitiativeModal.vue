<script setup lang="ts">
  import type { AbilityType } from '@vtt/shared';

  import { calculateAbilityModifier } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  interface Props {
    open: boolean;
    /** Текущий бонус инициативы */
    initiativeBonus: number;
    /** Текущая характеристика инициативы */
    initiativeAbility: AbilityType;
    /** Значения всех характеристик для предпросмотра */
    abilityScores: Record<AbilityType, number>;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [
      data: { initiativeBonus: number; initiativeAbility: AbilityType },
    ];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const abilityOptions = [
    { label: 'Сила', value: 'strength' },
    { label: 'Ловкость', value: 'dexterity' },
    { label: 'Телосложение', value: 'constitution' },
    { label: 'Интеллект', value: 'intelligence' },
    { label: 'Мудрость', value: 'wisdom' },
    { label: 'Харизма', value: 'charisma' },
  ];

  const editAbility = ref<AbilityType>('dexterity');
  const editBonus = ref(0);

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        editAbility.value = props.initiativeAbility ?? 'dexterity';
        editBonus.value = props.initiativeBonus ?? 0;
      }
    },
  );

  const selectedAbilityLabel = computed(() => {
    return (
      abilityOptions.find((option) => option.value === editAbility.value)?.label
      ?? ''
    );
  });

  const abilityMod = computed(() => {
    return calculateAbilityModifier(
      props.abilityScores[editAbility.value] ?? 10,
    );
  });

  const previewTotal = computed(() => abilityMod.value + editBonus.value);

  const previewFormatted = computed(() => {
    return previewTotal.value >= 0
      ? `+${previewTotal.value}`
      : `${previewTotal.value}`;
  });

  const previewDetails = computed(() => {
    const parts = [
      `${selectedAbilityLabel.value}: ${abilityMod.value >= 0 ? '+' : ''}${abilityMod.value}`,
    ];

    if (editBonus.value !== 0) {
      parts.push(`Бонус: ${editBonus.value >= 0 ? '+' : ''}${editBonus.value}`);
    }

    return parts.join(' | ');
  });

  function applyChanges() {
    emit('apply', {
      initiativeBonus: editBonus.value,
      initiativeAbility: editAbility.value,
    });

    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="380"
    :min-height="240"
    title="Настройка инициативы"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Характеристика -->
        <div class="flex items-center gap-3">
          <span class="w-32 text-sm text-toned">Характеристика</span>

          <USelect
            v-model="editAbility"
            :items="abilityOptions"
            value-key="value"
            label-key="label"
            class="flex-1"
          />
        </div>

        <!-- Бонус -->
        <div class="flex items-center gap-3">
          <span class="w-32 text-sm text-toned">Доп. бонус</span>

          <UInput
            v-model.number="editBonus"
            type="number"
            size="sm"
            class="flex-1"
            placeholder="0"
          />
        </div>

        <!-- Предпросмотр -->
        <div class="rounded-lg bg-elevated/50 p-3 text-center">
          <span class="text-xs tracking-wider text-muted uppercase">Итого</span>

          <div class="mt-1 text-2xl font-bold text-white">
            {{ previewFormatted }}
          </div>

          <div class="mt-1 text-xs text-dimmed">
            {{ previewDetails }}
          </div>
        </div>

        <!-- Кнопки -->
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click.left.exact.prevent="isOpen = false"
          >
            Отмена
          </UButton>

          <UButton
            color="primary"
            size="sm"
            @click.left.exact.prevent="applyChanges"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
