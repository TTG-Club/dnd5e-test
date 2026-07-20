<script setup lang="ts">
  import type { GameItem } from '@vtt/shared/system/dnd.js';

  import { computed } from 'vue';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import ItemCostWeightRarity from './ItemCostWeightRarity.vue';
  import ItemDetailModalShell from './ItemDetailModalShell.vue';
  import ItemDetailTabs from './ItemDetailTabs.vue';
  import ItemEffectsView from './ItemEffectsView.vue';
  import ItemPropertyBadges from './ItemPropertyBadges.vue';

  const props = defineProps<{
    /** Открыто ли модальное окно */
    open: boolean;
    /** Доспех для отображения */
    item: GameItem | null;
    /** Z-index модалки (управляется родителем) */
    zIndex?: number;
    /** Смещение позиции для каскадного расположения */
    positionOffset?: number;
    /** Показывать кнопку «Скопировать в предметы» (только для компендиума) */
    showCopyButton?: boolean;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    /** Копировать в предметы */
    'copy': [];
    /** Поднять модалку наверх */
    'bring-to-front': [];
  }>();

  const systemDataStore = useSystemDataStore();

  /** JSON-payload текущего снаряжения для кнопки «Поделиться в чат» */
  const chatPayload = computed(() =>
    props.item ? JSON.stringify(props.item) : '',
  );

  /** Категории, для которых отображается класс доспеха и бонус Ловкости */
  const ARMOR_CATEGORIES = new Set(['light', 'medium', 'heavy', 'shield']);

  /** Карта key → name для категорий доспехов */
  const armorCategoryMap = computed(() => {
    const map = new Map<string, string>();

    for (const category of systemDataStore.armorCategories) {
      map.set(category.key, category.name);
    }

    return map;
  });

  /** Карта key → name для базовых типов доспехов */
  const armorBaseTypeMap = computed(() => {
    const map = new Map<string, string>();

    for (const baseType of systemDataStore.armorBaseTypes) {
      map.set(baseType.key, baseType.name);
    }

    return map;
  });

  /** Отображение КД — базовый для обычных доспехов, «+N» для щитов */
  const displayAC = computed(() => {
    if (props.item?.baseArmorAC === undefined) {
      return '';
    }

    // Не показываем КД для не-бронёвых категорий (жезлы, безделушки и т.д.)
    if (
      props.item.equipmentCategory
      && !ARMOR_CATEGORIES.has(props.item.equipmentCategory)
    ) {
      return '';
    }

    if (props.item.equipmentCategory === 'shield') {
      return `+${props.item.baseArmorAC}`;
    }

    return String(props.item.baseArmorAC);
  });

  /** Подсказка по бонусу Ловкости */
  const dexBonusLabel = computed(() => {
    if (
      props.item?.equipmentCategory
      && !ARMOR_CATEGORIES.has(props.item.equipmentCategory)
    ) {
      return '';
    }

    if (props.item?.equipmentCategory === 'shield') {
      return '';
    }

    if (
      props.item?.maxDexBonus === null
      || props.item?.maxDexBonus === undefined
    ) {
      return '+ мод. Ловкости';
    }

    if (props.item.maxDexBonus === 0) {
      return '';
    }

    return `+ мод. Ловкости (макс. ${props.item.maxDexBonus})`;
  });

  /** Конфигурация свойств экипировки */
  const ARMOR_PROPERTY_CONFIG = [
    {
      key: 'adamantine',
      label: 'Адамантиновое',
      color: 'info' as const,
      description:
        'Критическое попадание по владельцу этого снаряжения считается обычным попаданием.',
      check: (item: GameItem) => Boolean(item.isAdamantine),
    },
    {
      key: 'magical',
      label: 'Магическое',
      color: 'primary' as const,
      description:
        'Снаряжение обладает магическими свойствами, которые могут давать бонус к КД или иные эффекты.',
      check: (item: GameItem) => Boolean(item.isMagical),
    },
    {
      key: 'stealth-disadvantage',
      label: 'Помеха Скрытности',
      color: 'error' as const,
      description:
        'Владелец совершает проверки Скрытности (Ловкость) с помехой.',
      check: (item: GameItem) => Boolean(item.stealthDisadvantage),
    },
    {
      key: 'focus',
      label: 'Фокусирующее',
      color: 'warning' as const,
      description:
        'Может использоваться как магическая фокусировка для заклинаний.',
      check: (item: GameItem) => Boolean(item.isFocus),
    },
  ];

  /** Активные свойства текущего доспеха */
  const activeArmorProperties = computed(() => {
    if (!props.item) {
      return [];
    }

    return ARMOR_PROPERTY_CONFIG.filter((property) =>
      property.check(props.item!),
    );
  });
</script>

<template>
  <ItemDetailModalShell
    :open="open"
    :title="item?.name ?? 'Снаряжение'"
    :subtitle="item?.nameEn || undefined"
    :source-key="item?.sourceKey"
    :is-srd="item?.isSRD"
    card-type="equipment"
    :chat-payload="chatPayload"
    :z-index="zIndex"
    :position-offset="positionOffset"
    :show-copy-button="showCopyButton"
    copy-tooltip="Скопировать в предметы"
    @update:open="emit('update:open', $event)"
    @copy="emit('copy')"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <ItemDetailTabs v-if="item">
        <!-- Вкладка «Основное» — характеристики, свойства и описание -->
        <template #general>
          <div class="flex flex-col gap-4">
            <!-- Основные характеристики -->
            <div class="rounded-lg border border-default/50 bg-elevated/30 p-3">
              <div class="grid grid-cols-2 gap-3 text-sm">
                <!-- КД -->
                <div v-if="displayAC">
                  <span class="text-xs text-dimmed">Класс доспеха</span>

                  <p class="text-highlighted">
                    <span class="font-mono text-lg font-bold text-info-muted">
                      {{ displayAC }}
                    </span>
                  </p>

                  <span
                    v-if="dexBonusLabel"
                    class="text-xs text-muted"
                  >
                    {{ dexBonusLabel }}
                  </span>
                </div>

                <!-- Тип экипировки -->
                <div v-if="item.equipmentCategory">
                  <span class="text-xs text-dimmed">Тип экипировки</span>

                  <p class="text-highlighted">
                    {{
                      armorCategoryMap.get(item.equipmentCategory)
                      ?? item.equipmentCategory
                    }}
                  </p>
                </div>

                <!-- Базовый тип -->
                <div v-if="item.baseType">
                  <span class="text-xs text-dimmed">Базовый тип</span>

                  <p class="text-highlighted">
                    {{ armorBaseTypeMap.get(item.baseType) ?? item.baseType }}
                  </p>
                </div>

                <!-- Требование Силы -->
                <div
                  v-if="
                    item.strengthRequirement && item.strengthRequirement > 0
                  "
                >
                  <span class="text-xs text-dimmed">Требование Силы</span>

                  <p class="text-highlighted">
                    {{ item.strengthRequirement }}+
                  </p>
                </div>
              </div>
            </div>

            <!-- Свойства доспеха -->
            <ItemPropertyBadges :properties="activeArmorProperties" />

            <!-- Описание -->
            <div v-if="item.description">
              <span
                class="mb-1.5 block text-xs font-semibold tracking-wider text-dimmed uppercase"
              >
                Описание
              </span>

              <ItemDescriptionRenderer :content="item.description" />
            </div>

            <!-- Стоимость, Вес и Редкость -->
            <ItemCostWeightRarity
              :cost="item.cost"
              :weight="item.weight"
              :rarity="item.rarity"
            />
          </div>
        </template>

        <!-- Вкладка «Эффекты» — только просмотр -->
        <template #effects>
          <ItemEffectsView :effects="item.activeEffects ?? []" />
        </template>
      </ItemDetailTabs>
    </template>
  </ItemDetailModalShell>
</template>
