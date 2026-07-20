<script setup lang="ts">
  import type { TypedWebSocketClient } from '@vtt/shared';
  import type { Actor, SpeciesDefinition } from '@vtt/shared/system/dnd.js';

  import { computed, toRef, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  import { useSpeciesGrantedSpellsResolver } from '../../../composables/useSpeciesGrantedSpellsResolver';
  import { useSpeciesWizard } from './useSpeciesWizard';
  import WizardStepFeatures from './WizardStepFeatures.vue';
  import WizardStepGrants from './WizardStepGrants.vue';
  import WizardStepOverview from './WizardStepOverview.vue';

  const props = defineProps<{
    open: boolean;
    actor: Actor;
    speciesDefinition: SpeciesDefinition | null;
    previousSpeciesDefinition?: SpeciesDefinition | null;
    /** Сокет для загрузки granted-заклинаний из компендиума */
    socket: TypedWebSocketClient | null;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [
      systemUpdates: Partial<Actor['system']>,
      rootUpdates: Partial<Actor>,
    ];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const actorRef = computed(() => props.actor);
  const speciesDefRef = computed(() => props.speciesDefinition);

  const {
    state,
    steps,
    currentStepIndex,
    currentStep,
    nextStep,
    prevStep,
    canProceed,
    isFinalStep,
    grantedSpellSources,
    buildUpdates,
  } = useSpeciesWizard(actorRef, speciesDefRef);

  /** Granted-заклинания особенностей вида с данными из компендиума (по пакам) */
  const { resolvedGrantedSpells } = useSpeciesGrantedSpellsResolver(
    toRef(props, 'socket'),
    grantedSpellSources,
  );

  watch(
    () => props.open,
    (newVal) => {
      if (newVal) {
        currentStepIndex.value = 0;
      }
    },
  );

  function handleCancel() {
    isOpen.value = false;
  }

  const activeStepKey = computed(() => currentStep.value?.key);

  function goToStep(index: number) {
    currentStepIndex.value = index;
  }

  function handleApply() {
    if (!canProceed.value) {
      return;
    }

    // Если мы не на последнем шаге - просто идем дальше
    if (!isFinalStep.value) {
      nextStep();

      return;
    }

    const { systemUpdates, rootUpdates } = buildUpdates(
      props.previousSpeciesDefinition,
      resolvedGrantedSpells.value,
    );

    emit('apply', systemUpdates, rootUpdates);
    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="800"
    :initial-width="800"
    :min-height="400"
    title="Настройка вида"
    :z-index="Z_INDEX.MODAL_ELEVATED * 2"
  >
    <template #body>
      <div
        v-if="speciesDefinition"
        class="flex flex-col gap-4"
      >
        <!-- Инфо о виде -->
        <div class="rounded-lg border border-default/50 bg-elevated/30 p-3">
          <div>
            <h3 class="text-lg font-medium text-highlighted">
              {{ speciesDefinition.name }}
            </h3>

            <p class="text-sm text-dimmed">Создание персонажа</p>
          </div>
        </div>

        <!-- Индикатор прогресса (шаги) -->
        <div
          v-if="steps.length > 1"
          class="flex items-center gap-1"
        >
          <template
            v-for="(step, stepIdx) in steps"
            :key="step.key"
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
          <WizardStepOverview
            v-if="activeStepKey === 'overview'"
            v-model:state="state"
            :species-definition="speciesDefinition"
          />

          <WizardStepGrants
            v-if="activeStepKey === 'grants'"
            v-model:state="state"
            :species-definition="speciesDefinition"
          />

          <WizardStepFeatures
            v-if="activeStepKey === 'features'"
            v-model:state="state"
            :species-definition="speciesDefinition"
            :granted-spells="resolvedGrantedSpells"
          />
        </div>
      </div>

      <div
        v-else
        class="flex h-full items-center justify-center p-8"
      >
        <UIcon
          name="tabler:loader-2"
          class="animate-spin text-3xl text-dimmed"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between">
        <UButton
          color="neutral"
          variant="ghost"
          icon="tabler:arrow-left"
          :class="{ invisible: currentStepIndex === 0 }"
          @click.left.exact.prevent="prevStep"
        >
          Назад
        </UButton>

        <div class="flex gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            @click.left.exact.prevent="handleCancel"
          >
            Отмена
          </UButton>

          <UButton
            v-if="!isFinalStep"
            color="primary"
            :disabled="!canProceed"
            @click.left.exact.prevent="nextStep"
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
            @click.left.exact.prevent="handleApply"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
