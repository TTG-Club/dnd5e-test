<script setup lang="ts">
  import type { AbilityType } from '@vtt/shared';
  import type { Creature, CreatureSystem } from '@vtt/shared/system/dnd.js';

  import { calculateAbilityModifier } from '@vtt/shared/system/dnd.js';
  import { ref, toRef } from 'vue';

  import { ABILITY_SHORT_LABELS } from '@/systems/dnd5e/ui/actor/constants';

  import { useResolvedStats } from '../../composables/useResolvedStats';
  import AbilityScore from '../actor/AbilityScore.vue';
  import DiceRollModal from '../actor/DiceRollModal.vue';

  interface Props {
    creature: Creature;
    isEditMode: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:system': [updates: Partial<CreatureSystem>];
  }>();

  const { resolvedStats, combinedEffects } = useResolvedStats(
    toRef(() => props.creature),
  );

  const ABILITY_KEYS = [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
  ] as const;

  function getAbilityBonusSources(abilityKey: AbilityType) {
    const targetKey = `ability.${abilityKey}`;
    const sources = [];

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

  const diceRollConfig = ref({
    modifier: 0,
    title: '',
    rollLabel: '',
    rollButtonText: 'Бросок',
    initialRollMode: 'normal' as 'normal' | 'advantage' | 'disadvantage',
  });

  function handleAbilityRoll(mod: number, label: string) {
    diceRollConfig.value = {
      modifier: mod,
      title: `Проверка: ${label}`,
      rollLabel: label,
      rollButtonText: 'Бросок',
      initialRollMode: 'normal',
    };

    isDiceRollOpen.value = true;
  }

  function handleAbilityChange(ability: string, value: number) {
    emit('update:system', {
      abilities: {
        ...props.creature.system.abilities,
        [ability]: value,
      },
    });
  }
</script>

<template>
  <div class="grid grid-cols-6 gap-2">
    <AbilityScore
      v-for="ability in ABILITY_KEYS"
      :key="ability"
      :label="ABILITY_SHORT_LABELS[ability]"
      :value="
        isEditMode
          ? creature.system.abilities[ability]
          : (resolvedStats?.abilities[ability]
            ?? creature.system.abilities[ability])
      "
      :base-value="creature.system.abilities[ability]"
      :modifier="
        resolvedStats?.abilityMods[ability]
        ?? calculateAbilityModifier(creature.system.abilities[ability])
      "
      :is-edit-mode="isEditMode"
      :bonus-sources="getAbilityBonusSources(ability)"
      @update:value="handleAbilityChange(ability, $event)"
      @roll="(mod, label) => handleAbilityRoll(mod, label)"
    />
  </div>

  <DiceRollModal
    v-model:open="isDiceRollOpen"
    :modifier="diceRollConfig.modifier"
    :title="diceRollConfig.title"
    :roll-label="diceRollConfig.rollLabel"
    :roll-button-text="diceRollConfig.rollButtonText"
    :initial-roll-mode="diceRollConfig.initialRollMode"
  />
</template>
