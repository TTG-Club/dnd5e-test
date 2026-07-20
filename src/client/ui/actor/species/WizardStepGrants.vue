<script setup lang="ts">
  import type {
    SkillProficiencyGrant,
    SpeciesDefinition,
    SpeciesGrant,
  } from '@vtt/shared/system/dnd.js';

  import type { SpeciesWizardState } from './useSpeciesWizard';

  import { SKILLS_LIST } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  const props = defineProps<{
    speciesDefinition: SpeciesDefinition;
    state: SpeciesWizardState;
  }>();

  const emit = defineEmits<{
    'update:state': [value: SpeciesWizardState];
  }>();

  const localState = computed({
    get: () => props.state,
    set: (val) => emit('update:state', val),
  });

  const grantsWithChoices = computed(() => {
    return props.speciesDefinition.grants
      .map((grant, index) => ({ grant, index }))
      .filter(({ grant }) => {
        if (grant.type === 'skillProficiency' && grant.count > 0) {
          return true;
        }

        if ('choices' in grant && grant.choices && grant.choices.count > 0) {
          return true;
        }

        return false;
      });
  });

  /** Получить список навыков для конкретного гранта */
  function getSkillOptions(grant: SkillProficiencyGrant) {
    if (grant.from && grant.from.length > 0) {
      return grant.from.map((skillKey) => ({
        value: skillKey,
        label:
          SKILLS_LIST.find((skill) => skill.key === skillKey)?.label
          || skillKey,
      }));
    }

    return SKILLS_LIST.map((skill) => ({
      value: skill.key,
      label: skill.label,
    })).sort((left, right) => left.label.localeCompare(right.label));
  }

  /** Получить доступные опции для инструмента, оружия и т.д. */
  function getGenericOptions(grant: SpeciesGrant) {
    if ('choices' in grant && grant.choices?.from) {
      return grant.choices.from.map((val) => ({
        value: val,
        label: val,
      })); // todo: translation
    }

    return [];
  }

  // Универсальный toggle (для чекбоксов)
  function toggleSelection(index: number, val: string, max: number) {
    const nextSelections = { ...localState.value.grantSelections };

    let sel = [...(nextSelections[index] || [])];

    const idx = sel.indexOf(val);

    if (idx !== -1) {
      sel.splice(idx, 1);
    } else if (max === 1) {
      sel = [val];
    } else if (sel.length < max) {
      sel.push(val);
    }

    nextSelections[index] = sel;

    localState.value = {
      ...localState.value,
      grantSelections: nextSelections,
    };
  }
</script>

<template>
  <div class="flex flex-col gap-6 p-1">
    <div
      v-for="{ grant, index } in grantsWithChoices"
      :key="index"
      class="flex flex-col gap-3 rounded-lg bg-elevated/50 p-4"
    >
      <template v-if="grant.type === 'skillProficiency'">
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium text-highlighted"> Навыки </span>

          <span class="text-xs text-muted"> Выберите {{ grant.count }}: </span>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UCheckbox
            v-for="opt in getSkillOptions(grant)"
            :key="opt.value"
            :model-value="
              (localState.grantSelections[index] || []).includes(opt.value)
            "
            :disabled="
              grant.count > 1
              && !(localState.grantSelections[index] || []).includes(opt.value)
              && (localState.grantSelections[index] || []).length >= grant.count
            "
            :label="opt.label"
            @update:model-value="toggleSelection(index, opt.value, grant.count)"
          />
        </div>
      </template>

      <template v-else-if="'choices' in grant && grant.choices">
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium text-highlighted">
            {{
              grant.type === 'weaponProficiency'
                ? 'Владение оружием'
                : grant.type === 'armorProficiency'
                  ? 'Владение бронёй'
                  : grant.type === 'toolProficiency'
                    ? 'Владение инструментами'
                    : grant.type === 'language'
                      ? 'Языки'
                      : 'Выбор'
            }}
          </span>

          <span class="text-xs text-muted">
            Выберите {{ grant.choices.count }}:
          </span>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UCheckbox
            v-for="opt in getGenericOptions(grant)"
            :key="opt.value"
            :model-value="
              (localState.grantSelections[index] || []).includes(opt.value)
            "
            :disabled="
              grant.choices.count > 1
              && !(localState.grantSelections[index] || []).includes(opt.value)
              && (localState.grantSelections[index] || []).length
                >= grant.choices.count
            "
            :label="opt.label"
            @update:model-value="
              toggleSelection(index, opt.value, grant.choices.count)
            "
          />
        </div>
      </template>
    </div>
  </div>
</template>
