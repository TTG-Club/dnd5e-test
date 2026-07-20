<script setup lang="ts">
  import type { CreatureAction } from '@vtt/shared/system/dnd.js';

  import { DISTANCE_UNIT_SHORT } from '@vtt/shared';
  import {
    AREA_SHAPE_LABELS,
    DEFAULT_REACH_FEET,
    getActionDescriptionMarkdown,
    SAVE_EFFECT_OPTIONS,
    SAVE_TYPE_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';

  import DamagePartsSummary from '../actor/DamagePartsSummary.vue';
  import ItemDetailModalShell from '../actor/ItemDetailModalShell.vue';

  type ActionMode = 'trait' | 'action';

  const props = defineProps<{
    /** Открыто ли модальное окно */
    open: boolean;
    /** Действие/черта существа для отображения */
    action: CreatureAction | null;
    /** Режим: черта или действие (влияет на подпись карточки в чат) */
    mode?: ActionMode;
    /** Z-index модалки (управляется родителем) */
    zIndex?: number;
    /** Смещение позиции для каскадного расположения */
    positionOffset?: number;
    /** Показывать кнопку «Атаковать» (только когда действие можно применить) */
    showAttackButton?: boolean;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    /** Запросить применение действия (бросок) */
    'attack': [];
    /** Поднять модалку наверх */
    'bring-to-front': [];
  }>();

  /** Единица расстояния действия в коротком виде */
  const distanceUnitLabel = computed(
    () => DISTANCE_UNIT_SHORT[props.action?.distanceUnit ?? 'ft'],
  );

  /** Досягаемость ближнего боя действия (по умолчанию — стандартная) */
  const reachValue = computed(() => props.action?.reach ?? DEFAULT_REACH_FEET);

  /** Части урона/лечения действия (для общего DamagePartsSummary) */
  const damageParts = computed(() => props.action?.damageParts ?? []);

  /** Подпись типа броска (ближний/дальний бой) */
  const attackTypeLabel = computed(() =>
    props.action?.rangeType === 'ranged'
      ? 'Дальнобойная атака'
      : 'Рукопашная атака',
  );

  /** Бонус к попаданию со знаком (напр. «+5», «−1»), пусто если не задан */
  const attackBonusLabel = computed(() => {
    const bonus = props.action?.attackBonus;

    if (bonus === undefined) {
      return '';
    }

    return bonus >= 0 ? `+${bonus}` : String(bonus);
  });

  /** Есть ли у действия спасбросок (заменяет бросок попадания) */
  const hasSave = computed(
    () => !!props.action?.saveType && props.action.saveType !== 'none',
  );

  /** Локализованная подпись характеристики спасброска */
  const saveTypeLabel = computed(() => {
    const saveType = props.action?.saveType;

    return saveType ? SAVE_TYPE_LABELS[saveType] : '';
  });

  /** Локализованная подпись эффекта при успешном спасброске */
  const saveEffectLabel = computed(() => {
    if (!props.action?.saveEffect) {
      return '';
    }

    return (
      SAVE_EFFECT_OPTIONS.find((opt) => opt.value === props.action?.saveEffect)
        ?.label ?? props.action.saveEffect
    );
  });

  /** Эффекты действия, кроме временно отключённых */
  const enabledEffects = computed(
    () =>
      props.action?.activeEffects?.filter((effect) => !effect.disabled) ?? [],
  );

  /** Markdown-описание действия */
  const descriptionMarkdown = computed(() =>
    props.action ? getActionDescriptionMarkdown(props.action) : '',
  );

  /** JSON-payload карточки «Поделиться в чат» */
  const chatPayload = computed(() => {
    if (!props.action) {
      return '';
    }

    return JSON.stringify({
      name: props.action.name,
      description: descriptionMarkdown.value,
      featureType: props.mode === 'trait' ? 'feat' : 'feature',
    });
  });
</script>

<template>
  <ItemDetailModalShell
    :open="open"
    :title="action?.name ?? 'Действие'"
    :subtitle="action?.nameEn || undefined"
    card-type="feature"
    :chat-payload="chatPayload"
    :z-index="zIndex"
    :position-offset="positionOffset"
    :show-cast-button="false"
    @update:open="emit('update:open', $event)"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #header-extra>
      <UTooltip
        v-if="showAttackButton"
        text="Атаковать"
      >
        <UButton
          icon="tabler:swords"
          size="xs"
          color="error"
          variant="soft"
          @click.left.exact.prevent="emit('attack')"
        />
      </UTooltip>
    </template>

    <template #body>
      <div
        v-if="action"
        class="flex flex-col gap-4"
      >
        <!-- Боевые параметры -->
        <div
          v-if="
            action.attackBonus !== undefined
            || hasSave
            || damageParts.length > 0
          "
          class="rounded-lg border border-default/50 bg-elevated/30 p-3"
        >
          <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <!-- Тип броска / бонус к попаданию -->
            <div v-if="action.attackBonus !== undefined && !hasSave">
              <span class="block text-xs text-dimmed">{{
                attackTypeLabel
              }}</span>

              <p class="font-mono font-semibold text-highlighted">
                {{ attackBonusLabel }}
              </p>
            </div>

            <!-- Спасбросок -->
            <div v-if="hasSave">
              <span class="block text-xs text-dimmed">Спасбросок</span>

              <p
                class="mt-0.5 text-xs font-semibold tracking-wider text-highlighted uppercase"
              >
                {{ saveTypeLabel }}
                {{ action.saveDC ?? '?'
                }}<span
                  v-if="saveEffectLabel"
                  class="ml-1 font-normal tracking-normal text-muted normal-case"
                  >({{ saveEffectLabel }})</span
                >
              </p>
            </div>

            <!-- Урон / Лечение -->
            <DamagePartsSummary :parts="damageParts" />
          </div>
        </div>

        <!-- Дистанция / Область -->
        <div
          v-if="action.areaOfEffect || action.rangeType"
          class="flex flex-wrap gap-x-6 gap-y-1 text-sm"
        >
          <div v-if="action.areaOfEffect">
            <span class="text-xs text-dimmed">Область: </span>

            <span class="text-highlighted">
              {{
                AREA_SHAPE_LABELS[action.areaOfEffect.shape]
                ?? action.areaOfEffect.shape
              }}
              {{ action.areaOfEffect.size }} {{ distanceUnitLabel }}
            </span>
          </div>

          <div v-else-if="action.rangeType === 'ranged' && action.range">
            <span class="text-xs text-dimmed">Дальность: </span>

            <span class="text-highlighted">
              {{ action.range.normal
              }}<template v-if="action.range.long"
                >/{{ action.range.long }}</template
              >
              {{ distanceUnitLabel }}
            </span>
          </div>

          <div v-else-if="action.rangeType === 'melee'">
            <span class="text-xs text-dimmed">Досягаемость: </span>

            <span class="text-highlighted">
              {{ reachValue }} {{ distanceUnitLabel }}
            </span>
          </div>
        </div>

        <!-- Описание -->
        <div v-if="descriptionMarkdown">
          <ItemDescriptionRenderer :content="descriptionMarkdown" />
        </div>

        <!-- Эффекты -->
        <div
          v-if="enabledEffects.length > 0"
          class="flex flex-col gap-1.5 border-t border-default/50 pt-3"
        >
          <span
            class="text-xs font-semibold tracking-wider text-dimmed uppercase"
          >
            Эффекты
          </span>

          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="effect in enabledEffects"
              :key="effect.id"
              color="warning"
              variant="subtle"
              size="sm"
            >
              <UIcon
                :name="effect.icon || 'tabler:sparkles'"
                class="mr-0.5 size-3"
              />
              {{ effect.name }}
            </UBadge>
          </div>
        </div>
      </div>
    </template>
  </ItemDetailModalShell>
</template>
