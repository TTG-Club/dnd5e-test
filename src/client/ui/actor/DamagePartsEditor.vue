<script setup lang="ts">
  import type { DamagePart } from '@vtt/shared';

  import DamagePartRow from './DamagePartRow.vue';

  const props = withDefaults(
    defineProps<{
      /** Части урона/лечения (v-model) */
      modelValue: DamagePart[];
      /** Опции типов урона */
      damageTypeOptions: Array<{ label: string; value: string }>;
      /** Показывать кнопку модификатора заклинания (@mod.spell) */
      includeSpellModifier?: boolean;
      /** Показывать versatile-формулу у первой части (двуручный хват оружия) */
      showVersatile?: boolean;
      /** Скрыть вкладку лечения (@heal) */
      hideHealing?: boolean;
      /** Скрыть вкладку условий (@target) */
      hideConditions?: boolean;
      /** Скрыть вкладку «Добавить мод» (оружие — мод. добавляется автоматически) */
      hideModifiers?: boolean;
      /** Подпись кнопки добавления части */
      addLabel?: string;
      /**
       * Разрешить удалять последнюю часть (урон полностью необязателен).
       * Нужно заклинаниям/атакам/эффектам без урона.
       */
      allowEmpty?: boolean;
    }>(),
    {
      includeSpellModifier: true,
      showVersatile: false,
      hideHealing: false,
      hideConditions: false,
      hideModifiers: false,
      addLabel: 'Добавить часть',
      allowEmpty: false,
    },
  );

  const emit = defineEmits<{
    'update:modelValue': [value: DamagePart[]];
  }>();

  /** Добавляет пустую часть урона */
  function addPart(): void {
    emit('update:modelValue', [
      ...props.modelValue,
      { formula: '', target: 'selected' },
    ]);
  }

  /** Удаляет часть по индексу */
  function removePart(index: number): void {
    emit(
      'update:modelValue',
      props.modelValue.filter((_, idx) => idx !== index),
    );
  }

  /** Обновляет часть по индексу */
  function updatePart(index: number, value: DamagePart): void {
    emit(
      'update:modelValue',
      props.modelValue.map((part, idx) => (idx === index ? value : part)),
    );
  }
</script>

<template>
  <div class="flex flex-col gap-3">
    <DamagePartRow
      v-for="(part, partIndex) in modelValue"
      :key="partIndex"
      :model-value="part"
      :index="partIndex"
      :damage-type-options="damageTypeOptions"
      :can-remove="allowEmpty || modelValue.length > 1"
      :include-spell-modifier="includeSpellModifier"
      :show-versatile="showVersatile && partIndex === 0"
      :hide-healing="hideHealing"
      :hide-conditions="hideConditions"
      :hide-modifiers="hideModifiers"
      @update:model-value="updatePart(partIndex, $event)"
      @remove="removePart(partIndex)"
    />

    <div class="flex items-center justify-between">
      <UButton
        icon="tabler:plus"
        variant="soft"
        size="sm"
        @click.left.exact.prevent="addPart"
      >
        {{ addLabel }}
      </UButton>

      <slot name="actions" />
    </div>
  </div>
</template>
