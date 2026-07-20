<script setup lang="ts">
  /**
   * Шаг мастера: Увеличение характеристик (ASI) / Черты.
   *
   * Позволяет выбрать между +2 к одной или +1/+1 к двум характеристикам.
   * Режим «Черта» — placeholder (каталог черт пока не реализован).
   */
  import type { AbilityType } from '@vtt/shared';
  import type { DnDAbilityScores } from '@vtt/shared/system/dnd.js';

  import type { WizardAsiState } from './useClassWizard';

  import { computed } from 'vue';

  import { ABILITY_LABELS } from './constants';

  const props = defineProps<{
    currentAbilities: DnDAbilityScores;
    asiState: WizardAsiState;
  }>();

  const emit = defineEmits<{
    'update:asiState': [state: WizardAsiState];
  }>();

  /** Список всех характеристик */
  const ABILITY_KEYS: AbilityType[] = [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
  ];

  /** Общее количество очков, уже распределённых */
  const totalSpent = computed(() => {
    return Object.values(props.asiState.abilityIncreases).reduce(
      (sum, increment) => sum + (increment ?? 0),
      0,
    );
  });

  /** Остаток очков для распределения */
  const pointsRemaining = computed(() => 2 - totalSpent.value);

  /** Переключает режим ASI/Feat */
  function setMode(mode: 'asi' | 'feat') {
    emit('update:asiState', {
      ...props.asiState,
      mode,
      abilityIncreases: {},
      featKey: null,
    });
  }

  /** Увеличивает значение характеристики на 1 (максимум +2 на одну, до 20 итого) */
  function incrementAbility(ability: AbilityType) {
    const currentScore = props.currentAbilities[ability] ?? 10;
    const currentIncrement = props.asiState.abilityIncreases[ability] ?? 0;

    if (pointsRemaining.value <= 0) {
      return;
    }

    if (currentIncrement >= 2) {
      return;
    }

    if (currentScore + currentIncrement + 1 > 20) {
      return;
    }

    emit('update:asiState', {
      ...props.asiState,
      abilityIncreases: {
        ...props.asiState.abilityIncreases,
        [ability]: currentIncrement + 1,
      },
    });
  }

  /** Уменьшает увеличение характеристики */
  function decrementAbility(ability: AbilityType) {
    const currentIncrement = props.asiState.abilityIncreases[ability] ?? 0;

    if (currentIncrement <= 0) {
      return;
    }

    const newIncreases = { ...props.asiState.abilityIncreases };

    if (currentIncrement - 1 === 0) {
      delete newIncreases[ability];
    } else {
      newIncreases[ability] = currentIncrement - 1;
    }

    emit('update:asiState', {
      ...props.asiState,
      abilityIncreases: newIncreases,
    });
  }

  /** Сбрасывает все распределения */
  function resetAbilities() {
    emit('update:asiState', {
      ...props.asiState,
      abilityIncreases: {},
    });
  }
</script>

<template>
  <div class="space-y-3">
    <span class="mb-2 block text-sm font-medium text-toned">
      Увеличение характеристик
    </span>

    <!-- Переключатель ASI / Feat -->
    <div class="flex gap-2">
      <UButton
        size="sm"
        :color="asiState.mode === 'asi' ? 'primary' : 'neutral'"
        :variant="asiState.mode === 'asi' ? 'solid' : 'outline'"
        @click.left.exact.prevent="setMode('asi')"
      >
        Повысить характеристики
      </UButton>

      <UButton
        size="sm"
        :color="asiState.mode === 'feat' ? 'primary' : 'neutral'"
        :variant="asiState.mode === 'feat' ? 'solid' : 'outline'"
        @click.left.exact.prevent="setMode('feat')"
      >
        Взять черту
      </UButton>
    </div>

    <!-- Режим ASI -->
    <div
      v-if="asiState.mode === 'asi'"
      class="space-y-2"
    >
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted">
          Распределите 2 очка (+2 к одной или +1 к двум)
        </span>

        <div class="flex items-center gap-2">
          <span
            class="text-sm font-bold"
            :class="pointsRemaining > 0 ? 'text-warning' : 'text-healing'"
          >
            Осталось: {{ pointsRemaining }}
          </span>

          <UButton
            v-if="totalSpent > 0"
            size="2xs"
            color="neutral"
            variant="ghost"
            icon="tabler:refresh"
            @click.left.exact.prevent="resetAbilities"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="ability in ABILITY_KEYS"
          :key="ability"
          class="flex items-center justify-between rounded-md border border-default/50 bg-elevated/30 px-2.5 py-1.5"
        >
          <div class="flex min-w-0 items-baseline gap-1.5">
            <span class="truncate text-base font-medium text-toned">{{
              ABILITY_LABELS[ability]
            }}</span>

            <span class="text-base font-bold text-highlighted">
              {{ currentAbilities[ability] ?? 10 }}
            </span>

            <template v-if="(asiState.abilityIncreases[ability] ?? 0) > 0">
              <span class="text-base text-dimmed">→</span>

              <span class="text-base font-bold text-healing">
                {{
                  (currentAbilities[ability] ?? 10)
                  + (asiState.abilityIncreases[ability] ?? 0)
                }}
              </span>
            </template>
          </div>

          <div class="flex items-center gap-1">
            <UButton
              size="2xs"
              color="neutral"
              variant="soft"
              icon="tabler:minus"
              :disabled="(asiState.abilityIncreases[ability] ?? 0) <= 0"
              @click.left.exact.prevent="decrementAbility(ability)"
            />

            <span class="w-4 text-center text-xs font-bold text-highlighted">
              {{ asiState.abilityIncreases[ability] ?? 0 }}
            </span>

            <UButton
              size="2xs"
              color="neutral"
              variant="soft"
              icon="tabler:plus"
              :disabled="
                pointsRemaining <= 0
                || (asiState.abilityIncreases[ability] ?? 0) >= 2
                || (currentAbilities[ability] ?? 10)
                  + (asiState.abilityIncreases[ability] ?? 0)
                  >= 20
              "
              @click.left.exact.prevent="incrementAbility(ability)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Режим Feat — placeholder -->
    <div
      v-else
      class="rounded-lg border border-gold/30 bg-gold-subtle/10 px-3 py-4 text-center"
    >
      <UIcon
        name="tabler:hammer"
        class="mx-auto mb-2 h-8 w-8 text-gold/60"
      />

      <p class="text-sm text-gold-muted/80">Выбор черты</p>

      <p class="mt-1 text-sm text-dimmed">
        Каталог черт будет доступен в следующем обновлении.
      </p>
    </div>
  </div>
</template>
