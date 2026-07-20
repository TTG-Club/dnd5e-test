<script setup lang="ts">
  import type { EditableFeatGrants } from './featEditorTypes';

  import {
    ABILITY_OPTIONS,
    CONDITIONS,
    LANGUAGE_TYPES,
    SKILLS_LIST,
    TOOLS_LABELS,
  } from '@vtt/shared/system/dnd.js';

  import { ARMOR_PROF_LABELS, WEAPON_PROF_LABELS } from '../constants';
  import FormSection from '../FormSection.vue';
  import DamageDefenseEditor from '../species/DamageDefenseEditor.vue';

  /**
   * Переиспользуемый редактор «даров» черты: повышение характеристик, владения
   * (навыки/спасброски/доспехи/оружие/инструменты/языки), защиты от урона и
   * состояний, предусловия. Двусторонняя привязка через {@link EditableFeatGrants}
   * — компонент не знает ни о форме-владельце, ни о сериализации в FeatData.
   *
   * Для предыстории характеристики и навыки выдаются каноническими полями
   * (abilityGrant/skillGrant), поэтому соответствующие секции можно скрыть
   * (`hideAbilityScoreIncrease`/`hideSkillProficiencies`) — иначе бонус
   * характеристик применился бы дважды.
   */
  const grants = defineModel<EditableFeatGrants>({ required: true });

  withDefaults(
    defineProps<{
      /** Скрыть секцию «Повышение характеристик» (для предыстории). */
      hideAbilityScoreIncrease?: boolean;
      /** Скрыть поле «Навыки» во владениях (для предыстории). */
      hideSkillProficiencies?: boolean;
    }>(),
    { hideAbilityScoreIncrease: false, hideSkillProficiencies: false },
  );

  const skillsOptions = SKILLS_LIST.map((skill) => ({
    value: skill.key,
    label: skill.label,
  }));

  const abilitiesOptions = ABILITY_OPTIONS.map((ability) => ({
    value: ability.value,
    label: ability.label,
  }));

  const armorOptions = Object.entries(ARMOR_PROF_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  const weaponOptions = Object.entries(WEAPON_PROF_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  const toolsOptions = Object.entries(TOOLS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const languageOptions = LANGUAGE_TYPES.map((language) => ({
    value: language,
    label: language,
  }));

  const conditionOptions = CONDITIONS.map((condition) => ({
    value: condition.key,
    label: condition.nameRu,
  }));
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Повышение характеристик -->
    <FormSection
      v-if="!hideAbilityScoreIncrease"
      title="Повышение характеристик"
      title-color="healing"
    >
      <div class="grid grid-cols-3 gap-2">
        <UFormField
          v-for="ability in abilitiesOptions"
          :key="ability.value"
          :label="ability.label"
        >
          <UInputNumber
            v-model="grants.asiFixed[ability.value]"
            :min="0"
            :max="10"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="mt-3 flex flex-col gap-2">
        <p class="text-xs text-dimmed">
          Прибавка на выбор (напр. +1 к одной из характеристик).
        </p>

        <div class="flex items-start gap-2">
          <UFormField
            label="На каждую"
            class="w-1/4"
          >
            <UInputNumber
              v-model="grants.asiChoiceAmount"
              :min="0"
              :max="5"
            />
          </UFormField>

          <UFormField
            label="Кол-во на выбор"
            class="w-1/4"
          >
            <UInputNumber
              v-model="grants.asiChoiceCount"
              :min="0"
              :max="6"
            />
          </UFormField>

          <UFormField
            label="Из набора (пусто = любая)"
            class="flex-1"
          >
            <USelectMenu
              v-model="grants.asiChoiceFrom"
              :items="abilitiesOptions"
              value-key="value"
              label-key="label"
              multiple
              :disabled="grants.asiChoiceCount === 0"
              class="w-full"
              placeholder="Любая характеристика..."
            />
          </UFormField>
        </div>
      </div>
    </FormSection>

    <!-- Владения -->
    <FormSection
      title="Владения"
      title-color="healing"
    >
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UFormField
          v-if="!hideSkillProficiencies"
          label="Навыки"
        >
          <USelectMenu
            v-model="grants.skillProficiencies"
            :items="skillsOptions"
            value-key="value"
            label-key="label"
            multiple
            class="w-full"
            placeholder="Навыки..."
          />
        </UFormField>

        <UFormField label="Спасброски">
          <USelectMenu
            v-model="grants.savingThrowProficiencies"
            :items="abilitiesOptions"
            value-key="value"
            label-key="label"
            multiple
            class="w-full"
            placeholder="Характеристики..."
          />
        </UFormField>

        <UFormField label="Доспехи">
          <USelectMenu
            v-model="grants.armorProficiencies"
            :items="armorOptions"
            value-key="value"
            label-key="label"
            multiple
            class="w-full"
            placeholder="Доспехи..."
          />
        </UFormField>

        <UFormField label="Оружие">
          <USelectMenu
            v-model="grants.weaponProficiencies"
            :items="weaponOptions"
            value-key="value"
            label-key="label"
            multiple
            class="w-full"
            placeholder="Оружие..."
          />
        </UFormField>

        <UFormField label="Инструменты">
          <USelectMenu
            v-model="grants.toolProficiencies"
            :items="toolsOptions"
            value-key="value"
            label-key="label"
            multiple
            class="w-full"
            placeholder="Инструменты..."
          />
        </UFormField>

        <UFormField label="Языки">
          <USelectMenu
            v-model="grants.languages"
            :items="languageOptions"
            value-key="value"
            label-key="label"
            multiple
            class="w-full"
            placeholder="Языки..."
          />
        </UFormField>
      </div>
    </FormSection>

    <!-- Защиты -->
    <FormSection
      title="Защиты и чувства"
      title-color="healing"
    >
      <div class="flex flex-col gap-4">
        <UFormField label="Защиты от типов урона">
          <DamageDefenseEditor v-model="grants.damageDefenses" />
        </UFormField>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UFormField label="Иммунитет к состояниям">
            <USelectMenu
              v-model="grants.conditionImmunities"
              :items="conditionOptions"
              value-key="value"
              label-key="label"
              multiple
              class="w-full"
              placeholder="Состояния..."
            />
          </UFormField>

          <UFormField label="Тёмное зрение (фт., 0 = нет)">
            <UInputNumber
              v-model="grants.darkvision"
              :min="0"
              :max="300"
              :step="30"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
    </FormSection>

    <!-- Предусловия -->
    <FormSection
      title="Предусловия (требования)"
      title-color="source"
    >
      <p class="mb-2 text-xs text-dimmed">
        Информационные — при выдаче черты не проверяются.
      </p>

      <div class="grid grid-cols-3 gap-2">
        <UFormField
          v-for="ability in abilitiesOptions"
          :key="ability.value"
          :label="ability.label"
        >
          <UInputNumber
            v-model="grants.prerequisiteAbilities[ability.value]"
            :min="0"
            :max="20"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="mt-3 flex flex-col gap-3">
        <div class="flex items-center gap-4">
          <UFormField
            label="Мин. уровень"
            class="w-1/3"
          >
            <UInputNumber
              v-model="grants.prerequisiteMinLevel"
              :min="0"
              :max="20"
            />
          </UFormField>

          <UCheckbox
            v-model="grants.prerequisiteSpellcasting"
            label="Требуется заклинательство"
            class="mt-5"
          />
        </div>

        <UFormField label="Произвольное требование">
          <UInput
            v-model="grants.prerequisiteText"
            placeholder="Напр. «Эльф или полуэльф»"
            class="w-full"
          />
        </UFormField>
      </div>
    </FormSection>
  </div>
</template>
