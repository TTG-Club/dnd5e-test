<script setup lang="ts">
  import type { Feature, TypedWebSocketClient } from '@vtt/shared';
  import type {
    Actor,
    BackgroundDefinition,
    GrantedSpellSource,
  } from '@vtt/shared/system/dnd.js';
  import type { ComponentPublicInstance } from 'vue';

  import {
    collectFeatGrantedSpellSources,
    collectGrantedSpellSources,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, toRef, watch } from 'vue';

  import { loadCompendiumKind } from '@/core/compendiumDataClient';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';

  import { useGrantedSpellsResolver } from '../../../composables/useGrantedSpellsResolver';
  import { useSourceLabels } from '../../../composables/useSourceLabel';
  import {
    backgroundSpellSource,
    useBackgroundWizard,
  } from './useBackgroundWizard';
  import WizardStepAbilities from './WizardStepAbilities.vue';
  import WizardStepEquipment from './WizardStepEquipment.vue';
  import WizardStepOverview from './WizardStepOverview.vue';
  import WizardStepTools from './WizardStepTools.vue';

  const props = defineProps<{
    open: boolean;
    actor: Actor;
    backgroundDefinition: BackgroundDefinition | null;
    socket: TypedWebSocketClient | null;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [
      systemUpdates: Partial<Actor['system']>,
      rootUpdates: Partial<Actor>,
    ];
  }>();

  const modalRef = ref<ComponentPublicInstance | null>(null);

  const { getSourceLabel } = useSourceLabels();

  // Для фитов из SRD
  const featsData = ref<Feature[]>([]);
  const isLoadingFeats = ref(false);

  // Композабл мастера
  const {
    currentStepInfo,
    selectedScheme,
    abilityAllocation,
    toolSelections,
    selectedFeatId,
    wizardSteps: wizardStepKeys,
    canProceed,
    nextStep,
    previousStep,
    buildUpdates,
  } = useBackgroundWizard(
    toRef(props, 'backgroundDefinition'),
    toRef(props, 'actor'),
    toRef(props, 'open'),
  );

  const wizardSteps = computed(() => {
    const titles: Record<string, string> = {
      overview: 'Обзор',
      tools: 'Инструменты',
      abilities: 'Характеристики',
      equipment: 'Снаряжение',
    };

    return wizardStepKeys.value.map((key) => ({
      value: key,
      title: titles[key] || key,
    }));
  });

  function goToStep(targetIndex: number) {
    const step = wizardSteps.value[targetIndex];

    if (step) {
      currentStepInfo.value = {
        stepGroup: step.value as typeof currentStepInfo.value.stepGroup,
        index: targetIndex + 1,
        total: wizardSteps.value.length,
      };
    }
  }

  function isFeature(value: unknown): value is Feature {
    return (
      typeof value === 'object'
      && value !== null
      && 'id' in value
      && 'name' in value
      && 'source' in value
      && 'description' in value
    );
  }

  /**
   * Загружает черты компендиума с сервера (агрегировано по всем пакам: бандл +
   * скачиваемые + модули) в `featsData`.
   */
  async function loadFeats(): Promise<void> {
    if (!props.socket) {
      return;
    }

    isLoadingFeats.value = true;

    const entries = await loadCompendiumKind(props.socket, 'feat');

    featsData.value = entries.filter(isFeature);
    isLoadingFeats.value = false;
  }

  // Запрашиваем черты с сервера при открытии модалки, если их ещё нет
  watch(
    () => props.open,
    (isOpen) => {
      if (
        !isOpen
        || featsData.value.length > 0
        || !props.backgroundDefinition
        || !props.socket
      ) {
        return;
      }

      void loadFeats();
    },
    { immediate: true },
  );

  /**
   * Заклинания, автоматически предоставляемые предысторией: от выбранной
   * черты-происхождения (`grantedSpells` черты) И от СОБСТВЕННОГО `featData`
   * предыстории. Источники последних помечаются отдельным именем
   * (`backgroundSpellSource`), чтобы откат снимал их раздельно от черты.
   */
  const grantedSpellSources = computed((): GrantedSpellSource[] => {
    const sources: GrantedSpellSource[] = [];

    const selectedFeat = featsData.value.find(
      (feat) => feat.id === selectedFeatId.value,
    );

    if (selectedFeat) {
      sources.push(...collectGrantedSpellSources([selectedFeat]));
    }

    const def = props.backgroundDefinition;

    if (def?.featData) {
      const ownSources = collectFeatGrantedSpellSources({
        name: def.name,
        featData: def.featData,
      });

      for (const source of ownSources) {
        sources.push({
          ...source,
          featureName: backgroundSpellSource(def.name),
        });
      }
    }

    return sources;
  });

  /** Granted-заклинания выбранной черты с данными из компендиума */
  const { resolvedGrantedSpells } = useGrantedSpellsResolver(
    toRef(props, 'socket'),
    grantedSpellSources,
  );

  function handleApply() {
    const { systemUpdates, rootUpdates } = buildUpdates(
      featsData.value,
      resolvedGrantedSpells.value,
    );

    emit('apply', systemUpdates, rootUpdates);
    emit('update:open', false);
  }

  function handleModalClose() {
    emit('update:open', false);
  }
</script>

<template>
  <UDraggableModal
    ref="modalRef"
    v-bind="$attrs"
    :open="open"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="800"
    :initial-width="800"
    :min-height="400"
    :title="
      backgroundDefinition
        ? `Предыстория: ${backgroundDefinition.name}`
        : 'Настройка предыстории'
    "
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="!backgroundDefinition"
        class="p-6 text-center text-muted"
      >
        Предыстория не выбрана. Перетащите предысторию из справочника.
      </div>

      <div
        v-else
        class="flex flex-col gap-4"
      >
        <!-- Инфо о предыстории -->
        <div class="rounded-lg border border-default/50 bg-elevated/30 p-3">
          <div class="flex items-center gap-3">
            <div>
              <h3 class="text-lg font-medium text-highlighted">
                {{ backgroundDefinition.name }}
              </h3>

              <p class="text-sm text-dimmed">
                Источник:
                <span class="font-medium text-primary-400">{{
                  getSourceLabel(backgroundDefinition.sourceKey) || 'PHB'
                }}</span>
              </p>
            </div>
          </div>
        </div>

        <!-- Индикатор прогресса (шаги) -->
        <div class="flex items-center gap-1">
          <template
            v-for="(step, stepIdx) in wizardSteps"
            :key="step.value"
          >
            <!-- Разделитель между шагами -->
            <div
              v-if="stepIdx > 0"
              class="h-px flex-1"
              :class="
                stepIdx < currentStepInfo.index
                  ? 'bg-primary-500/60'
                  : 'bg-accented/50'
              "
            />

            <!-- Кружок шага -->
            <button
              class="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors"
              :class="[
                stepIdx === currentStepInfo.index - 1
                  ? 'bg-primary-500/20 text-primary-400 ring-1 ring-primary-500/40'
                  : stepIdx < currentStepInfo.index - 1
                    ? 'bg-success/10 text-healing'
                    : 'text-dimmed',
                stepIdx > currentStepInfo.index - 1
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:bg-accented/30',
              ]"
              :disabled="stepIdx > currentStepInfo.index - 1"
              @click.left.exact.prevent="goToStep(stepIdx)"
            >
              <span class="hidden sm:inline">{{ step.title }}</span>
            </button>
          </template>
        </div>

        <!-- Контент текущего шага -->
        <div class="min-h-[200px]">
          <div
            v-if="isLoadingFeats"
            class="flex h-full items-center justify-center p-20"
          >
            <UIcon
              name="tabler:loader-2"
              class="animate-spin text-3xl text-dimmed"
            />
          </div>

          <template v-else>
            <!-- Шаг 1: Обзор -->
            <WizardStepOverview
              v-if="currentStepInfo.stepGroup === 'overview'"
              v-model:selected-feat-id="selectedFeatId"
              :background-definition="backgroundDefinition"
              :feats-data="featsData"
            />

            <!-- Шаг 1.5: Инструменты (условно) -->
            <WizardStepTools
              v-else-if="currentStepInfo.stepGroup === 'tools'"
              v-model:tool-selections="toolSelections"
              :background-definition="backgroundDefinition"
            />

            <!-- Шаг 2: Характеристики -->
            <WizardStepAbilities
              v-else-if="currentStepInfo.stepGroup === 'abilities'"
              v-model:selected-scheme="selectedScheme"
              v-model:ability-allocation="abilityAllocation"
              :background-definition="backgroundDefinition"
              :current-abilities="actor.system.abilities"
            />

            <!-- Шаг 3: Снаряжение -->
            <WizardStepEquipment
              v-else-if="currentStepInfo.stepGroup === 'equipment'"
              :equipment-options="backgroundDefinition.equipmentOptions"
            />
          </template>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between">
        <UButton
          v-if="currentStepInfo.index > 1"
          variant="ghost"
          color="neutral"
          icon="tabler:arrow-left"
          @click.left.exact.prevent="previousStep"
        >
          Назад
        </UButton>

        <div
          v-else
          class="w-1"
        />

        <div class="flex gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            @click.left.exact.prevent="handleModalClose"
          >
            Отмена
          </UButton>

          <UButton
            v-if="currentStepInfo.index < currentStepInfo.total"
            color="primary"
            :disabled="!canProceed || isLoadingFeats"
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
            :disabled="isLoadingFeats"
            @click.left.exact.prevent="handleApply"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
