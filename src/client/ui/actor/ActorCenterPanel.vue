<script setup lang="ts">
  import type {
    AbilityType,
    ActorMovement,
    ProficiencyLevel,
    SkillType,
  } from '@vtt/shared';
  import type {
    Actor,
    AttackRollMode,
    ClassCounterDefinition,
  } from '@vtt/shared/system/dnd.js';

  import { DISTANCE_UNIT_SHORT } from '@vtt/shared';
  import {
    calculateAbilityModifier,
    getDisplayMovement,
    getMovementList,
    getSkillAbility,
    SKILLS_LIST,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, toRef } from 'vue';

  import FieldsetLabel from '@/shared_ui/components/FieldsetLabel.vue';

  import { useResolvedStats } from '../../composables/useResolvedStats';
  import ClassCounters from './ClassCounters.vue';
  import DiceRollModal from './DiceRollModal.vue';
  import InitiativeModal from './InitiativeModal.vue';
  import MovementModal from './MovementModal.vue';
  import SkillItem from './SkillItem.vue';

  interface Props {
    actor: Actor;
    isEditMode: boolean;
    /** Определения счётчиков из компендиума */
    counterDefinitions: ClassCounterDefinition[];
  }

  defineOptions({ inheritAttrs: false });

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
  }>();

  const skills = SKILLS_LIST;

  const { resolvedStats, combinedEffects } = useResolvedStats(
    toRef(() => props.actor),
  );

  // --- Ходьба ---

  /** Конечные скорости передвижения (база + бонусы от эффектов) */
  const resolvedMovement = computed<ActorMovement>(() => {
    const resolved = resolvedStats.value?.movement;
    const base = props.actor.system.movement;

    if (!resolved) {
      return base;
    }

    return {
      ...base,
      walk: resolved.walk ?? base.walk,
      swim: resolved.swim ?? base.swim,
      fly: resolved.fly ?? base.fly,
      climb: resolved.climb ?? base.climb,
      burrow: resolved.burrow ?? base.burrow,
    };
  });

  const displayMovement = computed(() =>
    getDisplayMovement(resolvedMovement.value),
  );

  const movementList = computed(() => getMovementList(resolvedMovement.value));

  const isMovementOpen = ref(false);

  function openMovement() {
    isMovementOpen.value = true;
  }

  function onMovementApply(movement: ActorMovement) {
    emit('update:actor', {
      system: { ...props.actor.system, movement },
    });
  }

  // --- Инициатива ---

  const abilities: Array<{
    key: AbilityType;
    label: string;
  }> = [
    { key: 'strength', label: 'Сила' },
    { key: 'intelligence', label: 'Интеллект' },
    { key: 'dexterity', label: 'Ловкость' },
    { key: 'wisdom', label: 'Мудрость' },
    { key: 'constitution', label: 'Телосложение' },
    { key: 'charisma', label: 'Харизма' },
  ];

  const initiative = computed(() => {
    return resolvedStats.value?.initiative ?? 0;
  });

  const formattedInitiative = computed(() => {
    return initiative.value >= 0
      ? `+${initiative.value}`
      : `${initiative.value}`;
  });

  const initiativeTooltip = computed(() => {
    const ability = props.actor.system.initiativeAbility ?? 'dexterity';

    const abilityLabel =
      abilities.find((abilityDef) => abilityDef.key === ability)?.label
      ?? 'Ловкость';

    const abilityScore = props.actor.system.abilities[ability];
    const abilityMod = calculateAbilityModifier(abilityScore);
    const bonus = props.actor.system.initiativeBonus ?? 0;

    let text = `${abilityLabel}: ${abilityMod >= 0 ? '+' : ''}${abilityMod}`;

    if (bonus !== 0) {
      text += ` | Бонус: ${bonus >= 0 ? '+' : ''}${bonus}`;
    }

    return text;
  });

  const isInitiativeOpen = ref(false);

  const isDiceRollOpen = ref(false);

  const diceRollConfig = ref({
    modifier: 0,
    title: '',
    rollLabel: '',
    rollButtonText: 'Бросить',
    initialRollMode: 'normal' as AttackRollMode,
  });

  /**
   * Открывает универсальную модалку броска кубиков
   * @param config - конфигурация броска
   */
  function openDiceRoll(config: {
    modifier: number;
    title: string;
    rollLabel: string;
    rollButtonText?: string;
    initialRollMode?: AttackRollMode;
  }) {
    diceRollConfig.value = {
      ...config,
      rollButtonText: config.rollButtonText ?? 'Бросить',
      initialRollMode: config.initialRollMode ?? 'normal',
    };

    isDiceRollOpen.value = true;
  }

  function openInitiativeRoll() {
    let initialRollMode: AttackRollMode = 'normal';

    const flags = resolvedStats.value?.activeFlags ?? new Set();

    const hasAdvantage =
      flags.has('initiative.advantage')
      || flags.has('abilityCheck.advantage.dexterity')
      || flags.has('abilityCheck.advantage');

    const hasDisadvantage =
      flags.has('initiative.disadvantage')
      || flags.has('abilityCheck.disadvantage.dexterity')
      || flags.has('abilityCheck.disadvantage');

    if (hasAdvantage && !hasDisadvantage) {
      initialRollMode = 'advantage';
    }

    if (!hasAdvantage && hasDisadvantage) {
      initialRollMode = 'disadvantage';
    }

    openDiceRoll({
      modifier: initiative.value,
      title: 'Бросок инициативы',
      rollLabel: 'Инициатива',
      rollButtonText: 'Бросить инициативу',
      initialRollMode,
    });
  }

  /**
   * Обработчик клика по блоку инициативы:
   * - edit mode → модалка настройки
   * - view mode → модалка броска
   */
  function handleInitiativeClick() {
    if (props.isEditMode) {
      isInitiativeOpen.value = true;
    } else {
      openInitiativeRoll();
    }
  }

  function onInitiativeApply(data: {
    initiativeBonus: number;
    initiativeAbility: AbilityType;
  }) {
    emit('update:actor', {
      system: { ...props.actor.system, ...data },
    });
  }

  // --- Навыки ---

  /** Порядок переключения уровней владения */
  const LEVEL_ORDER: ProficiencyLevel[] = [
    'none',
    'half',
    'proficient',
    'expertise',
  ];

  /**
   * Переключает уровень владения навыком по кругу:
   * none → half → proficient → expertise → none
   *
   * @param skill - Ключ навыка
   */
  function cycleSkillProficiency(skill: SkillType) {
    if (!props.isEditMode) {
      return;
    }

    const currentLevel =
      props.actor.system.proficiencies.skills[skill] ?? 'none';

    const currentIndex = LEVEL_ORDER.indexOf(currentLevel);
    const nextLevel = LEVEL_ORDER[(currentIndex + 1) % LEVEL_ORDER.length];

    const updatedSkills = { ...props.actor.system.proficiencies.skills };

    if (nextLevel === 'none') {
      delete updatedSkills[skill];
    } else {
      updatedSkills[skill] = nextLevel;
    }

    emit('update:actor', {
      system: {
        ...props.actor.system,
        proficiencies: {
          ...props.actor.system.proficiencies,
          skills: updatedSkills,
        },
      },
    });
  }

  /**
   * Обработчик броска навыка
   * @param modifier - модификатор навыка
   * @param label - название навыка
   * @param key - ключ навыка
   */
  function handleSkillRoll(modifier: number, label: string, key?: SkillType) {
    let initialRollMode: AttackRollMode = 'normal';

    if (key) {
      const ability = getSkillAbility(key);
      const flags = resolvedStats.value?.activeFlags ?? new Set();

      const hasAdvantage =
        flags.has('abilityCheck.advantage')
        || flags.has(`abilityCheck.advantage.${ability}`);

      const hasDisadvantage =
        flags.has('abilityCheck.disadvantage')
        || flags.has(`abilityCheck.disadvantage.${ability}`)
        // Помеха конкретного навыка (напр. Скрытность от брони)
        || (key === 'stealth' && flags.has('skill.stealth.disadvantage'));

      if (hasAdvantage && !hasDisadvantage) {
        initialRollMode = 'advantage';
      }

      if (!hasAdvantage && hasDisadvantage) {
        initialRollMode = 'disadvantage';
      }
    }

    openDiceRoll({
      modifier,
      title: `Проверка: ${label}`,
      rollLabel: `Проверка ${label}`,
      rollButtonText: 'Бросить проверку',
      initialRollMode,
    });
  }
</script>

<template>
  <div
    v-bind="$attrs"
    class="flex h-full flex-col gap-3"
  >
    <!-- Ходьба + Инициатива -->
    <div class="grid grid-cols-2 gap-3">
      <!-- Ходьба -->
      <UTooltip
        :delay-duration="300"
        :ui="{ content: 'h-auto' }"
      >
        <FieldsetLabel
          :label="displayMovement.label"
          center
          class="h-12 bg-default/20 transition-colors"
          :class="[
            isEditMode
              ? 'cursor-pointer border-gold/30 hover:border-gold/50'
              : 'border-muted',
          ]"
          @click.left.exact.prevent="isEditMode && openMovement()"
        >
          <div class="flex items-center justify-center px-2 pb-2">
            <div class="flex items-baseline gap-1">
              <span class="text-xl font-bold text-highlighted">{{
                displayMovement.value
              }}</span>

              <span class="text-[10px] font-medium text-dimmed">{{
                DISTANCE_UNIT_SHORT[actor.system.movement.units ?? 'ft']
              }}</span>
            </div>
          </div>
        </FieldsetLabel>

        <template #content>
          <div class="flex flex-col gap-1">
            <div
              v-for="item in movementList"
              :key="item.type"
              class="flex items-center gap-2"
            >
              <span class="tabular-nums opacity-70"
                >{{ item.value }}
                {{
                  DISTANCE_UNIT_SHORT[actor.system.movement.units ?? 'ft']
                }}</span
              >

              <span>{{ item.label }}</span>
            </div>
          </div>
        </template>
      </UTooltip>

      <!-- Инициатива -->
      <UTooltip :delay-duration="300">
        <FieldsetLabel
          label="Инициатива"
          center
          class="h-12 bg-default/20 transition-colors"
          :class="
            props.isEditMode
              ? 'cursor-pointer border-gold/30 hover:border-gold/50'
              : 'cursor-pointer border-muted hover:border-primary-500/50'
          "
          @click.left.exact.prevent="handleInitiativeClick"
        >
          <div class="flex items-center justify-center px-2 pb-2">
            <div
              class="text-xl font-bold"
              :class="initiative >= 0 ? 'text-highlighted' : 'text-danger'"
            >
              {{ formattedInitiative }}
            </div>
          </div>
        </FieldsetLabel>

        <template #content>
          <span>{{ initiativeTooltip }}</span>
        </template>
      </UTooltip>
    </div>

    <!-- Счётчики классовых ресурсов -->
    <ClassCounters
      :actor="actor"
      :counter-definitions="counterDefinitions"
      :is-edit-mode="isEditMode"
      @update:actor="emit('update:actor', $event)"
    />

    <!-- Навыки -->
    <FieldsetLabel
      label="Навыки"
      class="flex flex-col overflow-hidden border-muted"
    >
      <div class="custom-scrollbar flex-1 overflow-y-auto p-1.5">
        <div class="flex flex-col">
          <SkillItem
            v-for="skill in skills"
            :key="skill.key"
            :label="skill.label"
            :skill-key="skill.key"
            :proficiency-level="
              actor.system.proficiencies.skills[skill.key] ?? 'none'
            "
            :modifier="resolvedStats?.skills[skill.key] ?? 0"
            :is-edit-mode="isEditMode"
            @cycle-proficiency="cycleSkillProficiency(skill.key)"
            @roll="handleSkillRoll"
          />
        </div>
      </div>
    </FieldsetLabel>
  </div>

  <!-- Модалка броска -->
  <DiceRollModal
    v-model:open="isDiceRollOpen"
    :modifier="diceRollConfig.modifier"
    :title="diceRollConfig.title"
    :roll-label="diceRollConfig.rollLabel"
    :roll-button-text="diceRollConfig.rollButtonText"
    :initial-roll-mode="diceRollConfig.initialRollMode"
  />

  <!-- Модалка движения -->
  <MovementModal
    v-model:open="isMovementOpen"
    :movement="actor.system.movement"
    :active-effects="combinedEffects"
    @apply="onMovementApply"
  />

  <!-- Модалка инициативы -->
  <InitiativeModal
    v-model:open="isInitiativeOpen"
    :initiative-bonus="actor.system.initiativeBonus ?? 0"
    :initiative-ability="actor.system.initiativeAbility ?? 'dexterity'"
    :ability-scores="{
      strength: actor.system.abilities.strength,
      dexterity: actor.system.abilities.dexterity,
      constitution: actor.system.abilities.constitution,
      intelligence: actor.system.abilities.intelligence,
      wisdom: actor.system.abilities.wisdom,
      charisma: actor.system.abilities.charisma,
    }"
    @apply="onInitiativeApply"
  />
</template>

<style scoped>
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgb(75 85 99 / 0.5);
    border-radius: 20px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgb(107 114 128 / 0.6);
  }
</style>
