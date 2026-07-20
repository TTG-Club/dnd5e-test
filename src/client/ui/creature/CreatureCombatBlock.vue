<script setup lang="ts">
  import type { ActorMovement } from '@vtt/shared';
  import type { CreatureSystem } from '@vtt/shared/system/dnd.js';

  import { DISTANCE_UNIT_SHORT } from '@vtt/shared';
  import {
    getMovementList,
    rollDamageFormula,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import FieldsetLabel from '@/shared_ui/components/FieldsetLabel.vue';

  import ArmorClassModal from '../actor/ArmorClassModal.vue';
  import DiceRollModal from '../actor/DiceRollModal.vue';
  import InitiativeModal from '../actor/InitiativeModal.vue';
  import CreatureHitPointsModal from './CreatureHitPointsModal.vue';
  import CreatureMovementModal from './CreatureMovementModal.vue';

  interface Props {
    system: CreatureSystem;
    isEditMode: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:system': [updates: Partial<CreatureSystem>];
  }>();

  const dexModifier = computed(() => {
    const score = props.system.abilities?.dexterity ?? 10;

    return Math.floor((score - 10) / 2);
  });

  // --- Передвижение ---

  /** Дефолтные значения передвижения (для safety) */
  const DEFAULT_MOVEMENT: ActorMovement = {
    walk: 30,
    swim: 0,
    fly: 0,
    climb: 0,
    burrow: 0,
    hover: false,
    units: 'ft',
  };

  const creatureMovement = computed<ActorMovement>(
    () => props.system.movement ?? DEFAULT_MOVEMENT,
  );

  const movementList = computed(() => getMovementList(creatureMovement.value));

  const isMovementOpen = ref(false);

  function openMovement() {
    isMovementOpen.value = true;
  }

  /**
   * Применяет обновлённые данные передвижения
   */
  function onMovementApply(movement: ActorMovement) {
    emit('update:system', { movement });
  }

  // --- Хиты ---
  const isHitPointsOpen = ref(false);

  /** Класс значения временных ХП: золото при наличии, приглушённый при нуле */
  const tempHitPointsClass = computed(() =>
    (props.system.hitPoints?.temp ?? 0) > 0 ? 'text-gold/80' : 'text-dimmed',
  );

  function onHitPointsApply(
    data: Partial<import('@vtt/shared').CreatureHitPoints>,
  ) {
    emit('update:system', {
      hitPoints: {
        ...props.system.hitPoints,
        ...data,
      },
    });
  }

  /**
   * Бросает формулу здоровья и выставляет результат в максимум И в текущее
   * значение ХП. Минимум 1 (формула вроде «1к4 - 1» может дать 0).
   */
  function rollHitPointsFromFormula() {
    const formula = props.system.hitPoints?.formula;

    if (!formula) {
      return;
    }

    const { total } = rollDamageFormula(formula);
    const rolled = Math.max(1, total);

    emit('update:system', {
      hitPoints: {
        ...props.system.hitPoints,
        max: rolled,
        current: rolled,
      },
    });
  }

  // --- КД ---
  const isArmorClassOpen = ref(false);

  function onArmorClassApply(
    armorClass: import('@vtt/shared').ActorArmorClass,
  ) {
    emit('update:system', { armorClass });
  }

  // --- Инициатива ---
  const initiative = computed(() => {
    const ability = props.system.initiativeAbility ?? 'dexterity';
    const score = props.system.abilities?.[ability] ?? 10;
    const mod = Math.floor((score - 10) / 2);

    return mod + (props.system.initiativeBonus ?? 0);
  });

  const formattedInitiative = computed(() => {
    return initiative.value >= 0
      ? `+${initiative.value}`
      : `${initiative.value}`;
  });

  const isInitiativeOpen = ref(false);
  const isDiceRollOpen = ref(false);

  const diceRollConfig = ref({
    modifier: 0,
    title: '',
    rollLabel: '',
  });

  function handleInitiativeClick() {
    if (props.isEditMode) {
      isInitiativeOpen.value = true;
    } else {
      diceRollConfig.value = {
        modifier: initiative.value,
        title: 'Бросок инициативы',
        rollLabel: 'Инициатива',
      };

      isDiceRollOpen.value = true;
    }
  }

  function onInitiativeApply(data: {
    initiativeBonus: number;
    initiativeAbility: import('@vtt/shared').AbilityType;
  }) {
    emit('update:system', data);
  }
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-[1fr_min-content] gap-3">
      <!-- КД -->
      <FieldsetLabel
        label="Класс доспеха"
        center
        class="group h-full bg-default/20 transition-colors"
        :class="
          isEditMode
            ? 'cursor-pointer border-gold/30 hover:border-gold/50'
            : 'border-muted'
        "
        @click.left.exact.prevent="isEditMode && (isArmorClassOpen = true)"
      >
        <div class="flex h-full flex-col items-center justify-center p-2 pt-0">
          <div
            class="text-center text-xl font-bold text-highlighted tabular-nums"
          >
            {{ system.armorClass?.value ?? 10 }}
          </div>

          <div
            v-if="system.armorClass?.formula"
            class="mt-0.5 text-center text-xs leading-tight font-medium text-dimmed"
          >
            ({{ system.armorClass.formula }})
          </div>
        </div>
      </FieldsetLabel>

      <!-- Инициатива -->
      <FieldsetLabel
        label="Инициатива"
        center
        class="h-full bg-default/20 transition-colors"
        :class="
          isEditMode
            ? 'cursor-pointer border-gold/30 hover:border-gold/50'
            : 'cursor-pointer border-muted hover:border-primary/50'
        "
        @click.left.exact.prevent="handleInitiativeClick"
      >
        <div class="flex h-full items-center justify-center p-2 pt-0">
          <div
            class="text-xl font-bold tabular-nums"
            :class="initiative >= 0 ? 'text-highlighted' : 'text-danger'"
          >
            {{ formattedInitiative }}
          </div>
        </div>
      </FieldsetLabel>
    </div>

    <!-- Здоровье -->
    <FieldsetLabel
      label="Здоровье"
      class="group h-full cursor-pointer bg-default/20 transition-colors"
      :class="
        isEditMode
          ? 'border-gold/30 hover:border-gold/50'
          : 'border-muted hover:border-primary/50'
      "
      @click.left.exact.prevent="isHitPointsOpen = true"
    >
      <div class="flex h-full flex-col items-center justify-center p-2 pt-0">
        <!-- ХП: цифры + подписи -->
        <div class="flex w-full items-center">
          <span
            class="flex-1 text-center text-xl font-bold text-highlighted tabular-nums"
          >
            {{ system.hitPoints?.current ?? system.hitPoints?.average ?? 0 }}
          </span>

          <span class="w-3 text-center font-light text-dimmed">/</span>

          <span
            class="flex-1 text-center text-xl font-bold text-muted tabular-nums"
          >
            {{ system.hitPoints?.max ?? system.hitPoints?.average ?? 0 }}
          </span>

          <div class="mx-2 h-6 w-px bg-elevated" />

          <span
            class="flex-1 text-center text-xl font-bold tabular-nums"
            :class="tempHitPointsClass"
          >
            {{ system.hitPoints?.temp ?? 0 }}
          </span>
        </div>

        <div class="mt-0.5 flex w-full items-center">
          <span
            class="flex-1 text-center text-xs font-medium tracking-wider text-dimmed uppercase"
          >
            Сейчас
          </span>

          <span class="w-3" />

          <span
            class="flex-1 text-center text-xs font-medium tracking-wider text-dimmed uppercase"
          >
            Всего
          </span>

          <div class="mx-2 w-px" />

          <span
            class="flex-1 text-center text-xs font-medium tracking-wider text-dimmed uppercase"
          >
            Врем.
          </span>
        </div>

        <div class="my-2 w-full border-t border-muted/50" />

        <div class="relative flex w-full items-center justify-center gap-1">
          <UTooltip
            v-if="isEditMode && system.hitPoints?.formula"
            text="Сгенерировать здоровье по формуле"
          >
            <UButton
              icon="tabler:dice-5"
              variant="ghost"
              color="primary"
              size="xs"
              class="absolute top-1/2 left-0 -translate-y-1/2"
              @click.left.exact.stop.prevent="rollHitPointsFromFormula"
            />
          </UTooltip>

          <span class="text-xs font-bold tracking-wider text-dimmed uppercase">
            Формула:
          </span>

          <span class="text-xs font-medium text-toned">
            {{ system.hitPoints?.formula || '—' }}
          </span>
        </div>

        <div
          v-if="system.hitPoints?.text"
          class="mt-1 text-center text-xs font-medium text-dimmed"
        >
          {{ system.hitPoints.text }}
        </div>
      </div>
    </FieldsetLabel>

    <!-- Скорость -->
    <FieldsetLabel
      label="Скорость"
      class="bg-default/20 transition-colors"
      :class="[
        isEditMode
          ? 'cursor-pointer border-gold/30 hover:border-gold/50'
          : 'border-muted',
      ]"
      @click.left.exact.prevent="isEditMode && openMovement()"
    >
      <div class="flex flex-col gap-0.5 p-2 pt-1">
        <div
          v-for="item in movementList"
          :key="item.type"
          class="flex items-center justify-between text-sm"
        >
          <span class="text-toned">
            {{ item.label }}
            <span
              v-if="item.type === 'fly' && creatureMovement.hover"
              class="text-xs text-dimmed italic"
              >(зависание)</span
            >
          </span>

          <div class="flex items-baseline gap-0.5">
            <span class="font-bold text-highlighted tabular-nums">{{
              item.value
            }}</span>

            <span class="text-xs text-dimmed">{{
              DISTANCE_UNIT_SHORT[creatureMovement.units ?? 'ft']
            }}</span>
          </div>
        </div>

        <div
          v-if="movementList.length === 0"
          class="text-center text-xs text-dimmed italic"
        >
          —
        </div>
      </div>
    </FieldsetLabel>
  </div>

  <!-- Модалка передвижения -->
  <CreatureMovementModal
    v-model:open="isMovementOpen"
    :movement="creatureMovement"
    @apply="onMovementApply"
  />

  <!-- Модалка очков здоровья -->
  <CreatureHitPointsModal
    v-model:open="isHitPointsOpen"
    :hit-points="system.hitPoints"
    @apply="onHitPointsApply"
  />

  <!-- Модалка класса защиты -->
  <ArmorClassModal
    v-model:open="isArmorClassOpen"
    :armor-class="system.armorClass"
    :dex-modifier="dexModifier"
    is-creature-mode
    @apply="onArmorClassApply"
  />

  <!-- Модалка инициативы -->
  <InitiativeModal
    v-model:open="isInitiativeOpen"
    :initiative-bonus="system.initiativeBonus ?? 0"
    :initiative-ability="system.initiativeAbility ?? 'dexterity'"
    :ability-scores="system.abilities"
    @apply="onInitiativeApply"
  />

  <!-- Бросок дайсов -->
  <DiceRollModal
    v-model:open="isDiceRollOpen"
    :modifier="diceRollConfig.modifier"
    :title="diceRollConfig.title"
    :roll-label="diceRollConfig.rollLabel"
    roll-button-text="Бросить инициативу"
    initial-roll-mode="normal"
  />
</template>
