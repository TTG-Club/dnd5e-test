<script setup lang="ts">
  import type { ActiveEffect, GameItem } from '@vtt/shared/system/dnd.js';

  import { CURRENCY_OPTIONS, RARITY_OPTIONS } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';

  import { useEquipmentForm } from '../../composables/useEquipmentForm';
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
    /** Редактируемый доспех (null = создание) */
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
    equipmentCategory,
    baseArmorAC,
    maxDexBonus,
    strengthRequirement,
    weight,
    costValue,
    costCurrency,
    sourceKey,
    isSRD,
    isMagical,
    magicAttunement,
    isAttuned,
    magicBonus,
    rarity,
    isShield,
    isActualArmor,
    categoryOptions,
    baseTypeOptions,
    sourceOptions,
    equipmentPropertyOptions,
    selectedEquipmentProperties,
    toggleEquipmentProperty,
    buildArmor,
    activeEffects,
  } = useEquipmentForm(
    () => props.item,
    () => props.open,
  );

  /** Вкладки формы */
  const tabItems = [
    {
      label: 'Общие',
      slot: 'general' as const,
    },
    {
      label: 'Бой',
      slot: 'details' as const,
    },
    {
      label: 'Эффекты',
      slot: 'effects' as const,
    },
  ];

  // --- Состояние модалки создания/редактирования эффекта ---
  const effectModalId = 'equipment-effect-form-modal';
  const isEffectModalOpen = ref(false);
  const effectModalZIndex = ref<number | undefined>(undefined);
  const editingEffect = ref<ActiveEffect | undefined>(undefined);

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

  /** Опции настройки магического предмета */
  const attunementOptions = [
    { label: 'Не требуется', value: 'none' as const },
    { label: 'Требуется', value: 'required' as const },
    { label: 'Опциональная', value: 'optional' as const },
  ];

  /** Сохраняет форму */
  function handleSave(): void {
    emit('save', buildArmor());
    emit('close');
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="item ? 'Редактировать снаряжение' : 'Создать снаряжение'"
    :initial-width="500"
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
                  placeholder="Например, веревка или зелье"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Английское название">
                <UInput
                  v-model="nameEn"
                  placeholder="Rope or Potion"
                  class="w-full"
                />
              </UFormField>
            </div>

            <!-- Описание -->
            <UFormField label="Описание">
              <RichTextEditor
                v-model="description"
                placeholder="Описание снаряжения..."
              />
            </UFormField>

            <!-- Стоимость + Вес -->
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

        <!-- Вкладка «Подробнее» -->
        <template #details>
          <div class="flex flex-col gap-4">
            <!-- Основное -->
            <FormSection
              title="Основное"
              title-color="arcane"
            >
              <div class="flex flex-col gap-3">
                <!-- Тип экипировки -->
                <div class="flex items-center gap-3">
                  <span class="min-w-[140px] shrink-0 text-sm text-muted">
                    Тип экипировки
                  </span>

                  <USelect
                    v-model="equipmentCategory"
                    :items="categoryOptions"
                    value-key="value"
                    class="flex-1"
                  />
                </div>

                <!-- Базовый тип (только для брони) -->
                <div
                  v-if="isActualArmor"
                  class="flex items-center gap-3"
                >
                  <span class="min-w-[140px] shrink-0 text-sm text-muted">
                    Базовый тип
                  </span>

                  <USelect
                    v-model="baseType"
                    :items="baseTypeOptions"
                    value-key="value"
                    placeholder="Выберите тип..."
                    class="flex-1"
                  />
                </div>
              </div>
            </FormSection>

            <!-- Свойства экипировки -->
            <FormSection
              title="Свойства экипировки"
              title-color="info"
            >
              <div class="flex flex-wrap gap-2">
                <UPopover
                  v-for="prop in equipmentPropertyOptions"
                  :key="prop.value"
                  mode="hover"
                  :open-delay="300"
                  :ui="{ content: 'max-w-xs p-3' }"
                >
                  <UButton
                    :label="prop.label"
                    size="xs"
                    :color="
                      selectedEquipmentProperties.includes(prop.value)
                        ? 'primary'
                        : 'neutral'
                    "
                    :variant="
                      selectedEquipmentProperties.includes(prop.value)
                        ? 'solid'
                        : 'outline'
                    "
                    class="cursor-pointer"
                    @click.left.exact.prevent="
                      toggleEquipmentProperty(prop.value)
                    "
                  />

                  <template #content>
                    <p class="text-xs leading-relaxed text-toned">
                      {{ prop.description }}
                    </p>
                  </template>
                </UPopover>
              </div>
            </FormSection>

            <!-- Защита (только для брони) -->
            <FormSection
              v-if="isActualArmor"
              title="Защита"
              title-color="info"
            >
              <div class="flex flex-col gap-3">
                <!-- КЗ -->
                <div class="grid grid-cols-2 gap-3">
                  <UFormField :label="isShield ? 'Бонус к КД' : 'Базовый КД'">
                    <UInput
                      v-model.number="baseArmorAC"
                      type="number"
                      :min="0"
                      class="w-full"
                    />
                  </UFormField>

                  <!-- Макс. бонус Ловкости (не для щита) -->
                  <UFormField
                    v-if="!isShield"
                    label="Макс. +Лов."
                  >
                    <UInput
                      v-model.number="maxDexBonus"
                      type="number"
                      :min="0"
                      :placeholder="equipmentCategory === 'light' ? '∞' : ''"
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <!-- Требование Силы -->
                <UFormField
                  v-if="!isShield"
                  label="Требование Силы"
                >
                  <UInput
                    v-model.number="strengthRequirement"
                    type="number"
                    :min="0"
                    placeholder="0"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>

            <!-- Блок «Магическое» -->
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
          </div>
        </template>

        <!-- Вкладка «Эффекты» -->
        <template #effects>
          <div class="flex flex-col gap-4">
            <div
              v-if="activeEffects.length === 0"
              class="rounded-lg border border-dashed border-default p-3 text-center text-xs text-dimmed italic"
            >
              Нет эффектов у данной экипировки
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
          :disabled="!name.trim()"
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
