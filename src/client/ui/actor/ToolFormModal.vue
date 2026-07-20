<script setup lang="ts">
  import type { ActiveEffect, GameItem } from '@vtt/shared/system/dnd.js';

  import {
    ABILITY_OPTIONS,
    CURRENCY_OPTIONS,
    RARITY_OPTIONS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';

  import { useToolForm } from '../../composables/useToolForm';
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
    /** Редактируемый инструмент (null = создание) */
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
    toolCategory,
    baseToolType,
    toolBonus,
    toolAbility,
    toolProficiencyMode,
    weight,
    costValue,
    costCurrency,
    sourceKey,
    isSRD,
    isMagical,
    magicAttunement,
    isAttuned,
    rarity,
    activeEffects,
    toolCategoryOptions,
    toolBaseTypeOptions,
    sourceOptions,
    selectedToolProperties,
    toolPropertyOptions,
    toggleToolProperty,
    buildTool,
  } = useToolForm(
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
      label: 'Подробнее',
      slot: 'details' as const,
    },
    {
      label: 'Эффекты',
      slot: 'effects' as const,
    },
  ];

  // --- Состояние модалки создания/редактирования эффекта ---
  const effectModalId = 'tool-effect-form-modal';
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

  const proficiencyModeOptions = [
    { label: 'Автоматически', value: 'auto' as const },
    { label: 'Без умения', value: 'none' as const },
    { label: 'Наполовину', value: 'half' as const },
    { label: 'Умелый', value: 'proficient' as const },
    { label: 'Экспертность', value: 'expertise' as const },
  ];

  /** Сохраняет форму */
  function handleSave(): void {
    emit('save', buildTool());
    emit('close');
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="item ? 'Редактировать инструмент' : 'Создать инструмент'"
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
            <!-- Название -->
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Название">
                <UInput
                  v-model="name"
                  placeholder="Воровские инструменты"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Название (English)">
                <UInput
                  v-model="nameEn"
                  placeholder="Thieves' Tools"
                  class="w-full"
                />
              </UFormField>
            </div>

            <!-- Описание -->
            <UFormField label="Описание">
              <RichTextEditor
                v-model="description"
                placeholder="Описание инструмента..."
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
                :portal="false"
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
              title="Тип инструмента"
              title-color="arcane"
            >
              <div class="flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <span class="min-w-[140px] shrink-0 text-sm text-muted">
                    Категория
                  </span>

                  <USelect
                    v-model="toolCategory"
                    :items="toolCategoryOptions"
                    value-key="value"
                    class="flex-1"
                    :portal="false"
                    @update:model-value="baseToolType = ''"
                  />
                </div>

                <div class="flex items-center gap-3">
                  <span class="min-w-[140px] shrink-0 text-sm text-muted">
                    Базовый тип
                  </span>

                  <USelect
                    v-model="baseToolType"
                    :items="toolBaseTypeOptions"
                    value-key="value"
                    placeholder="Пользовательский..."
                    class="flex-1"
                    :portal="false"
                  />
                </div>
              </div>
            </FormSection>

            <!-- Свойства инструмента -->
            <FormSection
              title="Свойства инструмента"
              title-color="info"
            >
              <div class="flex flex-wrap gap-2">
                <UPopover
                  v-for="prop in toolPropertyOptions"
                  :key="prop.value"
                  mode="hover"
                  :open-delay="300"
                  :ui="{ content: 'max-w-xs p-3' }"
                >
                  <UButton
                    :label="prop.label"
                    size="xs"
                    :color="
                      selectedToolProperties.includes(prop.value)
                        ? 'primary'
                        : 'neutral'
                    "
                    :variant="
                      selectedToolProperties.includes(prop.value)
                        ? 'solid'
                        : 'outline'
                    "
                    class="cursor-pointer"
                    @click.left.exact.prevent="toggleToolProperty(prop.value)"
                  />

                  <template #content>
                    <p class="text-xs leading-relaxed text-toned">
                      {{ prop.description }}
                    </p>
                  </template>
                </UPopover>
              </div>
            </FormSection>

            <!-- Проверка характеристики -->
            <FormSection
              title="Проверка характеристики"
              title-color="success"
            >
              <div class="flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <span class="min-w-[140px] shrink-0 text-sm text-muted">
                    Умение
                  </span>

                  <USelect
                    v-model="toolProficiencyMode"
                    :items="proficiencyModeOptions"
                    value-key="value"
                    class="flex-1"
                    :portal="false"
                  />
                </div>

                <div class="flex items-center gap-3">
                  <span class="min-w-[140px] shrink-0 text-sm text-muted">
                    Характеристика
                  </span>

                  <USelect
                    v-model="toolAbility"
                    :items="ABILITY_OPTIONS"
                    value-key="value"
                    class="flex-1"
                    :portal="false"
                  />
                </div>

                <div class="flex items-center gap-3">
                  <span class="min-w-[140px] shrink-0 text-sm text-muted">
                    Бонус инструмента
                  </span>

                  <UInput
                    v-model.number="toolBonus"
                    type="number"
                    :min="0"
                    class="w-24"
                  />
                </div>
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
                      :portal="false"
                    />
                  </UFormField>

                  <UCheckbox
                    v-if="
                      magicAttunement === 'required'
                      || magicAttunement === 'optional'
                    "
                    v-model="isAttuned"
                    label="Настроен"
                  />
                </div>
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
              Нет эффектов у данного инструмента
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
