<script setup lang="ts">
  import type {
    ResolvedGrantedSpell,
    SpeciesDefinition,
    SpeciesFeature,
    SpeciesFeatureChoice,
  } from '@vtt/shared/system/dnd.js';

  import type { SpeciesWizardState } from './useSpeciesWizard';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';

  const props = defineProps<{
    speciesDefinition: SpeciesDefinition;
    state: SpeciesWizardState;
    /** Granted-заклинания особенностей вида с данными из компендиума */
    grantedSpells: ResolvedGrantedSpell[];
  }>();

  const emit = defineEmits<{
    'update:state': [value: SpeciesWizardState];
  }>();

  /**
   * Обновляет выбранный вариант для особенности вида.
   * @param featureKey - ключ особенности
   * @param choiceKey - ключ выбранного варианта
   */
  function selectFeatureChoice(featureKey: string, choiceKey: string) {
    emit('update:state', {
      ...props.state,
      featureChoices: {
        ...props.state.featureChoices,
        [featureKey]: choiceKey,
      },
    });
  }

  /**
   * Возвращает granted-заклинания, предоставляемые указанной особенностью.
   *
   * @param featureName - название особенности вида
   */
  function getGrantedSpellsOfFeature(
    featureName: string,
  ): ResolvedGrantedSpell[] {
    return props.grantedSpells.filter(
      (granted) => granted.featureName === featureName,
    );
  }

  /**
   * Возвращает выбранный вариант (подвид) для особенности, если он выбран.
   *
   * @param feature - особенность вида с вариантами
   */
  function getSelectedChoice(
    feature: SpeciesFeature,
  ): SpeciesFeatureChoice | undefined {
    return feature.choices?.find(
      (option) => option.key === props.state.featureChoices[feature.key],
    );
  }

  /**
   * Опции селекта вариантов (подвидов) для особенности.
   *
   * @param feature - особенность вида с вариантами
   */
  function getFeatureChoiceOptions(
    feature: SpeciesFeature,
  ): { value: string; label: string }[] {
    return (feature.choices ?? []).map((choice) => ({
      value: choice.key,
      label: choice.name,
    }));
  }
</script>

<template>
  <div class="flex flex-col gap-4 p-1">
    <div
      v-for="feature in speciesDefinition.features"
      :key="feature.key"
      class="flex flex-col gap-3 rounded-lg bg-elevated p-4"
    >
      <span class="font-medium text-primary-400">
        {{ feature.name }}
      </span>

      <ItemDescriptionRenderer :content="feature.description" />

      <!-- Заклинания, автоматически предоставляемые особенностью -->
      <div
        v-if="getGrantedSpellsOfFeature(feature.name).length > 0"
        class="flex flex-wrap gap-1.5"
      >
        <UBadge
          v-for="granted in getGrantedSpellsOfFeature(feature.name)"
          :key="granted.spell.id"
          color="primary"
          variant="subtle"
          size="md"
          class="gap-1.5"
        >
          <UIcon
            name="tabler:lock"
            class="size-3.5 opacity-60"
          />
          {{ granted.spell.name }}

          <span class="text-[10px] opacity-60">
            Умение: {{ granted.featureName }}
          </span>
        </UBadge>
      </div>

      <!-- Если есть выбор внутри фичи (например, наследие драконорожденного) -->
      <div
        v-if="feature.choices && feature.choices.length > 0"
        class="mt-2 rounded-lg bg-default/50 p-3"
      >
        <span class="mb-2 block text-xs font-medium text-muted">
          Сделайте выбор:
        </span>

        <USelectMenu
          :model-value="state.featureChoices[feature.key]"
          :items="getFeatureChoiceOptions(feature)"
          value-key="value"
          label-key="label"
          placeholder="Выберите вариант..."
          @update:model-value="selectFeatureChoice(feature.key, $event)"
        />

        <template v-if="getSelectedChoice(feature)">
          <div class="mt-3 text-sm text-muted">
            {{ getSelectedChoice(feature)?.description }}
          </div>

          <!-- Что даёт выбранный подвид (со своими уровнями) -->
          <div
            v-if="getSelectedChoice(feature)?.features?.length"
            class="mt-3 flex flex-col gap-2"
          >
            <div
              v-for="subFeature in getSelectedChoice(feature)?.features ?? []"
              :key="subFeature.key"
              class="rounded-md border border-default/40 bg-default/40 p-2"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-healing">
                  {{ subFeature.name }}
                </span>

                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  {{ subFeature.level ?? 1 }} ур.
                </UBadge>
              </div>

              <ItemDescriptionRenderer
                :content="subFeature.description"
                class="mt-1"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
