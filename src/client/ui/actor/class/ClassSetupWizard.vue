<script setup lang="ts">
  /**
   * Пошаговый мастер добавления / повышения уровня класса (D&D 5.5 2024).
   *
   * Динамически формирует шаги на основе контекста:
   * - Первый класс: ХП → Спасброски → Владения → Навыки → Особенности → Заклинания
   * - Level Up: ХП → Особенности → Заклинания → ASI (при необходимости)
   * - Мультикласс: ХП → Владения (сокращённые) → Навыки → Особенности → Заклинания
   */
  import type { SkillType, TypedWebSocketClient } from '@vtt/shared';
  import type {
    Actor,
    ClassDefinition,
    DnDAbilityScores,
    HitPointMethod,
  } from '@vtt/shared/system/dnd.js';

  import type { WizardAsiState } from './wizard';

  import { resolveActorStats } from '@vtt/shared/system/dnd.js';
  import { computed, nextTick, ref, toRef } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  import { useGrantedSpellsResolver } from '../../../composables/useGrantedSpellsResolver';
  import { useClassWizard } from './wizard';
  import WizardStepAsi from './wizard/WizardStepAsi.vue';
  import WizardStepFeatures from './wizard/WizardStepFeatures.vue';
  import WizardStepHitPoints from './wizard/WizardStepHitPoints.vue';
  import WizardStepProficiencies from './wizard/WizardStepProficiencies.vue';
  import WizardStepSavingThrows from './wizard/WizardStepSavingThrows.vue';
  import WizardStepSkills from './wizard/WizardStepSkills.vue';
  import WizardStepSpellcasting from './wizard/WizardStepSpellcasting.vue';

  const props = defineProps<{
    open: boolean;
    actor: Actor;
    classDefinition: ClassDefinition | null;
    /** Сокет для загрузки данных компендиума на шаге заклинаний */
    socket: TypedWebSocketClient | null;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    /** Вызывается после подтверждения, возвращает обновления для записи в актора */
    'apply': [
      systemUpdates: Partial<Actor['system']>,
      rootUpdates: Partial<Actor>,
    ];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const classDefRef = toRef(props, 'classDefinition');
  const actorRef = toRef(props, 'actor');

  /**
   * Итоговые характеристики с учётом активных эффектов
   * (бонусы предыстории, прошлые повышения характеристик).
   */
  const resolvedAbilities = computed<DnDAbilityScores>(() => {
    try {
      return resolveActorStats(props.actor).abilities;
    } catch {
      return props.actor.system.abilities;
    }
  });

  const {
    isFirstClass,
    isMulticlass,
    nextLevel,
    isMaxHitDieLevel,
    averageHitPoints,
    levelFeatures,
    hasSubclassSelection,
    activeSubclass,
    skillChoicesCount,
    availableSkills,
    alreadyProficientSkills,

    wizardSteps,
    activeStepKey,
    isFirstStep,
    isLastStep,
    currentStepIndex,

    wizardState,
    canProceed,
    isSpellSelectionComplete,
    spellSelectionLimits,
    grantedSpellSources,

    nextStep,
    prevStep,

    buildUpdates,
  } = useClassWizard(classDefRef, actorRef, isOpen);

  /** Granted-заклинания умений текущего уровня с данными из компендиума */
  const { resolvedGrantedSpells } = useGrantedSpellsResolver(
    toRef(props, 'socket'),
    grantedSpellSources,
  );

  /** Ссылка на шаг заклинаний — для открытия компендиума из предупреждения */
  const spellcastingStepRef = ref<InstanceType<
    typeof WizardStepSpellcasting
  > | null>(null);

  /** Открыто ли предупреждение о невыбранных заклинаниях */
  const showSpellWarning = ref(false);

  /** Действие, отложенное до подтверждения предупреждения */
  const pendingAction = ref<'next' | 'complete' | null>(null);

  /** Заголовок модального окна */
  const modalTitle = computed(() => {
    if (isFirstClass.value) {
      return 'Добавление класса';
    }

    if (isMulticlass.value) {
      return 'Мультикласс';
    }

    return 'Повышение уровня';
  });

  /** Текст кнопки «Применить» */
  const applyButtonLabel = computed(() => {
    if (isFirstClass.value) {
      return 'Применить';
    }

    if (isMulticlass.value) {
      return 'Добавить класс';
    }

    return 'Повысить уровень';
  });

  // ── Обработчики шагов ─────────────────────────────────────

  /**
   * Сохраняет результат шага хитов: значение и выбранный метод расчёта.
   *
   * @param payload - данные шага хитов
   * @param payload.value - итоговое количество хитов
   * @param payload.method - метод определения хитов (фикс/бросок/среднее)
   */
  function handleHitPointsUpdate(payload: {
    value: number;
    method: HitPointMethod;
  }) {
    wizardState.hitPoints.value = payload.value;
    wizardState.hitPoints.method = payload.method;
  }

  /**
   * Сохраняет выбранные на шаге навыки в состоянии мастера.
   *
   * @param skills - список выбранных навыков
   */
  function handleSkillsUpdate(skills: SkillType[]) {
    wizardState.selectedSkills = skills;
  }

  /**
   * Сохраняет выбор опций особенностей класса в состоянии мастера.
   *
   * @param choices - карта «ключ особенности → выбранный вариант»
   */
  function handleFeatureChoicesUpdate(choices: Record<string, string>) {
    wizardState.featureChoices = choices;
  }

  /**
   * Сохраняет состояние шага повышения характеристик (ASI) в мастере.
   *
   * @param asiState - состояние выбора ASI
   */
  function handleAsiUpdate(asiState: WizardAsiState) {
    wizardState.asi = asiState;
  }

  /** Переход к конкретному шагу по индексу */
  function goToStep(targetIndex: number) {
    currentStepIndex.value = targetIndex;
  }

  /**
   * Завершает работу мастера: собирает обновления актора, эмитит их
   * родителю через событие `apply` и закрывает модальное окно.
   */
  function handleComplete(): void {
    const { systemUpdates, rootUpdates } = buildUpdates(
      resolvedGrantedSpells.value,
    );

    emit('apply', systemUpdates, rootUpdates);
    isOpen.value = false;
  }

  /**
   * Проверяет, находимся ли мы на шаге заклинаний с незавершённым выбором.
   *
   * @returns `true`, если шаг заклинаний активен и выбор не завершён
   */
  function isSpellStepIncomplete(): boolean {
    return (
      activeStepKey.value === 'spellcasting' && !isSpellSelectionComplete.value
    );
  }

  /**
   * Обрабатывает клик по кнопке «Далее».
   * Предупреждает о неполном выборе заклинаний, если это применимо.
   */
  function handleNextClick(): void {
    if (isSpellStepIncomplete()) {
      pendingAction.value = 'next';
      showSpellWarning.value = true;

      return;
    }

    nextStep();
  }

  /**
   * Обрабатывает клик по кнопке «Применить».
   * Предупреждает о неполном выборе заклинаний, если это применимо.
   */
  function handleApplyClick(): void {
    if (isSpellStepIncomplete()) {
      pendingAction.value = 'complete';
      showSpellWarning.value = true;

      return;
    }

    handleComplete();
  }

  /**
   * Позволяет продолжить работу мастера без выбора заклинаний.
   * Закрывает предупреждение и выполняет ранее отложенное действие.
   */
  function continueWithoutSpells(): void {
    showSpellWarning.value = false;

    const action = pendingAction.value;

    pendingAction.value = null;

    if (action === 'next') {
      nextStep();
    } else if (action === 'complete') {
      handleComplete();
    }
  }

  /**
   * Открывает окно выбора заклинаний (компендиум) на текущем шаге.
   */
  function chooseSpellsNow(): void {
    showSpellWarning.value = false;
    pendingAction.value = null;

    nextTick(() => {
      spellcastingStepRef.value?.openSpellBrowser();
    });
  }

  /**
   * Отменяет предупреждение о невыбранных заклинаниях и возвращает в мастер.
   */
  function cancelSpellWarning(): void {
    showSpellWarning.value = false;
    pendingAction.value = null;
  }

  /**
   * Реакция на изменение состояния открытия модалки-предупреждения.
   * Закрытие извне (overlay/Escape) трактуем как отмену.
   *
   * @param value - новое состояние открытия
   */
  function handleWarningOpenChange(value: boolean): void {
    if (!value) {
      cancelSpellWarning();
    }
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="true"
    :resizable="false"
    :min-width="800"
    :initial-width="800"
    :min-height="400"
    :title="modalTitle"
  >
    <template #body>
      <div
        v-if="classDefinition"
        class="flex flex-col gap-4"
      >
        <!-- Инфо о классе -->
        <div class="rounded-lg border border-default/50 bg-elevated/30 p-3">
          <div>
            <h3 class="text-lg font-medium text-highlighted">
              {{ classDefinition.name }}
            </h3>

            <p class="text-sm text-dimmed">
              Получаемый уровень:
              <span class="font-bold text-toned">{{ nextLevel }}</span>
            </p>
          </div>
        </div>

        <!-- Индикатор прогресса (шаги) -->
        <div
          v-if="wizardSteps.length > 1"
          class="flex items-center gap-1"
        >
          <template
            v-for="(step, stepIdx) in wizardSteps"
            :key="step.value"
          >
            <!-- Разделитель между шагами -->
            <div
              v-if="stepIdx > 0"
              class="h-px flex-1"
              :class="
                stepIdx <= currentStepIndex
                  ? 'bg-primary-500/60'
                  : 'bg-accented/50'
              "
            />

            <!-- Кружок шага -->
            <button
              class="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors"
              :class="[
                stepIdx === currentStepIndex
                  ? 'bg-primary-500/20 text-primary-400 ring-1 ring-primary-500/40'
                  : stepIdx < currentStepIndex
                    ? 'bg-success/10 text-healing'
                    : 'text-dimmed',
                stepIdx > currentStepIndex
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:bg-accented/30',
              ]"
              :disabled="stepIdx > currentStepIndex"
              @click.left.exact.prevent="goToStep(stepIdx)"
            >
              <span class="hidden sm:inline">{{ step.title }}</span>
            </button>
          </template>
        </div>

        <!-- Контент текущего шага -->
        <div class="min-h-[200px]">
          <!-- ХП -->
          <WizardStepHitPoints
            v-if="activeStepKey === 'hitPoints'"
            :class-definition="classDefinition"
            :next-level="nextLevel"
            :is-max-hit-die-level="isMaxHitDieLevel"
            :hit-point-value="wizardState.hitPoints.value"
            :hit-point-method="wizardState.hitPoints.method"
            :average-hit-points="averageHitPoints"
            @update:hit-points="handleHitPointsUpdate"
          />

          <!-- Спасброски -->
          <WizardStepSavingThrows
            v-if="activeStepKey === 'savingThrows'"
            :class-definition="classDefinition"
            :is-first-class="isFirstClass"
          />

          <!-- Владения -->
          <WizardStepProficiencies
            v-if="activeStepKey === 'proficiencies'"
            :class-definition="classDefinition"
            :is-first-class="isFirstClass"
            :is-multiclass="isMulticlass"
          />

          <!-- Навыки -->
          <WizardStepSkills
            v-if="activeStepKey === 'skills'"
            :available-skills="availableSkills"
            :selected-skills="wizardState.selectedSkills"
            :max-count="skillChoicesCount"
            :already-proficient-skills="alreadyProficientSkills"
            @update:selected-skills="handleSkillsUpdate"
          />

          <!-- Особенности -->
          <WizardStepFeatures
            v-if="activeStepKey === 'features'"
            :features="levelFeatures"
            :feature-choices="wizardState.featureChoices"
            :has-subclass-selection="hasSubclassSelection"
            :subclasses="classDefinition.subclasses"
            :subclass-key="wizardState.subclassKey"
            :subclass-label="classDefinition.subclassLabel"
            @update:feature-choices="handleFeatureChoicesUpdate"
            @update:subclass-key="wizardState.subclassKey = $event"
          />

          <!-- Заклинания -->
          <WizardStepSpellcasting
            v-if="activeStepKey === 'spellcasting'"
            ref="spellcastingStepRef"
            :class-definition="classDefinition"
            :next-level="nextLevel"
            :socket="socket"
            :selected-spells="wizardState.selectedSpells"
            :active-subclass="activeSubclass"
            :cantrips-limit="spellSelectionLimits.cantrips"
            :spells-limit="spellSelectionLimits.spells"
            :spells-by-level="spellSelectionLimits.spellsByLevel"
            :granted-spells="resolvedGrantedSpells"
            :actor="actor"
            @update:selected-spells="wizardState.selectedSpells = $event"
          />

          <!-- ASI -->
          <WizardStepAsi
            v-if="activeStepKey === 'asi'"
            :current-abilities="resolvedAbilities"
            :asi-state="wizardState.asi"
            @update:asi-state="handleAsiUpdate"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <!-- Навигация: Назад / Далее / Применить -->
      <div class="flex justify-between">
        <UButton
          v-if="!isFirstStep"
          variant="ghost"
          color="neutral"
          icon="tabler:arrow-left"
          @click.left.exact.prevent="prevStep"
        >
          Назад
        </UButton>

        <!-- Пустой спейсер если нет кнопки «Назад» -->
        <div
          v-else
          class="w-1"
        />

        <div class="flex gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            @click.left.exact.prevent="isOpen = false"
          >
            Отмена
          </UButton>

          <UButton
            v-if="!isLastStep"
            color="primary"
            :disabled="!canProceed"
            @click.left.exact.prevent="handleNextClick"
          >
            Далее
            <template #trailing>
              <UIcon name="tabler:arrow-right" />
            </template>
          </UButton>

          <UButton
            v-else
            color="primary"
            :disabled="!canProceed"
            @click.left.exact.prevent="handleApplyClick"
          >
            {{ applyButtonLabel }}
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>

  <!-- Предупреждение: заклинания не выбраны -->
  <UDraggableModal
    :open="showSpellWarning"
    title="Заклинания не выбраны"
    :draggable="false"
    blocking
    :ui="{
      overlay: `z-${Z_INDEX.MODAL_ELEVATED}`,
      content: `w-[calc(100vw-2rem)] max-w-lg z-${Z_INDEX.MODAL_ELEVATED}`,
    }"
    @update:open="handleWarningOpenChange"
  >
    <template #body>
      <div class="space-y-4 p-4 text-center">
        <UIcon
          name="tabler:alert-triangle"
          class="mx-auto h-12 w-12 text-warning"
        />

        <p class="text-toned">
          Вы выбрали не все доступные заклинания для этого уровня.
          <br />

          <span class="text-xs text-dimmed">
            Их можно выбрать позже в разделе заклинаний персонажа.
          </span>
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-center gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          @click.left.exact.prevent="cancelSpellWarning"
        >
          Отмена
        </UButton>

        <UButton
          variant="soft"
          color="primary"
          icon="tabler:book-2"
          @click.left.exact.prevent="chooseSpellsNow"
        >
          Выбрать сразу
        </UButton>

        <UButton
          color="primary"
          icon="tabler:check"
          @click.left.exact.prevent="continueWithoutSpells"
        >
          Продолжить без них
        </UButton>
      </div>
    </template>
  </UDraggableModal>
</template>
