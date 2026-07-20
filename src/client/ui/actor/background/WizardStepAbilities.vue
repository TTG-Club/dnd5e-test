<script setup lang="ts">
  import type { AbilityType } from '@vtt/shared';
  import type {
    BackgroundDefinition,
    DnDAbilityScores,
  } from '@vtt/shared/system/dnd.js';

  import { ABILITY_LABELS } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  const props = defineProps<{
    backgroundDefinition: BackgroundDefinition;
    currentAbilities: DnDAbilityScores;
    selectedScheme: '+2/+1' | '+1/+1/+1';
    abilityAllocation: Partial<Record<AbilityType, number>>;
  }>();

  const emit = defineEmits<{
    'update:selectedScheme': [value: '+2/+1' | '+1/+1/+1'];
    'update:abilityAllocation': [value: Partial<Record<AbilityType, number>>];
  }>();

  /** Допустимые для прокачки характеристики в этой предыстории */
  const allowedAbilities = computed(() => {
    return props.backgroundDefinition.abilityGrant.abilities;
  });

  /** Общее количество очков, уже распределённых */
  const totalSpent = computed(() => {
    return Object.values(props.abilityAllocation).reduce(
      (sum, increment) => sum + (increment ?? 0),
      0,
    );
  });

  /** Остаток очков для распределения (только для схемы +2/+1) */
  const pointsRemaining = computed(() => {
    return props.selectedScheme === '+2/+1' ? 3 - totalSpent.value : 0;
  });

  function selectScheme(scheme: '+2/+1' | '+1/+1/+1') {
    emit('update:selectedScheme', scheme);

    // Сброс распределения при смене схемы
    const newAllocation: Partial<Record<AbilityType, number>> = {};

    if (scheme === '+1/+1/+1') {
      // Сразу назначаем по +1 всем трём
      for (const ability of allowedAbilities.value) {
        newAllocation[ability] = 1;
      }
    }

    emit('update:abilityAllocation', newAllocation);
  }

  function incrementAbility(ability: AbilityType) {
    if (props.selectedScheme !== '+2/+1') {
      return;
    }

    const currentIncrement = props.abilityAllocation[ability] ?? 0;

    // В схеме +2/+1 сумма должна быть 3, и максимум +2 на одну
    if (pointsRemaining.value <= 0) {
      return;
    }

    if (currentIncrement >= 2) {
      return;
    }

    // Если мы добавляем +2, а +2 уже есть у другой характеристики — не даем
    if (currentIncrement === 1 && totalSpent.value >= 2) {
      const hasTwoAlready = Object.values(props.abilityAllocation).includes(2);

      if (hasTwoAlready) {
        return;
      }
    }

    emit('update:abilityAllocation', {
      ...props.abilityAllocation,
      [ability]: currentIncrement + 1,
    });
  }

  function decrementAbility(ability: AbilityType) {
    if (props.selectedScheme !== '+2/+1') {
      return;
    }

    const currentIncrement = props.abilityAllocation[ability] ?? 0;

    if (currentIncrement <= 0) {
      return;
    }

    const newAllocation = { ...props.abilityAllocation };

    if (currentIncrement - 1 === 0) {
      delete newAllocation[ability];
    } else {
      newAllocation[ability] = currentIncrement - 1;
    }

    emit('update:abilityAllocation', newAllocation);
  }

  function resetAbilities() {
    emit('update:abilityAllocation', {});
  }
</script>

<template>
  <div class="space-y-3">
    <span class="mb-2 block text-sm font-medium text-toned">
      Увеличение характеристик
    </span>

    <!-- Переключатель схемы -->
    <div class="flex gap-2">
      <UButton
        size="sm"
        :color="selectedScheme === '+2/+1' ? 'primary' : 'neutral'"
        :variant="selectedScheme === '+2/+1' ? 'solid' : 'outline'"
        class="flex-col items-center gap-0 py-1.5"
        @click.left.exact.prevent="selectScheme('+2/+1')"
      >
        <span class="font-medium">+2 / +1</span>

        <span class="text-[10px] opacity-70">распределить вручную</span>
      </UButton>

      <UButton
        size="sm"
        :color="selectedScheme === '+1/+1/+1' ? 'primary' : 'neutral'"
        :variant="selectedScheme === '+1/+1/+1' ? 'solid' : 'outline'"
        class="flex-col items-center gap-0 py-1.5"
        @click.left.exact.prevent="selectScheme('+1/+1/+1')"
      >
        <span class="font-medium">+1 / +1 / +1</span>

        <span class="text-[10px] opacity-70">сразу +1 всем</span>
      </UButton>
    </div>

    <!-- Режим распределения -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted">
          {{
            selectedScheme === '+2/+1'
              ? 'Распределите 3 очка (максимум +2 к одной)'
              : 'Автоматически по +1 к трем характеристикам'
          }}
        </span>

        <div
          v-if="selectedScheme === '+2/+1'"
          class="flex items-center gap-2"
        >
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
          v-for="ability in allowedAbilities"
          :key="ability"
          class="flex items-center justify-between rounded-md border border-default/50 bg-elevated/30 px-2.5 py-1.5"
        >
          <div class="flex min-w-0 items-baseline gap-1.5">
            <span class="truncate text-base font-medium text-toned">
              {{ ABILITY_LABELS[ability] }}
            </span>

            <span class="text-base font-bold text-highlighted">
              {{ currentAbilities[ability] ?? 10 }}
            </span>

            <template v-if="(abilityAllocation[ability] ?? 0) > 0">
              <span class="text-base text-dimmed">→</span>

              <span class="text-base font-bold text-healing">
                {{
                  (currentAbilities[ability] ?? 10)
                  + (abilityAllocation[ability] ?? 0)
                }}
              </span>
            </template>
          </div>

          <div
            v-if="selectedScheme === '+2/+1'"
            class="flex items-center gap-1"
          >
            <UButton
              size="2xs"
              color="neutral"
              variant="soft"
              icon="tabler:minus"
              :disabled="(abilityAllocation[ability] ?? 0) <= 0"
              @click.left.exact.prevent="decrementAbility(ability)"
            />

            <span class="w-4 text-center text-xs font-bold text-highlighted">
              {{ abilityAllocation[ability] ?? 0 }}
            </span>

            <UButton
              size="2xs"
              color="neutral"
              variant="soft"
              icon="tabler:plus"
              :disabled="
                pointsRemaining <= 0
                || (abilityAllocation[ability] ?? 0) >= 2
                || (currentAbilities[ability] ?? 10)
                  + (abilityAllocation[ability] ?? 0)
                  >= 20
              "
              @click.left.exact.prevent="incrementAbility(ability)"
            />
          </div>

          <div
            v-else
            class="flex items-center gap-1"
          >
            <UButton
              size="2xs"
              color="neutral"
              variant="soft"
              icon="tabler:minus"
              :disabled="true"
            />

            <span class="w-4 text-center text-xs font-bold text-highlighted">
              1
            </span>

            <UButton
              size="2xs"
              color="neutral"
              variant="soft"
              icon="tabler:plus"
              :disabled="true"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
