<script setup lang="ts">
  import type { AbilityType } from '@vtt/shared';
  import type {
    Actor,
    AttackRollMode,
    EffectTargetKey,
  } from '@vtt/shared/system/dnd.js';

  import type { AbilityBonusSource } from './AbilityScore.vue';

  import {
    ABILITY_SCORE_MAX,
    ABILITY_SCORE_MIN,
    calculateAbilityModifier,
  } from '@vtt/shared/system/dnd.js';
  import { ref, toRef } from 'vue';

  import { useResolvedStats } from '../../composables/useResolvedStats';
  import AbilityScore from './AbilityScore.vue';
  import DiceRollModal from './DiceRollModal.vue';

  interface Props {
    actor: Actor;
    isEditMode: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
  }>();

  const { resolvedStats, combinedEffects } = useResolvedStats(
    toRef(() => props.actor),
  );

  /**
   * Собирает список источников бонусов к характеристике из Active Effects
   */
  function getAbilityBonusSources(
    abilityKey: AbilityType,
  ): AbilityBonusSource[] {
    const targetKey: EffectTargetKey = `ability.${abilityKey}`;
    const sources: AbilityBonusSource[] = [];

    for (const effect of combinedEffects.value) {
      for (const change of effect.changes) {
        if (change.key !== targetKey || change.condition) {
          continue;
        }

        const numericValue = Number(change.value);

        if (!Number.isNaN(numericValue) && numericValue !== 0) {
          sources.push({
            name: effect.name,
            value: numericValue,
          });
        }
      }
    }

    return sources;
  }

  const isDiceRollOpen = ref(false);

  /** Конфигурация модалки броска */
  interface DiceRollConfig {
    modifier: number;
    title: string;
    rollLabel: string;
    rollButtonText: string;
    initialRollMode: AttackRollMode;
  }

  const diceRollConfig = ref<DiceRollConfig>({
    modifier: 0,
    title: '',
    rollLabel: '',
    rollButtonText: 'Бросить',
    initialRollMode: 'normal',
  });

  function updateAbility(ability: AbilityType, value: number) {
    // Валидация диапазона
    const clampedValue = Math.max(
      ABILITY_SCORE_MIN,
      Math.min(ABILITY_SCORE_MAX, value),
    );

    emit('update:actor', {
      system: {
        ...props.actor.system,
        abilities: {
          ...props.actor.system.abilities,
          [ability]: clampedValue,
        },
      },
    });
  }

  function handleAbilityRoll(
    modifier: number,
    label: string,
    abilityKey: AbilityType,
  ) {
    let initialRollMode: AttackRollMode = 'normal';

    const flags = resolvedStats.value?.activeFlags ?? new Set();

    const hasAdvantage =
      flags.has('abilityCheck.advantage')
      || flags.has(`abilityCheck.advantage.${abilityKey}`);

    const hasDisadvantage =
      flags.has('abilityCheck.disadvantage')
      || flags.has(`abilityCheck.disadvantage.${abilityKey}`);

    if (hasAdvantage && !hasDisadvantage) {
      initialRollMode = 'advantage';
    }

    if (!hasAdvantage && hasDisadvantage) {
      initialRollMode = 'disadvantage';
    }

    diceRollConfig.value = {
      modifier,
      title: `Проверка: ${label}`,
      rollLabel: `Проверка ${label}`,
      rollButtonText: 'Бросить проверку',
      initialRollMode,
    };

    isDiceRollOpen.value = true;
  }
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Attributes grid -->
    <div class="grid grid-cols-6 gap-x-2 gap-y-3 lg:gap-x-3">
      <!-- Сила (Strength) -->
      <AbilityScore
        label="Сила"
        :value="
          isEditMode
            ? actor.system.abilities.strength
            : (resolvedStats?.abilities.strength
              ?? actor.system.abilities.strength)
        "
        :base-value="actor.system.abilities.strength"
        :modifier="
          resolvedStats?.abilityMods.strength
          ?? calculateAbilityModifier(actor.system.abilities.strength)
        "
        :is-edit-mode="isEditMode"
        :bonus-sources="getAbilityBonusSources('strength')"
        @update:value="updateAbility('strength', $event)"
        @roll="(mod, label) => handleAbilityRoll(mod, label, 'strength')"
      />

      <!-- Ловкость (Dexterity) -->
      <AbilityScore
        label="Ловкость"
        :value="
          isEditMode
            ? actor.system.abilities.dexterity
            : (resolvedStats?.abilities.dexterity
              ?? actor.system.abilities.dexterity)
        "
        :base-value="actor.system.abilities.dexterity"
        :modifier="
          resolvedStats?.abilityMods.dexterity
          ?? calculateAbilityModifier(actor.system.abilities.dexterity)
        "
        :is-edit-mode="isEditMode"
        :bonus-sources="getAbilityBonusSources('dexterity')"
        @update:value="updateAbility('dexterity', $event)"
        @roll="(mod, label) => handleAbilityRoll(mod, label, 'dexterity')"
      />

      <!-- Телосложение (Constitution) -->
      <AbilityScore
        label="Телосложение"
        :value="
          isEditMode
            ? actor.system.abilities.constitution
            : (resolvedStats?.abilities.constitution
              ?? actor.system.abilities.constitution)
        "
        :base-value="actor.system.abilities.constitution"
        :modifier="
          resolvedStats?.abilityMods.constitution
          ?? calculateAbilityModifier(actor.system.abilities.constitution)
        "
        :is-edit-mode="isEditMode"
        :bonus-sources="getAbilityBonusSources('constitution')"
        @update:value="updateAbility('constitution', $event)"
        @roll="(mod, label) => handleAbilityRoll(mod, label, 'constitution')"
      />

      <!-- Интеллект (Intelligence) -->
      <AbilityScore
        label="Интеллект"
        :value="
          isEditMode
            ? actor.system.abilities.intelligence
            : (resolvedStats?.abilities.intelligence
              ?? actor.system.abilities.intelligence)
        "
        :base-value="actor.system.abilities.intelligence"
        :modifier="
          resolvedStats?.abilityMods.intelligence
          ?? calculateAbilityModifier(actor.system.abilities.intelligence)
        "
        :is-edit-mode="isEditMode"
        :bonus-sources="getAbilityBonusSources('intelligence')"
        @update:value="updateAbility('intelligence', $event)"
        @roll="(mod, label) => handleAbilityRoll(mod, label, 'intelligence')"
      />

      <!-- Мудрость (Wisdom) -->
      <AbilityScore
        label="Мудрость"
        :value="
          isEditMode
            ? actor.system.abilities.wisdom
            : (resolvedStats?.abilities.wisdom ?? actor.system.abilities.wisdom)
        "
        :base-value="actor.system.abilities.wisdom"
        :modifier="
          resolvedStats?.abilityMods.wisdom
          ?? calculateAbilityModifier(actor.system.abilities.wisdom)
        "
        :is-edit-mode="isEditMode"
        :bonus-sources="getAbilityBonusSources('wisdom')"
        @update:value="updateAbility('wisdom', $event)"
        @roll="(mod, label) => handleAbilityRoll(mod, label, 'wisdom')"
      />

      <!-- Харизма (Charisma) -->
      <AbilityScore
        label="Харизма"
        :value="
          isEditMode
            ? actor.system.abilities.charisma
            : (resolvedStats?.abilities.charisma
              ?? actor.system.abilities.charisma)
        "
        :base-value="actor.system.abilities.charisma"
        :modifier="
          resolvedStats?.abilityMods.charisma
          ?? calculateAbilityModifier(actor.system.abilities.charisma)
        "
        :is-edit-mode="isEditMode"
        :bonus-sources="getAbilityBonusSources('charisma')"
        @update:value="updateAbility('charisma', $event)"
        @roll="(mod, label) => handleAbilityRoll(mod, label, 'charisma')"
      />
    </div>

    <!-- Модалка броска проверки характеристики -->
    <DiceRollModal
      v-model:open="isDiceRollOpen"
      :modifier="diceRollConfig.modifier"
      :title="diceRollConfig.title"
      :roll-label="diceRollConfig.rollLabel"
      :roll-button-text="diceRollConfig.rollButtonText"
      :initial-roll-mode="diceRollConfig.initialRollMode"
    />
  </div>
</template>
