<script setup lang="ts">
  import type { ProficiencyLevel, SkillType } from '@vtt/shared';
  import type { Creature } from '@vtt/shared/system/dnd.js';

  import {
    calculateSkillModifier,
    getSkillAbility,
    SKILLS_LIST,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';
  import { ABILITY_SHORT_LABELS } from '@/systems/dnd5e/ui/actor/constants';

  import ProficiencyIndicator from '../actor/ProficiencyIndicator.vue';

  const MODAL_Z_INDEX = Z_INDEX.MODAL_ELEVATED;

  interface Props {
    open: boolean;
    creature: Creature;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [skills: Partial<Record<SkillType, ProficiencyLevel>>];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const localSkills = ref<Partial<Record<SkillType, ProficiencyLevel>>>({});

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        localSkills.value = { ...props.creature.system.skills };
      }
    },
  );

  function getSkillData(skillKey: SkillType) {
    const level = localSkills.value[skillKey] ?? 'none';
    const ability = getSkillAbility(skillKey);
    const abilityScore = props.creature.system.abilities[ability];
    const profBonus = props.creature.system.proficiencyBonus || 0;
    const total = calculateSkillModifier(abilityScore, profBonus, level);
    const formattedModifier = total >= 0 ? `+${total}` : `${total}`;
    const passiveValue = 10 + total;
    const shortName = ABILITY_SHORT_LABELS[ability] || '';

    return { formattedModifier, passiveValue, shortName, level };
  }

  const LEVEL_ORDER: ProficiencyLevel[] = [
    'none',
    'half',
    'proficient',
    'expertise',
  ];

  function cycleSkillProficiency(skill: SkillType) {
    const currentLevel = localSkills.value[skill] ?? 'none';

    const currentIndex = LEVEL_ORDER.indexOf(currentLevel);
    const nextLevel = LEVEL_ORDER[(currentIndex + 1) % LEVEL_ORDER.length];

    if (nextLevel === 'none') {
      delete localSkills.value[skill];
    } else {
      localSkills.value[skill] = nextLevel;
    }
  }

  function applySelection(): void {
    emit('apply', { ...localSkills.value });
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
    :min-height="450"
    title="Навыки"
    :z-index="MODAL_Z_INDEX"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-x-6 gap-y-2">
          <div
            v-for="skill in SKILLS_LIST"
            :key="skill.key"
            class="group flex cursor-pointer items-center justify-between rounded px-2 py-1.5 transition-colors hover:bg-accented/30"
            @click.left.exact.prevent="cycleSkillProficiency(skill.key)"
          >
            <div class="flex min-w-0 flex-1 items-center gap-2.5">
              <ProficiencyIndicator
                :level="getSkillData(skill.key).level"
                class="text-muted"
                :class="{
                  'text-highlighted': getSkillData(skill.key).level !== 'none',
                }"
              />

              <span
                class="w-6 shrink-0 text-[10px] font-bold tracking-wider text-dimmed uppercase"
              >
                {{ getSkillData(skill.key).shortName }}
              </span>

              <span class="truncate text-sm font-medium text-toned">{{
                skill.label
              }}</span>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <span class="w-6 text-right text-sm font-bold text-highlighted">
                {{ getSkillData(skill.key).formattedModifier }}
              </span>

              <span class="w-5 text-right text-xs font-semibold text-dimmed">
                {{ getSkillData(skill.key).passiveValue }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-default/50 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click.left.exact.prevent="isOpen = false"
          >
            Отмена
          </UButton>

          <UButton
            color="primary"
            size="sm"
            @click.left.exact.prevent="applySelection"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
