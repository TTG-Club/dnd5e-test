<script setup lang="ts">
  import type { Spell } from '@vtt/shared/system/dnd.js';

  import { DISTANCE_UNIT_SHORT } from '@vtt/shared';
  import {
    CASTING_TIME_LABELS,
    CLASS_KEY_LABELS,
    DURATION_UNIT_LABELS,
    getSpellDamageParts,
    getSpellProjectiles,
    SAVE_EFFECT_OPTIONS,
    SAVE_TYPE_LABELS,
    SPELL_SCHOOL_LABELS,
    TARGET_TYPE_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';

  import DamagePartsSummary from './DamagePartsSummary.vue';
  import ItemDetailModalShell from './ItemDetailModalShell.vue';
  import ItemDetailTabs from './ItemDetailTabs.vue';
  import ItemEffectsView from './ItemEffectsView.vue';

  const props = defineProps<{
    open: boolean;
    spell: Spell | null;
    zIndex?: number;
    positionOffset?: number;
    showCopyButton?: boolean;
    showCastButton?: boolean;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'copy': [];
    'cast': [];
    'bring-to-front': [];
  }>();

  /** JSON-payload заклинания для кнопки «Поделиться в чат» */
  const chatPayload = computed(() =>
    props.spell ? JSON.stringify(props.spell) : '',
  );

  /** Части урона/лечения заклинания (для общего DamagePartsSummary) */
  const spellDamageParts = computed(() =>
    props.spell ? getSpellDamageParts(props.spell) : [],
  );

  /**
   * Подпись снарядного режима: базовое число + масштабирование
   * («3 (+1 за круг)» или «1 (2/3/4 с 5/11/17 ур.)»).
   */
  const projectilesLabel = computed(() => {
    if (!props.spell) {
      return null;
    }

    const projectiles = getSpellProjectiles(props.spell);

    if (!projectiles) {
      return null;
    }

    let label = String(projectiles.count);

    if (projectiles.perSlotLevel) {
      label += ` (+${projectiles.perSlotLevel} за круг)`;
    }

    const tiers = [...(projectiles.countByCharacterLevel ?? [])].sort(
      (tierA, tierB) => tierA.level - tierB.level,
    );

    if (tiers.length > 0) {
      const counts = tiers.map((tier) => tier.count).join('/');
      const levels = tiers.map((tier) => tier.level).join('/');

      label += ` (${counts} с ${levels} ур.)`;
    }

    if (projectiles.targetDistribution === 'single') {
      label += ', все в одну цель';
    } else if (projectiles.targetDistribution === 'distinct') {
      label += ', каждый в свою цель';
    }

    return label;
  });

  const componentsLabel = computed(() => {
    if (!props.spell) {
      return '';
    }

    const list: string[] = [];

    if (props.spell.components.verbal) {
      list.push('V');
    }

    if (props.spell.components.somatic) {
      list.push('S');
    }

    if (props.spell.components.material) {
      let m = 'M';

      if (props.spell.components.materialDescription) {
        m += ` (${props.spell.components.materialDescription}`;

        if (props.spell.components.materialCost) {
          m += `, ${props.spell.components.materialCost} з.м.`;
        }

        if (props.spell.components.materialConsumed) {
          m += ', расходуется';
        }

        m += ')';
      } else if (props.spell.components.materialCost) {
        m += ` (${props.spell.components.materialCost} з.м.${props.spell.components.materialConsumed ? ', расходуется' : ''})`;
      }

      list.push(m);
    }

    return list.join(', ');
  });

  const saveEffectLabel = computed(() => {
    if (!props.spell || !props.spell.saveEffect) {
      return '';
    }

    return (
      SAVE_EFFECT_OPTIONS.find((opt) => opt.value === props.spell?.saveEffect)
        ?.label ?? props.spell.saveEffect
    );
  });
</script>

<template>
  <ItemDetailModalShell
    :open="open"
    :title="spell?.name ?? 'Заклинание'"
    :subtitle="spell?.nameEn || undefined"
    :source-key="spell?.sourceKey"
    :is-srd="spell?.isSRD"
    card-type="spell"
    :chat-payload="chatPayload"
    :z-index="zIndex"
    :position-offset="positionOffset"
    :show-copy-button="showCopyButton"
    :show-cast-button="showCastButton"
    @update:open="emit('update:open', $event)"
    @copy="emit('copy')"
    @cast="emit('cast')"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <ItemDetailTabs v-if="spell">
        <!-- Вкладка «Основное» — характеристики и описание -->
        <template #general>
          <div class="flex flex-col gap-4">
            <!-- Subtitle: Level & School -->
            <div class="text-sm text-muted italic">
              <span v-if="spell.level === 0"
                >{{ SPELL_SCHOOL_LABELS[spell.school] ?? spell.school }},
                заговор</span
              >

              <span v-else
                >{{ spell.level }}-й круг,
                {{ SPELL_SCHOOL_LABELS[spell.school] ?? spell.school }}</span
              >

              <span v-if="spell.ritual"> (ритуал)</span>
            </div>

            <!-- Основные характеристики -->
            <div class="rounded-lg border border-default/50 bg-elevated/30 p-3">
              <div class="grid grid-cols-2 gap-3 text-sm">
                <!-- Время -->
                <div>
                  <span class="text-xs text-dimmed">Время сотворения</span>

                  <p class="text-highlighted">
                    <span v-if="spell.castingTimeValue > 1"
                      >{{ spell.castingTimeValue }}
                    </span>
                    {{
                      CASTING_TIME_LABELS[spell.castingTimeUnit]
                      ?? spell.castingTimeUnit
                    }}
                    <span
                      v-if="spell.reactionTrigger"
                      class="block text-xs text-muted"
                      >({{ spell.reactionTrigger }})</span
                    >
                  </p>
                </div>

                <!-- Дистанция -->
                <div>
                  <span class="text-xs text-dimmed">Дистанция</span>

                  <p class="text-highlighted">
                    <template v-if="spell.rangeSpecial">
                      {{ spell.rangeSpecial }}
                    </template>

                    <template v-else-if="spell.deliveryType === 'touch'">
                      Касание
                    </template>

                    <template
                      v-else-if="spell.range === 0 && spell.rangeUnit === 'ft'"
                    >
                      На себя
                    </template>

                    <template v-else>
                      {{ spell.range }}
                      {{
                        DISTANCE_UNIT_SHORT[spell.rangeUnit] ?? spell.rangeUnit
                      }}
                    </template>
                  </p>
                </div>

                <!-- Компоненты -->
                <div class="col-span-2">
                  <span class="text-xs text-dimmed">Компоненты</span>

                  <p class="text-highlighted">{{ componentsLabel }}</p>
                </div>

                <!-- Длительность -->
                <div class="col-span-2">
                  <span class="text-xs text-dimmed">Длительность</span>

                  <p class="text-highlighted">
                    <span
                      v-if="spell.concentration"
                      class="font-semibold text-warning-400"
                      >Концентрация,
                    </span>

                    <template
                      v-if="
                        ![
                          'instantaneous',
                          'special',
                          'until-dispelled',
                        ].includes(spell.durationUnit)
                      "
                    >
                      до {{ spell.durationValue }}
                    </template>
                    {{
                      DURATION_UNIT_LABELS[spell.durationUnit]
                      ?? spell.durationUnit
                    }}
                  </p>
                </div>

                <!-- Цель / Область -->
                <div class="col-span-2 mt-1 border-t border-default/50 pt-2">
                  <span class="text-xs text-dimmed">Цель или Область</span>

                  <p class="text-highlighted">
                    <template v-if="spell.areaOfEffect">
                      Область ({{ spell.areaOfEffect.size
                      }}{{ DISTANCE_UNIT_SHORT[spell.areaOfEffect.unit] }})<span
                        v-if="spell.areaOfEffect.resizable"
                        class="ml-1 text-xs text-dimmed"
                        >(изм.)</span
                      >
                    </template>

                    <template v-else-if="spell.targetType !== 'none'">
                      {{
                        TARGET_TYPE_LABELS[spell.targetType]
                        ?? spell.targetType
                      }}<span v-if="spell.targetCount && spell.targetCount > 1">
                        ({{ spell.targetCount }})</span
                      >
                    </template>
                  </p>
                </div>

                <!-- Урон / Спасбросок / Атака / Снаряды -->
                <template
                  v-if="
                    spellDamageParts.length > 0
                    || spell.saveType !== 'none'
                    || ['melee', 'ranged'].includes(spell.deliveryType)
                    || projectilesLabel
                  "
                >
                  <div
                    class="col-span-2 mt-1 flex flex-wrap gap-x-6 gap-y-2 border-t border-default/50 pt-2"
                  >
                    <div
                      v-if="['melee', 'ranged'].includes(spell.deliveryType)"
                    >
                      <span class="block text-xs text-dimmed">Тип броска</span>

                      <p class="text-highlighted">
                        {{
                          spell.deliveryType === 'melee'
                            ? 'Рукопашная атака'
                            : 'Дальнобойная атака'
                        }}
                      </p>
                    </div>

                    <div v-if="projectilesLabel">
                      <span class="block text-xs text-dimmed">Снаряды</span>

                      <p class="text-highlighted">
                        {{ projectilesLabel }}
                      </p>
                    </div>

                    <div v-if="spell.saveType !== 'none'">
                      <span class="block text-xs text-dimmed">Спасбросок</span>

                      <p
                        class="mt-0.5 text-xs font-semibold tracking-wider text-highlighted uppercase"
                      >
                        {{ SAVE_TYPE_LABELS[spell.saveType]
                        }}<span
                          v-if="spell.saveEffect"
                          class="ml-1 font-normal tracking-normal text-muted normal-case"
                          >({{ saveEffectLabel }})</span
                        >
                      </p>
                    </div>

                    <DamagePartsSummary :parts="spellDamageParts" />
                  </div>
                </template>
              </div>
            </div>

            <!-- Описание -->
            <div v-if="spell.description">
              <ItemDescriptionRenderer :content="spell.description" />
            </div>

            <!-- Описание на высших кругах -->
            <div
              v-if="spell.higherLevelDescription || spell.scaling"
              class="border-t border-default/50 pt-3"
            >
              <span
                class="mb-1.5 block text-xs font-semibold tracking-wider text-dimmed uppercase"
              >
                На высших кругах
              </span>

              <ItemDescriptionRenderer
                v-if="spell.higherLevelDescription"
                :content="spell.higherLevelDescription"
              />

              <p
                v-else-if="spell.scaling"
                class="text-sm text-toned"
              >
                <span v-if="spell.scaling.additionalDice">
                  <strong>Урон:</strong> +{{ spell.scaling.additionalDice }}
                </span>

                <span v-if="spell.scaling.additionalTargets">
                  <strong>Цели:</strong> +{{ spell.scaling.additionalTargets }}
                </span>

                <span v-if="spell.scaling.description">
                  ({{ spell.scaling.description }})
                </span>
              </p>
            </div>

            <!-- Классы-владельцы -->
            <div
              v-if="spell.classKeys && spell.classKeys.length > 0"
              class="flex flex-wrap items-center gap-1.5 border-t border-default/50 pt-3"
            >
              <span class="text-xs text-dimmed">Классы:</span>

              <UBadge
                v-for="classKey in spell.classKeys"
                :key="classKey"
                :label="CLASS_KEY_LABELS[classKey] ?? classKey"
                color="primary"
                variant="subtle"
                size="xs"
              />
            </div>
          </div>
        </template>

        <!-- Вкладка «Эффекты» — только просмотр -->
        <template #effects>
          <ItemEffectsView :effects="spell.activeEffects ?? []" />
        </template>
      </ItemDetailTabs>
    </template>
  </ItemDetailModalShell>
</template>
