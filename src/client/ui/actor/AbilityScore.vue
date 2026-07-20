<script setup lang="ts">
  import { computed } from 'vue';

  /** Источник бонуса к характеристике */
  export interface AbilityBonusSource {
    /** Название источника (например: "Предыстория: Послушник") */
    name: string;
    /** Числовое значение бонуса */
    value: number;
  }

  interface Props {
    label: string;
    /** Итоговое значение характеристики (с учётом эффектов) */
    value: number;
    /** Базовое значение характеристики (без эффектов) */
    baseValue: number;
    modifier: number;
    isEditMode: boolean;
    /** Источники бонусов к характеристике от Active Effects */
    bonusSources?: AbilityBonusSource[];
  }

  const props = withDefaults(defineProps<Props>(), {
    bonusSources: () => [],
  });

  const emit = defineEmits<{
    'update:value': [value: number];
    'roll': [modifier: number, label: string];
  }>();

  const formattedModifier = computed(() => {
    return props.modifier >= 0 ? `+${props.modifier}` : `${props.modifier}`;
  });

  const modifierClass = computed(() => {
    if (props.modifier > 0) {
      return 'text-white';
    } else if (props.modifier < 0) {
      return 'text-danger';
    } else {
      return 'text-toned';
    }
  });

  /** Суммарный бонус от эффектов */
  const totalBonus = computed(() => {
    return props.bonusSources.reduce((sum, source) => sum + source.value, 0);
  });

  /** Форматированный бонус: +2, -1, или пустая строка */
  const formattedBonus = computed(() => {
    if (totalBonus.value === 0) {
      return '';
    }

    return totalBonus.value > 0
      ? `+${totalBonus.value}`
      : `${totalBonus.value}`;
  });

  /** Есть ли бонусы от эффектов */
  const hasBonus = computed(() => totalBonus.value !== 0);

  /** CSS-класс цвета бонуса: зелёный для положительных, красный для отрицательных */
  const bonusColorClass = computed(() => {
    return totalBonus.value > 0 ? 'text-success' : 'text-danger';
  });

  interface TooltipRow {
    label: string;
    /** Форматированное значение для отображения справа */
    value: string;
    /** Стиль строки: база/бонус/итог */
    kind: 'base' | 'bonus' | 'total';
  }

  /** Строки тултипа: базовое значение, источники бонусов и итог */
  const tooltipRows = computed<TooltipRow[]>(() => {
    const rows: TooltipRow[] = [
      { label: 'Базовое значение', value: `${props.baseValue}`, kind: 'base' },
    ];

    for (const source of props.bonusSources) {
      if (source.value === 0) {
        continue;
      }

      const prefix = source.value > 0 ? '+' : '';

      rows.push({
        label: source.name,
        value: `${prefix}${source.value}`,
        kind: 'bonus',
      });
    }

    rows.push({ label: 'Итого', value: `${props.value}`, kind: 'total' });

    return rows;
  });

  function handleRoll() {
    if (!props.isEditMode) {
      emit('roll', props.modifier, props.label);
    }
  }

  function handleInput(event: Event) {
    const numValue = Number.parseInt(
      (event.target as HTMLInputElement).value,
      10,
    );

    if (!Number.isNaN(numValue)) {
      emit('update:value', Math.max(1, Math.min(30, numValue)));
    }
  }

  function increment() {
    if (props.value < 30) {
      emit('update:value', props.value + 1);
    }
  }

  function decrement() {
    if (props.value > 1) {
      emit('update:value', props.value - 1);
    }
  }
</script>

<template>
  <div
    class="group bg-base relative flex h-16 flex-col items-center justify-start rounded-xl border border-muted/30 pt-1.5 pb-3 transition-colors"
    :class="
      isEditMode
        ? 'hover:border-muted/50'
        : 'cursor-pointer hover:border-primary-500/50'
    "
    @click.left.exact.prevent="handleRoll"
  >
    <!-- Имя характеристики -->
    <span
      class="mb-px block text-[8px] font-bold tracking-wider text-muted uppercase"
      >{{ label }}</span
    >

    <!-- Модификатор (крупно) -->
    <div
      class="mt-1 text-xl leading-none font-bold"
      :class="modifierClass"
    >
      {{ formattedModifier }}
    </div>

    <!-- Значение (в овале снизу) -->
    <div
      class="absolute -bottom-2 left-1/2 flex h-5 -translate-x-1/2 items-center gap-0.5 rounded-full border border-muted/50 bg-elevated px-1 shadow-sm transition-colors"
      :class="[
        isEditMode
          ? 'w-[calc(100%-8px)] group-hover:border-accented'
          : 'min-w-10 px-2 group-hover:border-primary-500/50',
      ]"
    >
      <template v-if="isEditMode">
        <button
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs text-muted transition-colors hover:bg-accented/50 hover:text-white"
          @click.left.exact.prevent="decrement"
        >
          −
        </button>

        <input
          :value="value"
          type="number"
          min="1"
          max="30"
          class="min-w-0 flex-1 [appearance:textfield] bg-transparent text-center text-[10px] font-bold text-white tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          @input="handleInput"
        />

        <UTooltip v-if="hasBonus">
          <span
            class="shrink-0 text-[9px] leading-none font-bold tabular-nums"
            :class="bonusColorClass"
            >{{ formattedBonus }}</span
          >

          <template #content>
            <div class="flex flex-col gap-1 px-1 py-0.5 text-[11px]">
              <div
                v-for="(row, index) in tooltipRows"
                :key="index"
                class="flex items-center gap-3 whitespace-nowrap"
                :class="
                  row.kind === 'total'
                    ? 'border-t border-muted/30 pt-1 font-semibold'
                    : ''
                "
              >
                <span :class="row.kind === 'bonus' ? 'text-toned' : ''"
                  >{{ row.label }}:</span
                >

                <span
                  class="ml-auto tabular-nums"
                  :class="row.kind === 'bonus' ? bonusColorClass : 'text-white'"
                  >{{ row.value }}</span
                >
              </div>
            </div>
          </template>
        </UTooltip>

        <button
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs text-muted transition-colors hover:bg-accented/50 hover:text-white"
          @click.left.exact.prevent="increment"
        >
          +
        </button>
      </template>

      <!-- Режим просмотра: итоговое значение, разбивка в тултипе -->
      <template v-else>
        <UTooltip v-if="hasBonus">
          <span
            class="w-full text-center text-[9px] leading-none font-bold tabular-nums"
            :class="bonusColorClass"
            >{{ value }}</span
          >

          <template #content>
            <div class="flex flex-col gap-1 px-1 py-0.5 text-[11px]">
              <div
                v-for="(row, index) in tooltipRows"
                :key="index"
                class="flex items-center gap-3 whitespace-nowrap"
                :class="
                  row.kind === 'total'
                    ? 'border-t border-muted/30 pt-1 font-semibold'
                    : ''
                "
              >
                <span :class="row.kind === 'bonus' ? 'text-toned' : ''"
                  >{{ row.label }}:</span
                >

                <span
                  class="ml-auto tabular-nums"
                  :class="row.kind === 'bonus' ? bonusColorClass : 'text-white'"
                  >{{ row.value }}</span
                >
              </div>
            </div>
          </template>
        </UTooltip>

        <span
          v-else
          class="w-full text-center text-[9px] leading-none font-bold text-white"
          >{{ value }}</span
        >
      </template>
    </div>
  </div>
</template>
