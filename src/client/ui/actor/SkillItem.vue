<script setup lang="ts">
  import type { ProficiencyLevel, SkillType } from '@vtt/shared';

  import { getSkillAbility } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import { ABILITY_SHORT_LABELS } from '@/systems/dnd5e/ui/actor/constants';

  import ProficiencyIndicator from './ProficiencyIndicator.vue';

  interface Props {
    label: string;
    skillKey: SkillType;
    proficiencyLevel: ProficiencyLevel;
    modifier: number;
    isEditMode: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'cycle-proficiency': [];
    'roll': [modifier: number, label: string, key: SkillType];
  }>();

  const attributeShortName = computed(() => {
    const ability = getSkillAbility(props.skillKey);

    return ABILITY_SHORT_LABELS[ability] || '';
  });

  const modifier = computed(() => props.modifier);

  const formattedModifier = computed(() => {
    return modifier.value >= 0 ? `+${modifier.value}` : `${modifier.value}`;
  });

  function handleClick() {
    if (!props.isEditMode) {
      emit('roll', modifier.value, props.label, props.skillKey);
    }
  }
</script>

<template>
  <div
    class="group flex cursor-pointer items-center justify-between rounded px-2 py-1.5 transition-colors hover:bg-accented/30"
    @click.left.exact.prevent="handleClick"
  >
    <div class="flex min-w-0 flex-1 items-center gap-2.5">
      <!-- Индикатор владения (4 состояния) -->
      <ProficiencyIndicator
        :level="proficiencyLevel"
        :disabled="!isEditMode"
        class="text-muted"
        :class="{
          'text-white': proficiencyLevel !== 'none',
        }"
        @cycle="emit('cycle-proficiency')"
      />

      <!-- Сокращение характеристики -->
      <span
        class="w-6 shrink-0 text-[10px] font-bold tracking-wider text-dimmed uppercase"
        >{{ attributeShortName }}</span
      >

      <span class="truncate text-sm font-medium text-toned">{{ label }}</span>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <!-- Модификатор -->
      <span class="w-6 text-right text-sm font-bold text-white">{{
        formattedModifier
      }}</span>

      <!-- Пассивное значение (10 + модификатор) -->
      <span class="w-5 text-right text-xs font-semibold text-dimmed">{{
        10 + modifier
      }}</span>
    </div>
  </div>
</template>
