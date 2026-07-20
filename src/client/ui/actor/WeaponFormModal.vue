<script setup lang="ts">
  import type { ActiveEffect, GameItem } from '@vtt/shared/system/dnd.js';

  import { DISTANCE_UNIT_OPTIONS } from '@vtt/shared';
  import {
    ABILITY_OPTIONS,
    CURRENCY_OPTIONS,
    RARITY_OPTIONS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';

  import { useWeaponForm } from '../../composables/useWeaponForm';
  import DamagePartsEditor from './DamagePartsEditor.vue';
  import FormSection from './FormSection.vue';
  import ActiveEffectFormModal from './tabs/ActiveEffectFormModal.vue';

  const props = defineProps<{
    /** Открыто ли модальное окно */
    open: boolean;
    /** Скрытые пропсы от useModalManager чтобы не было ворнингов */
    allowMultiple?: boolean;
    modalId?: string;
    savedPosition?: unknown;
    savedSize?: unknown;
    /** Редактируемое оружие (null = создание) */
    item: GameItem | null;
    /** Z-index (управляется родителем для bring-to-front) */
    zIndex?: number;
    /** Смещение позиции для каскадного расположения */
    positionOffset?: number;
  }>();

  const emit = defineEmits<{
    'close': [];
    'save': [item: GameItem];
    'bring-to-front': [];
  }>();

  /**
   * Мемоизированная начальная позиция.
   * Computed предотвращает пересоздание объекта при re-render.
   */
  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  const { getNextZIndex } = useModalManager();

  const {
    name,
    nameEn,
    description,
    baseType,
    weaponCategory,
    rangeType,
    damageParts,
    saveType,
    saveEffect,
    selectedProperties,
    weight,
    costValue,
    costCurrency,
    reach,
    rangeNormal,
    rangeLong,
    attackAbility,
    proficiencyMode,
    attackBonus,
    special,
    ammunitionType,
    mastery,
    categoryOptions,
    damageTypeOptions,
    propertyOptions,
    baseTypeOptions,
    ammunitionTypeOptions,
    proficiencyModeOptions,
    masteryOptions,
    sourceOptions,
    saveTypeOptions,
    saveEffectOptions,
    toggleProperty,
    buildWeapon,
    distanceUnit,
    sourceKey,
    isSRD,
    isMagical,
    magicAttunement,
    isAttuned,
    magicBonus,
    rarity,
    activeEffects,
  } = useWeaponForm(
    () => props.item,
    () => props.open,
  );

  // --- Состояние модалки создания/редактирования эффекта ---
  const effectModalId = 'weapon-effect-form-modal';
  const isEffectModalOpen = ref(false);
  const effectModalZIndex = ref<number | undefined>(undefined);
  const editingEffect = ref<ActiveEffect | undefined>(undefined);

  /** Вкладки формы */
  const tabItems = [
    {
      label: 'Общие',
      slot: 'general' as const,
    },
    {
      label: 'Бой',
      slot: 'combat' as const,
    },
    {
      label: 'Эффекты',
      slot: 'effects' as const,
    },
  ];

  /** Опции настройки магического предмета */
  const attunementOptions = [
    { label: 'Не требуется', value: 'none' as const },
    { label: 'Требуется', value: 'required' as const },
    { label: 'Опциональная', value: 'optional' as const },
  ];

  function createCustomEffect() {
    editingEffect.value = undefined;
    isEffectModalOpen.value = true;
    effectModalZIndex.value = getNextZIndex();
  }

  function editCustomEffect(effect: ActiveEffect) {
    editingEffect.value = effect;
    isEffectModalOpen.value = true;
    effectModalZIndex.value = getNextZIndex();
  }

  function deleteCustomEffect(effectId: string) {
    activeEffects.value = activeEffects.value.filter(
      (effect) => effect.id !== effectId,
    );
  }

  function toggleCustomEffect(effectId: string) {
    const effect = activeEffects.value.find(
      (existing) => existing.id === effectId,
    );

    if (effect) {
      effect.disabled = !effect.disabled;
    }
  }

  function saveCustomEffect(newEffect: ActiveEffect) {
    const index = activeEffects.value.findIndex(
      (existing) => existing.id === newEffect.id,
    );

    if (index !== -1) {
      activeEffects.value[index] = newEffect;
    } else {
      activeEffects.value.push(newEffect);
    }
  }

  /**
   * Формула урона невалидна: содержит `@mod.*` (у оружия мод. характеристики
   * добавляется автоматически — ручной токен дублировал бы его). Блокирует
   * сохранение.
   */
  const damageFormulaInvalid = computed(() =>
    damageParts.value.some((part) => /@mod\./i.test(part.formula)),
  );

  /** Сохраняет форму */
  function handleSave(): void {
    if (damageFormulaInvalid.value) {
      return;
    }

    emit('save', buildWeapon());
    emit('close');
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="item ? 'Редактировать оружие' : 'Создать оружие'"
    :initial-width="720"
    :resizable="false"
    :z-index="zIndex"
    :saved-position="initialPosition"
    @update:open="
      (value: boolean) => {
        if (!value) {
          if (item) handleSave();
          else emit('close');
        }
      }
    "
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <UTabs
        :items="tabItems"
        variant="pill"
        class="flex flex-col"
        :ui="{
          list: 'mb-3',
          trigger: 'flex-1 justify-center',
          content: 'overflow-y-auto max-h-[600px]',
        }"
      >
        <!-- Вкладка «Общие» -->
        <template #general>
          <div class="flex flex-col gap-4">
            <!-- Название и Английское название -->
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Название">
                <UInput
                  v-model="name"
                  placeholder="Длинный меч"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Английское название">
                <UInput
                  v-model="nameEn"
                  placeholder="Longsword"
                  class="w-full"
                />
              </UFormField>
            </div>

            <!-- Описание -->
            <UFormField label="Описание">
              <RichTextEditor
                v-model="description"
                placeholder="Описание оружия..."
              />
            </UFormField>

            <!-- Стоимость + Вес + Редкость -->
            <FormSection
              title="Ценность и вес"
              title-color="healing"
            >
              <div class="grid grid-cols-3 gap-3">
                <UFormField label="Стоимость">
                  <div class="flex gap-1.5">
                    <UInput
                      v-model.number="costValue"
                      type="number"
                      :min="0"
                      placeholder="0"
                      class="flex-1"
                    />

                    <USelect
                      v-model="costCurrency"
                      :items="CURRENCY_OPTIONS"
                      value-key="value"
                      label-key="labelShort"
                      class="w-[80px]"
                      :portal="false"
                    />
                  </div>
                </UFormField>

                <UFormField label="Вес (фнт.)">
                  <UInput
                    v-model.number="weight"
                    type="number"
                    :min="0"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Редкость">
                  <USelect
                    v-model="rarity"
                    :items="RARITY_OPTIONS"
                    value-key="value"
                    placeholder="Редкость"
                    class="w-full"
                    :portal="false"
                  />
                </UFormField>
              </div>
            </FormSection>

            <!-- Источник -->
            <FormSection
              title="Источник"
              title-color="source"
            >
              <USelect
                v-model="sourceKey"
                :items="sourceOptions"
                value-key="value"
                placeholder="Выберите источник..."
                class="w-full"
              />

              <UCheckbox
                v-model="isSRD"
                label="SRD контент"
                class="mt-2"
              />
            </FormSection>
          </div>
        </template>

        <template #combat>
          <div class="flex flex-col gap-4">
            <!-- Основное -->
            <FormSection
              title="Основное"
              title-color="arcane"
            >
              <div class="flex flex-col gap-3">
                <!-- Тип боя (toggle без заголовка, в начале) -->
                <div class="flex gap-2">
                  <UButton
                    :color="rangeType === 'melee' ? 'primary' : 'neutral'"
                    :variant="rangeType === 'melee' ? 'solid' : 'outline'"
                    size="sm"
                    class="flex-1"
                    @click.left.exact.prevent="rangeType = 'melee'"
                  >
                    Рукопашное
                  </UButton>

                  <UButton
                    :color="rangeType === 'ranged' ? 'primary' : 'neutral'"
                    :variant="rangeType === 'ranged' ? 'solid' : 'outline'"
                    size="sm"
                    class="flex-1"
                    @click.left.exact.prevent="rangeType = 'ranged'"
                  >
                    Дальнобойное
                  </UButton>
                </div>

                <!-- Базовое оружие (inline label) -->
                <div class="flex items-center gap-3">
                  <span class="min-w-[120px] shrink-0 text-sm text-muted"
                    >Базовое оружие</span
                  >

                  <USelect
                    v-model="baseType"
                    :items="baseTypeOptions"
                    value-key="value"
                    placeholder="Выберите тип..."
                    class="flex-1"
                  />
                </div>

                <!-- Тип оружия (inline label) -->
                <div class="flex items-center gap-3">
                  <span class="min-w-[120px] shrink-0 text-sm text-muted"
                    >Тип оружия</span
                  >

                  <USelect
                    v-model="weaponCategory"
                    :items="categoryOptions"
                    value-key="value"
                    class="flex-1"
                  />
                </div>

                <!-- Оружейный приём (inline label) -->
                <div class="flex items-center gap-3">
                  <span class="min-w-[120px] shrink-0 text-sm text-muted"
                    >Приём (Mastery)</span
                  >

                  <USelect
                    v-model="mastery"
                    :items="masteryOptions"
                    value-key="value"
                    placeholder="Нет"
                    class="flex-1"
                  />
                </div>
              </div>
            </FormSection>
            <!-- Свойства оружия -->
            <FormSection
              title="Свойства оружия"
              title-color="info"
            >
              <div class="flex flex-wrap gap-2">
                <UPopover
                  v-for="prop in propertyOptions"
                  :key="prop.value"
                  mode="hover"
                  :open-delay="300"
                  :ui="{ content: 'max-w-xs p-3' }"
                >
                  <UButton
                    :label="prop.label"
                    size="xs"
                    :color="
                      selectedProperties.includes(prop.value)
                        ? 'primary'
                        : 'neutral'
                    "
                    :variant="
                      selectedProperties.includes(prop.value)
                        ? 'solid'
                        : 'outline'
                    "
                    class="cursor-pointer"
                    @click.left.exact.prevent="toggleProperty(prop.value)"
                  />

                  <template #content>
                    <p class="text-xs leading-relaxed text-toned">
                      {{ prop.description }}
                    </p>
                  </template>
                </UPopover>
              </div>
            </FormSection>

            <!-- Блок «Магическое» (раскрывается при нажатии badge) -->
            <FormSection
              v-if="isMagical"
              title="Магическое"
              title-color="arcane"
            >
              <div class="flex flex-col gap-3">
                <div class="grid grid-cols-2 items-start gap-3">
                  <UFormField label="Настройка">
                    <USelect
                      v-model="magicAttunement"
                      :items="attunementOptions"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Бонус">
                    <UInput
                      v-model.number="magicBonus"
                      type="number"
                      :min="0"
                      :max="10"
                      placeholder="+1"
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <UCheckbox
                  v-if="
                    magicAttunement === 'required'
                    || magicAttunement === 'optional'
                  "
                  v-model="isAttuned"
                  label="Настроен"
                />
              </div>
            </FormSection>
            <!-- Урон (единая со заклинаниями система частей) -->
            <FormSection
              title="Урон"
              title-color="warning"
            >
              <div class="flex flex-col gap-3">
                <p class="text-xs text-muted">
                  Модификатор характеристики и магический бонус добавляются к
                  урону автоматически — в формуле указывайте только кости (напр.
                  «1к8»).
                </p>

                <DamagePartsEditor
                  v-model="damageParts"
                  :damage-type-options="damageTypeOptions"
                  :include-spell-modifier="false"
                  :hide-modifiers="true"
                  :show-versatile="selectedProperties.includes('versatile')"
                  :allow-empty="true"
                />

                <!-- Тип боеприпаса (появляется при свойстве «Боеприпасы») -->
                <UFormField
                  v-if="selectedProperties.includes('ammunition')"
                  label="Тип боеприпаса"
                >
                  <USelect
                    v-model="ammunitionType"
                    :items="ammunitionTypeOptions"
                    value-key="value"
                    placeholder="Выберите тип..."
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>

            <!-- Спасбросок (оружие, заставляющее цель совершить спасбросок) -->
            <FormSection
              title="Спасбросок"
              title-color="danger"
            >
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Тип спасброска">
                  <USelect
                    v-model="saveType"
                    :items="saveTypeOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>

                <UFormField
                  v-if="saveType !== 'none'"
                  label="При успехе"
                >
                  <USelect
                    v-model="saveEffect"
                    :items="saveEffectOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>

            <!-- Особые правила (текстовая оговорка оружия) -->
            <FormSection
              title="Особые правила"
              title-color="arcane"
            >
              <UFormField label="Текст особого правила (необязательно)">
                <UTextarea
                  v-model="special"
                  autoresize
                  :rows="2"
                  placeholder="Напр.: Вы атакуете с помехой, если цель в пределах 5 футов от вас."
                  class="w-full"
                />
              </UFormField>

              <p class="mt-2 text-xs text-dimmed">
                Условие, которое не выражается обычными полями (как у Пики,
                Сети). Показывается в карточке оружия.
              </p>
            </FormSection>

            <!-- Дальность и досягаемость -->
            <FormSection
              title="Дистанция"
              title-color="gold"
            >
              <template #actions>
                <USelect
                  v-model="distanceUnit"
                  :items="DISTANCE_UNIT_OPTIONS"
                  value-key="value"
                  size="xs"
                  class="w-36"
                />
              </template>

              <div class="grid grid-cols-3 gap-3">
                <!-- Досягаемость -->
                <UFormField label="Досягаемость">
                  <UInput
                    v-model.number="reach"
                    type="number"
                    :min="5"
                    :step="5"
                    class="w-full"
                  />
                </UFormField>

                <!-- Нормальная -->
                <UFormField label="Нормальная">
                  <UInput
                    v-model.number="rangeNormal"
                    type="number"
                    :min="0"
                    :disabled="
                      rangeType !== 'ranged'
                      && !selectedProperties.includes('thrown')
                    "
                    class="w-full"
                  />
                </UFormField>

                <!-- Максимальная -->
                <UFormField label="Максимальная">
                  <UInput
                    v-model.number="rangeLong"
                    type="number"
                    :min="0"
                    :disabled="
                      rangeType !== 'ranged'
                      && !selectedProperties.includes('thrown')
                    "
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>

            <!-- Показатель атаки -->
            <FormSection
              title="Показатель атаки"
              title-color="danger"
            >
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Характеристика">
                  <USelect
                    v-model="attackAbility"
                    :items="ABILITY_OPTIONS"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Доп. бонус">
                  <UInput
                    v-model.number="attackBonus"
                    type="number"
                    placeholder="0"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <div class="mt-3">
                <UFormField label="Уровень умения">
                  <USelect
                    v-model="proficiencyMode"
                    :items="proficiencyModeOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>
          </div>
        </template>

        <!-- Вкладка «Эффекты» -->
        <template #effects>
          <div class="flex flex-col gap-4">
            <div
              v-if="activeEffects.length === 0"
              class="rounded-lg border border-dashed border-default p-3 text-center text-xs text-dimmed italic"
            >
              Нет эффектов у данного оружия
            </div>

            <div
              v-else
              class="space-y-1"
            >
              <div
                v-for="effect in activeEffects"
                :key="effect.id"
                class="group flex min-h-[44px] items-center gap-2 rounded-lg bg-elevated/50 p-2 transition-colors hover:bg-accented/50"
                :class="{ 'opacity-50 grayscale': effect.disabled }"
              >
                <UIcon
                  :name="effect.icon || 'tabler:bolt'"
                  class="size-5 shrink-0"
                  :class="effect.disabled ? 'text-dimmed' : 'text-gold'"
                />

                <div class="min-w-0 flex-1">
                  <div
                    class="flex items-center gap-2 text-sm leading-none font-medium"
                  >
                    <span class="truncate">{{ effect.name }}</span>
                  </div>

                  <div
                    v-if="effect.description"
                    class="mt-0.5 truncate text-[10px] text-dimmed"
                  >
                    {{ effect.description }}
                  </div>
                </div>

                <div class="flex shrink-0 items-center gap-1.5">
                  <USwitch
                    :model-value="!effect.disabled"
                    size="sm"
                    checked-icon="tabler:check"
                    unchecked-icon="tabler:x"
                    @update:model-value="toggleCustomEffect(effect.id)"
                  />

                  <div class="ml-1 flex gap-1">
                    <UButton
                      icon="tabler:pencil"
                      size="xs"
                      variant="ghost"
                      color="gray"
                      class="px-1.5"
                      @click.left.exact.prevent="editCustomEffect(effect)"
                    />

                    <UButton
                      icon="tabler:trash"
                      size="xs"
                      variant="ghost"
                      color="red"
                      class="px-1.5"
                      @click.left.exact.prevent="deleteCustomEffect(effect.id)"
                    />
                  </div>
                </div>
              </div>
            </div>

            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="tabler:plus"
              block
              class="mt-1"
              @click.left.exact.prevent="createCustomEffect"
            >
              Добавить Эффект
            </UButton>
          </div>
        </template>
      </UTabs>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton
          label="Отмена"
          color="neutral"
          variant="ghost"
          @click.left.exact.prevent="emit('close')"
        />

        <UButton
          :label="item ? 'Сохранить' : 'Создать'"
          color="primary"
          :disabled="!name.trim() || damageFormulaInvalid"
          @click.left.exact.prevent="handleSave"
        />
      </div>
    </template>
  </UDraggableModal>

  <ActiveEffectFormModal
    v-model:open="isEffectModalOpen"
    :modal-id="effectModalId"
    :z-index="effectModalZIndex"
    :effect="editingEffect"
    :show-effect-target="true"
    @save="saveCustomEffect"
  />
</template>
