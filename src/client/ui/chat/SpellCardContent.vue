<script setup lang="ts">
  import type { Spell } from '@vtt/shared/system/dnd.js';

  import {
    CASTING_TIME_LABELS,
    DURATION_UNIT_LABELS,
    formatConditionalDamageDisplay,
    getSpellDamageParts,
    SPELL_LEVEL_LABELS,
    SPELL_SCHOOL_LABELS,
    stripDamageTypeTokens,
    stripHealTokens,
  } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import CardErrorFallback from '@/shared_ui/components/CardErrorFallback.vue';
  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';

  const props = defineProps<{
    /** Сериализованные данные заклинания (JSON-строка) */
    payload: string;
  }>();

  /** Десериализованное заклинание */
  const spell = computed<Spell | null>(() => {
    try {
      return JSON.parse(props.payload) as Spell;
    } catch {
      return null;
    }
  });

  /** Формулы частей урона/лечения для отображения (d→к, через « + »). */
  const damagePartsLabel = computed(() => {
    if (!spell.value) {
      return '';
    }

    return getSpellDamageParts(spell.value)
      .map((part) =>
        formatConditionalDamageDisplay(part.formula, (subFormula) =>
          stripHealTokens(stripDamageTypeTokens(subFormula)),
        ).replace(/(\d+)d(\d+)/gi, '$1к$2'),
      )
      .filter((formula) => formula.length > 0)
      .join(' + ');
  });

  /** Круг заклинания */
  const levelLabel = computed(() => {
    if (!spell.value) {
      return '';
    }

    return (
      SPELL_LEVEL_LABELS[spell.value.level] ?? `${spell.value.level}-й круг`
    );
  });

  /** Школа магии */
  const schoolLabel = computed(() => {
    if (!spell.value) {
      return '';
    }

    return SPELL_SCHOOL_LABELS[spell.value.school] ?? spell.value.school;
  });

  /** Время сотворения */
  const castingTimeLabel = computed(() => {
    if (!spell.value) {
      return '';
    }

    const unitLabel =
      CASTING_TIME_LABELS[spell.value.castingTimeUnit]
      ?? spell.value.castingTimeUnit;

    if (spell.value.castingTimeValue === 1) {
      return unitLabel;
    }

    return `${spell.value.castingTimeValue} ${unitLabel.toLowerCase()}`;
  });

  /** Длительность */
  const durationLabel = computed(() => {
    if (!spell.value) {
      return '';
    }

    const unitLabel =
      DURATION_UNIT_LABELS[spell.value.durationUnit]
      ?? spell.value.durationUnit;

    if (
      spell.value.durationUnit === 'instantaneous'
      || spell.value.durationUnit === 'until-dispelled'
      || spell.value.durationUnit === 'special'
    ) {
      return unitLabel;
    }

    const prefix = spell.value.concentration ? 'Концентрация, ' : '';

    return `${prefix}${spell.value.durationValue} ${unitLabel.toLowerCase()}`;
  });

  /** Компоненты (V, S, M) */
  const componentsLabel = computed(() => {
    if (!spell.value?.components) {
      return '';
    }

    const parts: string[] = [];

    if (spell.value.components.verbal) {
      parts.push('В');
    }

    if (spell.value.components.somatic) {
      parts.push('С');
    }

    if (spell.value.components.material) {
      parts.push('М');
    }

    return parts.join(', ');
  });
</script>

<template>
  <div
    v-if="spell"
    class="overflow-hidden rounded-lg border border-arcane/30"
  >
    <!-- Заголовок -->
    <div class="flex items-start gap-2 bg-elevated/60 px-3 py-2">
      <UIcon
        name="tabler:wand"
        class="mt-0.5 size-4 shrink-0 text-arcane"
      />

      <span class="min-w-0 flex-1 text-sm font-semibold text-highlighted">
        {{ spell.name }}
      </span>

      <UBadge
        v-if="spell.concentration"
        color="warning"
        variant="subtle"
        size="xs"
      >
        К
      </UBadge>

      <UBadge
        v-if="spell.ritual"
        color="info"
        variant="subtle"
        size="xs"
      >
        Р
      </UBadge>
    </div>

    <!-- Тело карточки -->
    <div class="flex flex-col gap-2 bg-default/40 px-3 py-2">
      <!-- Мета-строка: круг + школа -->
      <div class="flex items-center gap-2 text-xs">
        <span class="font-medium text-arcane">
          {{ levelLabel }}
        </span>

        <span class="text-muted">{{ schoolLabel }}</span>
      </div>

      <!-- Характеристики -->
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <div class="flex items-center gap-1">
          <span class="text-dimmed">Время:</span>

          <span class="text-toned">{{ castingTimeLabel }}</span>
        </div>

        <div class="flex items-center gap-1">
          <span class="text-dimmed">Длительность:</span>

          <span class="text-toned">{{ durationLabel }}</span>
        </div>

        <div
          v-if="componentsLabel"
          class="flex items-center gap-1"
        >
          <span class="text-dimmed">Компоненты:</span>

          <span class="text-toned">{{ componentsLabel }}</span>
        </div>

        <div
          v-if="damagePartsLabel"
          class="flex items-center gap-1"
        >
          <span class="text-dimmed">Урон:</span>

          <span class="font-mono font-semibold text-danger-muted">
            {{ damagePartsLabel }}
          </span>
        </div>
      </div>

      <!-- Описание -->
      <div
        v-if="spell.description"
        class="max-h-40 overflow-y-auto"
      >
        <ItemDescriptionRenderer :content="spell.description" />
      </div>

      <!-- На высших кругах -->
      <div
        v-if="spell.higherLevelDescription"
        class="border-t border-accented/30 pt-2"
      >
        <span class="text-xs font-medium text-arcane">На высших кругах:</span>

        <div class="mt-1 max-h-20 overflow-y-auto">
          <ItemDescriptionRenderer :content="spell.higherLevelDescription" />
        </div>
      </div>
    </div>
  </div>

  <!-- Fallback при ошибке десериализации -->
  <CardErrorFallback
    v-else
    message="Ошибка отображения карточки заклинания"
  />
</template>
