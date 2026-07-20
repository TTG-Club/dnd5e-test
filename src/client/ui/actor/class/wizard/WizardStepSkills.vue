<script setup lang="ts">
  /**
   * Шаг мастера: Навыки.
   *
   * Позволяет выбрать навыки из списка класса с ограничением по количеству.
   */
  import type { SkillType } from '@vtt/shared';

  import { SKILL_LABELS } from './constants';

  const props = withDefaults(
    defineProps<{
      availableSkills: SkillType[];
      selectedSkills: SkillType[];
      maxCount: number;
      /** Навыки, уже полученные из внешних источников (раса, предыстория, другие классы) */
      alreadyProficientSkills?: SkillType[];
    }>(),
    {
      alreadyProficientSkills: () => [],
    },
  );

  const emit = defineEmits<{
    'update:selectedSkills': [skills: SkillType[]];
  }>();

  /** Переключает выбор навыка с учётом лимита */
  function toggleSkill(skill: SkillType) {
    let current = [...props.selectedSkills];

    const index = current.indexOf(skill);

    if (index === -1) {
      if (props.maxCount === 1) {
        current = [skill];
      } else if (current.length < props.maxCount) {
        current.push(skill);
      }
    } else {
      current.splice(index, 1);
    }

    emit('update:selectedSkills', current);
  }
</script>

<template>
  <div class="space-y-3">
    <span class="mb-2 block text-sm font-medium text-toned">
      Выберите навыки ({{ selectedSkills.length }} / {{ maxCount }})
    </span>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="skill in availableSkills"
        :key="skill"
        size="xs"
        :color="selectedSkills.includes(skill) ? 'primary' : 'neutral'"
        :variant="selectedSkills.includes(skill) ? 'solid' : 'soft'"
        @click.left.exact.prevent="toggleSkill(skill)"
      >
        {{ SKILL_LABELS[skill] ?? skill }}

        <UTooltip
          v-if="alreadyProficientSkills.includes(skill)"
          text="Этот навык уже получен из другого источника (раса или предыстория)"
        >
          <UIcon
            name="tabler:alert-triangle"
            class="text-warning"
          />
        </UTooltip>
      </UButton>
    </div>
  </div>
</template>
