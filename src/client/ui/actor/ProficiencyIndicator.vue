<script setup lang="ts">
  import type { ProficiencyLevel } from '@vtt/shared';

  import { computed } from 'vue';

  interface Props {
    /** Текущий уровень владения */
    level: ProficiencyLevel;
    /** Заблокировано ли переключение */
    disabled?: boolean;
  }

  const props = withDefaults(defineProps<Props>(), {
    disabled: false,
  });

  const emit = defineEmits<{
    cycle: [];
  }>();

  /** Названия уровней для подсказки */
  const LEVEL_TITLES: Record<ProficiencyLevel, string> = {
    none: 'Нет владения',
    half: 'Половинное владение',
    proficient: 'Владение',
    expertise: 'Экспертиза',
  };

  /** Иконки Tabler для каждого уровня владения */
  const LEVEL_ICONS: Record<ProficiencyLevel, string> = {
    none: 'tabler:circle',
    half: 'tabler:circle-half-2',
    proficient: 'tabler:circle-chevron-up-filled',
    expertise: 'tabler:circle-chevrons-up-filled',
  };

  /** Текст подсказки */
  const levelTitle = computed(() => LEVEL_TITLES[props.level]);

  /** Иконка текущего уровня */
  const levelIcon = computed(() => LEVEL_ICONS[props.level]);

  /**
   * Переключает уровень владения по кругу:
   * none → half → proficient → expertise → none
   */
  function cycleLevel() {
    if (props.disabled) {
      return;
    }

    emit('cycle');
  }
</script>

<template>
  <UTooltip :text="levelTitle">
    <button
      type="button"
      class="shrink-0 transition-opacity"
      :class="
        disabled
          ? 'cursor-default opacity-50'
          : 'cursor-pointer hover:opacity-80'
      "
      :disabled="disabled"
      @click.left.exact.prevent="cycleLevel"
    >
      <UIcon
        :name="levelIcon"
        class="size-4 transition-colors duration-200"
      />
    </button>
  </UTooltip>
</template>
