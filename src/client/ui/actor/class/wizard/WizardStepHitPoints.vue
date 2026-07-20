<script setup lang="ts">
  /**
   * Шаг мастера: Очки здоровья.
   *
   * На 1-м уровне первого класса — автоматически максимум кости (read-only).
   * На последующих уровнях — среднее / максимум / бросок / ручной ввод.
   */
  import type {
    ClassDefinition,
    HitPointMethod,
  } from '@vtt/shared/system/dnd.js';

  import { useChatStore } from '@/stores/chatStore';
  import { useDiceRollerStore } from '@/stores/diceRollerStore';

  const props = defineProps<{
    classDefinition: ClassDefinition;
    nextLevel: number;
    isMaxHitDieLevel: boolean;
    hitPointValue: number;
    hitPointMethod: HitPointMethod;
    averageHitPoints: number;
  }>();

  const emit = defineEmits<{
    'update:hitPoints': [payload: { value: number; method: HitPointMethod }];
  }>();

  const chatStore = useChatStore();
  const diceRollerStore = useDiceRollerStore();

  /** Устанавливает среднее значение ХП */
  function setAverageHp() {
    emit('update:hitPoints', {
      value: props.averageHitPoints,
      method: 'average',
    });
  }

  /** Устанавливает максимальное значение ХП (максимум кости) */
  function setMaxHp() {
    emit('update:hitPoints', {
      value: props.classDefinition.hitDie,
      method: 'max',
    });
  }

  /** Бросает кость хитов, показывает результат в чате и подставляет в поле */
  function rollHitDie() {
    const formula = `1d${props.classDefinition.hitDie}`;
    const rollData = diceRollerStore.parseAndRoll(formula);

    chatStore.sendMessage(
      `🎲 Очки здоровья (${props.classDefinition.name}, ${props.nextLevel} ур.): ${formula} = ${rollData.total}`,
      'roll',
      rollData,
    );

    emit('update:hitPoints', {
      value: rollData.total,
      method: 'roll',
    });
  }

  /** Обработка ручного ввода значения ХП */
  function handleHitPointInput(inputValue: string | number) {
    const parsed = Number(inputValue);

    if (!Number.isNaN(parsed) && parsed >= 1) {
      emit('update:hitPoints', {
        value: parsed,
        method: 'custom',
      });
    }
  }
</script>

<template>
  <div class="space-y-3">
    <span class="mb-2 block text-sm font-medium text-toned">
      Очки здоровья (к{{ classDefinition.hitDie }})
    </span>

    <!-- Первый уровень первого класса — всегда максимум -->
    <div
      v-if="isMaxHitDieLevel"
      class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5"
    >
      <span class="text-sm text-muted">
        На 1-ом уровне: максимум кости =
        <span class="font-bold text-warning">{{ classDefinition.hitDie }}</span>
      </span>
    </div>

    <!-- Последующие уровни — среднее / макс / бросок / ручной ввод -->
    <div
      v-else
      class="flex items-center gap-2"
    >
      <UButton
        size="md"
        :color="hitPointMethod === 'average' ? 'primary' : 'neutral'"
        :variant="hitPointMethod === 'average' ? 'solid' : 'outline'"
        @click.left.exact.prevent="setAverageHp"
      >
        Среднее ({{ averageHitPoints }})
      </UButton>

      <UButton
        size="md"
        :color="hitPointMethod === 'max' ? 'primary' : 'neutral'"
        :variant="hitPointMethod === 'max' ? 'solid' : 'outline'"
        @click.left.exact.prevent="setMaxHp"
      >
        Макс ({{ classDefinition.hitDie }})
      </UButton>

      <UInput
        :model-value="String(hitPointValue)"
        size="md"
        class="w-16 text-center"
        @update:model-value="handleHitPointInput"
      />

      <UButton
        size="md"
        color="neutral"
        variant="outline"
        icon="tabler:dice"
        @click.left.exact.prevent="rollHitDie"
      >
        Бросить к{{ classDefinition.hitDie }}
      </UButton>
    </div>
  </div>
</template>
