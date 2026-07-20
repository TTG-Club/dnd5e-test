<script setup lang="ts">
  import type {
    ActiveEffect,
    GameItem,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import { DISTANCE_UNIT_OPTIONS } from '@vtt/shared';
  import {
    ABILITY_OPTIONS,
    areaShapeUsesHeight,
    areaShapeUsesWidth,
    getAreaSizeLabel,
    SPELL_USES_RECOVERY_OPTIONS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';

  import { useSpellForm } from '../../composables/useSpellForm';
  import DamagePartRow from './DamagePartRow.vue';
  import DamagePartsEditor from './DamagePartsEditor.vue';
  import FormSection from './FormSection.vue';
  import ActiveEffectFormModal from './tabs/ActiveEffectFormModal.vue';

  defineOptions({ inheritAttrs: false });

  const props = defineProps<{
    /** Открыто ли модальное окно */
    open: boolean;
    /** Скрытые пропсы от useModalManager чтобы не было ворнингов */
    allowMultiple?: boolean;
    modalId?: string;
    savedPosition?: unknown;
    savedSize?: unknown;
    /** Редактируемое заклинание (при открытии из листа персонажа) */
    spell?: Spell | null;
    /** Редактируемый предмет (при открытии из ItemsPanel) */
    item?: GameItem | null;
    actorId?: string;
    /** Z-index (управляется родителем для bring-to-front) */
    zIndex?: number;
    /** Смещение позиции для каскадного расположения */
    positionOffset?: number;
  }>();

  const emit = defineEmits<{
    'close': [];
    'save': [spell: Spell];
    'bring-to-front': [];
  }>();

  /**
   * Вычисляет целевое заклинание из props.spell или props.item.spellData
   */
  const targetSpell = computed<Spell | null>(() => {
    if (props.spell) {
      return props.spell;
    }

    if (props.item && props.item.type === 'spell' && props.item.spellData) {
      return {
        ...props.item.spellData,
        id: props.item.id,
        name: props.item.name,
        nameEn: props.item.nameEn,
        description: props.item.description,
        isSRD: props.item.isSRD,
        sourceKey: props.item.sourceKey,
      } as Spell;
    }

    return null;
  });

  /**
   * Мемоизированная начальная позиция.
   * Computed предотвращает пересоздание объекта при re-render.
   */
  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  const isEditing = computed(() => !!targetSpell.value);

  const { getNextZIndex } = useModalManager();

  const {
    name,
    nameEn,
    level,
    school,
    castingTimeValue,
    castingTimeUnit,
    reactionTrigger,
    verbal,
    somatic,
    material,
    materialDescription,
    materialCost,
    materialConsumed,
    range,
    rangeUnit,
    rangeSpecial,
    durationValue,
    durationUnit,
    concentration,
    ritual,
    areaShape,
    areaSize,
    areaWidth,
    areaHeight,
    areaUnit,
    areaResizable,
    targetType,
    targetCount,
    deliveryType,
    damageParts,
    autoHit,
    saveType,
    saveEffect,
    attackAbility,
    attackBonus,
    hasProjectiles,
    projectileCount,
    projectilePerSlotLevel,
    projectileTargetDistribution,
    projectileTiers,
    addProjectileTier,
    removeProjectileTier,
    hasScaling,
    scalingAdditionalDice,
    scalingAdditionalTargets,
    scalingDescription,
    cantripScalingTiers,
    addCantripTier,
    removeCantripTier,
    addCantripTierPart,
    removeCantripTierPart,
    description,
    higherLevelDescription,
    hasUses,
    usesMax,
    usesCurrent,
    usesRecovery,
    sourceKey,
    isSRD,
    classKeys,
    activeEffects,
    SPELL_SCHOOL_OPTIONS,
    CASTING_TIME_OPTIONS,
    CLASS_KEY_OPTIONS,
    DURATION_UNIT_OPTIONS,
    TARGET_TYPE_OPTIONS,
    AREA_SHAPE_OPTIONS,
    DELIVERY_TYPE_OPTIONS,
    PROJECTILE_DISTRIBUTION_OPTIONS,
    SAVE_TYPE_OPTIONS,
    SAVE_EFFECT_OPTIONS,
    SPELL_LEVEL_OPTIONS,
    damageTypeOptions,
    sourceOptions,
    buildSpell,
  } = useSpellForm(
    () => targetSpell.value,
    () => props.open,
  );

  /**
   * Тип атаки «На себя»: атаковать себя не нужно — автоматически проставляем
   * «Автопопадание», если оно ещё не включено. Чекбокс не блокируем — игрок
   * при желании может снять галочку вручную.
   */
  watch(deliveryType, (newDeliveryType) => {
    if (newDeliveryType === 'self' && !autoHit.value) {
      autoHit.value = true;
    }
  });

  /**
   * Подсказка секции «Снаряды»: нужен ли бросок атаки на каждый снаряд,
   * не настраивается отдельно — выводится из «Тип атаки»/«Автопопадание»,
   * поэтому противоречивую комбинацию задать нельзя.
   */
  const projectileHintText = computed(() => {
    if (autoHit.value) {
      return 'Снаряды попадают автоматически (как Волшебная стрела): урон со вкладки «Бой» кидается за каждый снаряд отдельно.';
    }

    if (['melee', 'ranged'].includes(deliveryType.value)) {
      return 'Каждый снаряд — отдельный бросок атаки (как Мистический заряд): урон кидается только за попавшие снаряды.';
    }

    return 'Снаряды распределяются по целям; урон кидается за каждый снаряд отдельно.';
  });

  /** Подпись поля основного размера области (радиус либо размер стороны) */
  const areaSizeLabel = computed(() => getAreaSizeLabel(areaShape.value));

  /** Нужно ли поле ширины для текущей формы области */
  const showAreaWidth = computed(() => areaShapeUsesWidth(areaShape.value));

  /** Нужно ли поле высоты для текущей формы области */
  const showAreaHeight = computed(() => areaShapeUsesHeight(areaShape.value));

  /** Классы сетки полей размеров области (доп. колонка при ширине/высоте) */
  const areaSizeGridClass = computed(() =>
    showAreaWidth.value || showAreaHeight.value
      ? 'grid-cols-[1fr_1fr_80px]'
      : 'grid-cols-[1fr_80px]',
  );

  // --- Эффекты ---
  const effectModalId = 'spell-effect-form-modal';
  const isEffectModalOpen = ref(false);
  const effectModalZIndex = ref<number | undefined>(undefined);
  const editingEffect = ref<ActiveEffect | undefined>(undefined);

  /** Вкладки формы */
  const tabItems = [
    { label: 'Общие', slot: 'general' as const },
    { label: 'Подробнее', slot: 'details' as const },
    { label: 'Бой', slot: 'combat' as const },
    { label: 'Эффекты', slot: 'effects' as const },
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

  /** Сохраняет форму */
  function handleSave(): void {
    emit('save', buildSpell());
    emit('close');
  }

  // --- Несохранённые изменения ---

  /** Снапшот состояния формы на момент открытия (для определения «грязности») */
  const initialFormSnapshot = ref('');

  /** Открыт ли диалог подтверждения закрытия с несохранёнными изменениями */
  const isDiscardConfirmOpen = ref(false);

  /** Z-index диалога подтверждения (поверх формы заклинания) */
  const discardConfirmZIndex = ref<number | undefined>(undefined);

  /**
   * Сериализует текущее состояние формы для сравнения с начальным снапшотом.
   * `id` обнуляется: для нового заклинания buildSpell генерирует его заново
   * при каждом вызове, что давало бы ложную «грязность».
   */
  function serializeFormState(): string {
    return JSON.stringify({ ...buildSpell(), id: '' });
  }

  // Снапшот формы при каждом открытии. Watcher объявлен ПОСЛЕ useSpellForm,
  // поэтому по порядку регистрации срабатывает после инициализации полей формы.
  watch(
    () => props.open,
    (isModalOpen) => {
      if (isModalOpen) {
        initialFormSnapshot.value = serializeFormState();
      }
    },
    { immediate: true },
  );

  /**
   * Закрывает форму («Отмена», крестик, клик мимо окна): при несохранённых
   * изменениях сначала показывает диалог подтверждения — раньше «Отмена»
   * молча теряла правки, а крестик молча сохранял.
   */
  function handleCancel(): void {
    if (serializeFormState() === initialFormSnapshot.value) {
      emit('close');

      return;
    }

    discardConfirmZIndex.value = getNextZIndex();
    isDiscardConfirmOpen.value = true;
  }

  /**
   * Обрабатывает закрытие окна (крестик/клик мимо) — как «Отмена».
   *
   * @param isModalOpen - новое состояние открытости окна
   */
  function handleOpenChange(isModalOpen: boolean): void {
    if (!isModalOpen) {
      handleCancel();
    }
  }

  /** Возвращает к редактированию (кнопка «Назад» в диалоге подтверждения) */
  function closeDiscardConfirm(): void {
    isDiscardConfirmOpen.value = false;
  }

  /** Закрывает форму без сохранения (кнопка «Отменить изменения») */
  function confirmDiscard(): void {
    isDiscardConfirmOpen.value = false;
    emit('close');
  }

  /** Сохраняет и закрывает форму (кнопка «Сохранить» в диалоге) */
  function confirmSave(): void {
    isDiscardConfirmOpen.value = false;
    handleSave();
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="isEditing ? 'Редактировать заклинание' : 'Создать заклинание'"
    :initial-width="700"
    :resizable="false"
    :z-index="zIndex"
    :saved-position="initialPosition"
    @update:open="handleOpenChange"
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
                  placeholder="Огненный шар"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Английское название">
                <UInput
                  v-model="nameEn"
                  placeholder="Fireball"
                  class="w-full"
                />
              </UFormField>
            </div>

            <!-- Описание -->
            <UFormField label="Описание">
              <RichTextEditor
                v-model="description"
                placeholder="Описание заклинания..."
              />
            </UFormField>

            <!-- Описание на высших кругах -->
            <UFormField label="На высших кругах">
              <RichTextEditor
                v-model="higherLevelDescription"
                placeholder="При использовании ячейки более высокого уровня..."
              />
            </UFormField>

            <!-- Источник -->
            <FormSection
              title="Источник"
              title-color="source"
            >
              <div class="flex items-center gap-4">
                <USelect
                  v-model="sourceKey"
                  :items="sourceOptions"
                  value-key="value"
                  placeholder="Выберите источник..."
                  class="flex-1"
                />

                <UCheckbox
                  v-model="isSRD"
                  label="SRD контент"
                  class="shrink-0"
                />
              </div>
            </FormSection>

            <!-- Доступность классов -->
            <FormSection
              title="Доступность классов"
              title-color="arcane"
            >
              <UFormField label="Каким классам доступно заклинание">
                <USelectMenu
                  v-model="classKeys"
                  :items="CLASS_KEY_OPTIONS"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="Выберите классы..."
                  class="w-full"
                />
              </UFormField>

              <p class="mt-2 text-xs text-dimmed">
                Заклинание появляется в списках выбора только у отмеченных
                классов. Оставьте пустым, если оно не привязано к классу.
              </p>
            </FormSection>
          </div>
        </template>

        <!-- Вкладка «Подробнее» -->
        <template #details>
          <div class="flex flex-col gap-4">
            <!-- Круг и Школа -->
            <FormSection
              title="Характеристика"
              title-color="arcane"
            >
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Круг">
                  <USelect
                    v-model="level"
                    :items="SPELL_LEVEL_OPTIONS"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Школа магии">
                  <USelect
                    v-model="school"
                    :items="SPELL_SCHOOL_OPTIONS"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>

            <!-- Заряды использования (врождённые/расовые, заклинания существ) -->
            <FormSection
              title="Заряды (откат от отдыха)"
              title-color="warning"
            >
              <UCheckbox
                v-model="hasUses"
                label="Ограниченное число использований"
              />

              <div
                v-if="hasUses"
                class="mt-3 grid grid-cols-3 gap-3"
              >
                <UFormField label="Максимум">
                  <UInput
                    v-model.number="usesMax"
                    type="number"
                    :min="1"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Текущие">
                  <UInput
                    v-model.number="usesCurrent"
                    type="number"
                    :min="0"
                    :max="usesMax"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Восстановление">
                  <USelect
                    v-model="usesRecovery"
                    :items="[...SPELL_USES_RECOVERY_OPTIONS]"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>

            <!-- Компоненты -->
            <FormSection
              title="Компоненты (V, S, M)"
              title-color="info"
            >
              <div
                class="flex flex-wrap gap-4"
                :class="{ 'mb-3': material }"
              >
                <UCheckbox
                  v-model="verbal"
                  label="Вербальный (V)"
                />

                <UCheckbox
                  v-model="somatic"
                  label="Соматический (S)"
                />

                <UCheckbox
                  v-model="material"
                  label="Материальный (M)"
                />
              </div>

              <template v-if="material">
                <div class="rounded bg-elevated/30 p-3">
                  <div class="flex w-full items-start gap-3">
                    <UFormField
                      label="Описание компонента"
                      class="flex-1"
                    >
                      <UTextarea
                        v-model="materialDescription"
                        autoresize
                        :rows="1"
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField
                      label="Стоимость (з.м.)"
                      class="w-[120px] shrink-0"
                    >
                      <UInput
                        v-model.number="materialCost"
                        type="number"
                        class="w-full"
                      />
                    </UFormField>

                    <div class="flex h-8 shrink-0 items-center self-end pb-0.5">
                      <UCheckbox
                        v-model="materialConsumed"
                        label="Расходуется"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </FormSection>

            <div class="grid grid-cols-2 gap-4">
              <!-- Время сотворения -->
              <FormSection
                title="Сотворение"
                title-color="healing"
              >
                <template #actions>
                  <UCheckbox
                    v-model="ritual"
                    label="Ритуальное заклинание"
                    indicator="end"
                    :ui="{
                      label: 'text-xs font-semibold tracking-wide text-dimmed',
                    }"
                  />
                </template>

                <div class="grid grid-cols-[100px_1fr] gap-3">
                  <UFormField label="Кол-во">
                    <UInput
                      v-model.number="castingTimeValue"
                      type="number"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    label="Единица"
                    class="min-w-0"
                  >
                    <USelect
                      v-model="castingTimeUnit"
                      :items="CASTING_TIME_OPTIONS"
                      value-key="value"
                      class="w-full min-w-0"
                      :ui="{ base: 'min-w-0', value: 'truncate min-w-0' }"
                    >
                      <template #item-label="{ item: option }">
                        <UTooltip
                          :text="option.label"
                          :delay-duration="0"
                        >
                          <span class="block truncate">{{ option.label }}</span>
                        </UTooltip>
                      </template>
                    </USelect>
                  </UFormField>
                </div>

                <UFormField
                  v-if="castingTimeUnit === 'reaction'"
                  label="Условие реакции"
                  class="mt-3"
                >
                  <UInput
                    v-model="reactionTrigger"
                    class="w-full"
                  />
                </UFormField>
              </FormSection>

              <!-- Длительность -->
              <FormSection
                title="Длительность"
                title-color="gold"
              >
                <template #actions>
                  <UCheckbox
                    v-model="concentration"
                    label="Требуется концентрация"
                    indicator="end"
                    :ui="{
                      label: 'text-xs font-semibold tracking-wide text-dimmed',
                    }"
                  />
                </template>

                <div class="grid grid-cols-[100px_1fr] gap-3">
                  <UFormField label="Кол-во">
                    <UInput
                      v-model.number="durationValue"
                      type="number"
                      :disabled="
                        [
                          'instantaneous',
                          'special',
                          'until-dispelled',
                        ].includes(durationUnit)
                      "
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Единица">
                    <USelect
                      v-model="durationUnit"
                      :items="DURATION_UNIT_OPTIONS"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </FormSection>
            </div>

            <!-- Дистанция и Цели -->
            <FormSection
              title="Дистанция и Цели"
              title-color="warning"
            >
              <div class="grid grid-cols-3 gap-3">
                <div class="grid grid-cols-[1fr_90px] gap-2">
                  <UFormField label="Дистанция">
                    <UInput
                      v-model.number="range"
                      type="number"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Ед.">
                    <USelect
                      v-model="rangeUnit"
                      :items="DISTANCE_UNIT_OPTIONS"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <UFormField label="Особая дистанция">
                  <UInput
                    v-model="rangeSpecial"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Тип цели">
                  <USelect
                    v-model="targetType"
                    :items="TARGET_TYPE_OPTIONS"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <!-- Цели: обычное заклинание — число целей под общий бросок;
                   снаряды — свой бросок на каждый + режим распределения -->
              <div
                v-if="['creature', 'object'].includes(targetType)"
                class="mt-3 flex flex-col gap-3"
              >
                <div
                  v-if="!hasProjectiles"
                  class="grid grid-cols-3 gap-3"
                >
                  <UFormField label="Кол-во целей">
                    <UInput
                      v-model.number="targetCount"
                      type="number"
                      :min="1"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    v-if="level > 0"
                    label="Доп. целей за круг"
                  >
                    <UInput
                      v-model.number="scalingAdditionalTargets"
                      type="number"
                      :min="0"
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <div class="border-t border-default/50 pt-3">
                  <UCheckbox
                    v-model="hasProjectiles"
                    label="Снаряды (отдельный бросок на каждый)"
                    :ui="{
                      label: 'text-xs font-semibold tracking-wide text-gold',
                    }"
                  />
                </div>

                <div
                  v-if="hasProjectiles"
                  class="flex flex-col gap-3"
                >
                  <p class="text-xs text-dimmed">
                    {{ projectileHintText }}
                  </p>

                  <div class="grid grid-cols-2 gap-3">
                    <UFormField label="Базовое число снарядов">
                      <UInput
                        v-model.number="projectileCount"
                        type="number"
                        :min="1"
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField
                      v-if="level > 0"
                      label="Доп. снарядов за круг выше базового"
                    >
                      <UInput
                        v-model.number="projectilePerSlotLevel"
                        type="number"
                        :min="0"
                        class="w-full"
                      />
                    </UFormField>
                  </div>

                  <UFormField label="Распределение по целям">
                    <URadioGroup
                      v-model="projectileTargetDistribution"
                      :items="[...PROJECTILE_DISTRIBUTION_OPTIONS]"
                      value-key="value"
                    />
                  </UFormField>

                  <!-- Пороги уровня персонажа (заговоры) -->
                  <template v-if="level === 0">
                    <p class="text-xs text-dimmed">
                      Пороги уровня персонажа: начиная с указанного уровня число
                      снарядов заменяется целиком (напр. 2 на 5-м, 3 на 11-м, 4
                      на 17-м).
                    </p>

                    <div
                      v-for="(tier, tierIndex) in projectileTiers"
                      :key="tierIndex"
                      class="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
                    >
                      <UFormField label="С уровня персонажа">
                        <UInput
                          v-model.number="tier.level"
                          type="number"
                          :min="1"
                          :max="20"
                          class="w-full"
                        />
                      </UFormField>

                      <UFormField label="Снарядов">
                        <UInput
                          v-model.number="tier.count"
                          type="number"
                          :min="1"
                          class="w-full"
                        />
                      </UFormField>

                      <UButton
                        icon="tabler:trash"
                        color="error"
                        variant="ghost"
                        size="xs"
                        aria-label="Удалить порог"
                        class="mb-1"
                        @click.left.exact.prevent="
                          removeProjectileTier(tierIndex)
                        "
                      />
                    </div>

                    <UButton
                      icon="tabler:plus"
                      variant="soft"
                      size="sm"
                      class="self-start"
                      @click.left.exact.prevent="addProjectileTier"
                    >
                      Добавить порог
                    </UButton>
                  </template>
                </div>
              </div>
            </FormSection>

            <!-- Область действия (Шаблон) -->
            <FormSection
              v-if="targetType === 'area'"
              title="Область действия (Шаблон)"
              title-color="info"
              class="transition-all duration-200"
            >
              <div class="grid grid-cols-3 gap-3">
                <UFormField
                  label="Форма"
                  class="col-span-1"
                >
                  <USelect
                    v-model="areaShape"
                    :items="AREA_SHAPE_OPTIONS"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>

                <div
                  class="col-span-2 grid gap-2"
                  :class="areaSizeGridClass"
                >
                  <UFormField :label="areaSizeLabel">
                    <UInput
                      v-model.number="areaSize"
                      type="number"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    v-if="showAreaWidth"
                    label="Ширина"
                  >
                    <UInput
                      v-model.number="areaWidth"
                      type="number"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    v-if="showAreaHeight"
                    label="Высота"
                  >
                    <UInput
                      v-model.number="areaHeight"
                      type="number"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Ед.">
                    <USelect
                      v-model="areaUnit"
                      :items="DISTANCE_UNIT_OPTIONS"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <div class="col-span-3 mt-2">
                  <UCheckbox
                    v-model="areaResizable"
                    label="Размер можно менять при размещении"
                    help="Полезно, если область заклинания может охватывать разную площадь (например, облако)"
                  />
                </div>
              </div>
            </FormSection>
          </div>
        </template>

        <!-- Вкладка «Бой» -->
        <template #combat>
          <div class="flex flex-col gap-4">
            <!-- Эффект (части урона / лечения) -->
            <DamagePartsEditor
              v-model="damageParts"
              :damage-type-options="damageTypeOptions"
              :allow-empty="true"
            >
              <template #actions>
                <UCheckbox
                  v-model="autoHit"
                  label="Автопопадание"
                />
              </template>
            </DamagePartsEditor>

            <!-- Точность (Атака и Спасбросок) -->
            <FormSection
              title="Точность"
              title-color="danger"
            >
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Тип атаки">
                  <USelect
                    v-model="deliveryType"
                    :items="DELIVERY_TYPE_OPTIONS"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>

                <div
                  v-if="['ranged', 'melee'].includes(deliveryType)"
                  class="grid grid-cols-2 gap-3"
                >
                  <UFormField label="Характеристика">
                    <USelect
                      v-model="attackAbility"
                      :items="ABILITY_OPTIONS"
                      value-key="value"
                      placeholder="По умолчанию"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Бонус к атаке">
                    <UInput
                      v-model.number="attackBonus"
                      type="number"
                      class="w-full"
                    >
                      <template #trailing>
                        <UTooltip
                          text="Фиксированный модификатор сверх характеристики (напр. +1 от магии)"
                        >
                          <UIcon
                            name="tabler:help-circle-filled"
                            class="size-4.5 cursor-help text-dimmed transition-colors hover:text-default"
                          />
                        </UTooltip>
                      </template>
                    </UInput>
                  </UFormField>
                </div>
              </div>

              <div
                class="mt-3 grid grid-cols-2 gap-3 border-t border-default/50 pt-3"
              >
                <UFormField label="Спасбросок">
                  <USelect
                    v-model="saveType"
                    :items="SAVE_TYPE_OPTIONS"
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
                    :items="SAVE_EFFECT_OPTIONS"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>

            <!-- Масштабирование -->
            <FormSection
              class="transition-all duration-200"
              :title="level === 0 ? 'Масштабирование заговора' : undefined"
              :title-color="level === 0 ? 'arcane' : undefined"
              :has-content="level === 0 ? true : hasScaling"
            >
              <!-- Заголовок для заклинаний уровня > 0 -->
              <template
                v-if="level > 0"
                #header
              >
                <UCheckbox
                  v-model="hasScaling"
                  label="Усиление на высших кругах"
                  :ui="{
                    label: 'text-xs font-semibold tracking-wide text-arcane',
                  }"
                />
              </template>

              <!-- Для заклинаний уровня > 0 -->
              <div
                v-if="level > 0"
                class="w-full"
              >
                <div
                  v-if="hasScaling"
                  class="flex flex-col gap-3"
                >
                  <UFormField label="Доп. урон за каждый круг">
                    <UInput
                      v-model="scalingAdditionalDice"
                      placeholder="1к6"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Описание усиления">
                    <UInput
                      v-model="scalingDescription"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>

              <!-- Для заговоров (уровень 0) -->
              <div
                v-else
                class="flex flex-col gap-3"
              >
                <p class="text-xs text-dimmed">
                  Поуровневые тиры: на каждом пороге уровня заклинателя весь
                  набор частей урона/лечения заменяется целиком. До первого тира
                  используются базовые части (вкладка «Бой»).
                </p>

                <!-- Тиры масштабирования -->
                <div
                  v-for="(tier, tierIndex) in cantripScalingTiers"
                  :key="tierIndex"
                  class="flex flex-col gap-3 rounded-lg border border-default p-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <UFormField
                      label="С уровня заклинателя"
                      class="flex-1"
                    >
                      <UInput
                        v-model.number="tier.level"
                        type="number"
                        :min="1"
                        :max="20"
                        placeholder="5"
                        class="w-full"
                      />
                    </UFormField>

                    <UButton
                      icon="tabler:trash"
                      color="error"
                      variant="ghost"
                      size="xs"
                      aria-label="Удалить тир"
                      class="mt-5 shrink-0"
                      @click.left.exact.prevent="removeCantripTier(tierIndex)"
                    />
                  </div>

                  <DamagePartRow
                    v-for="(part, partIndex) in tier.parts"
                    :key="partIndex"
                    v-model="tier.parts[partIndex]"
                    :index="partIndex"
                    :damage-type-options="damageTypeOptions"
                    :can-remove="tier.parts.length > 1"
                    @remove="removeCantripTierPart(tierIndex, partIndex)"
                  />

                  <UButton
                    icon="tabler:plus"
                    variant="soft"
                    size="sm"
                    class="self-start"
                    @click.left.exact.prevent="addCantripTierPart(tierIndex)"
                  >
                    Добавить часть
                  </UButton>
                </div>

                <UButton
                  icon="tabler:plus"
                  variant="soft"
                  size="sm"
                  class="self-start"
                  @click.left.exact.prevent="addCantripTier"
                >
                  Добавить уровень
                </UButton>
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
              Нет эффектов при применении заклинания
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
          @click.left.exact.prevent="handleCancel"
        />

        <UButton
          :label="isEditing ? 'Сохранить' : 'Создать'"
          color="primary"
          :disabled="!name.trim()"
          @click.left.exact.prevent="handleSave"
        />
      </div>
    </template>
  </UDraggableModal>

  <!-- Подтверждение закрытия с несохранёнными изменениями -->
  <UDraggableModal
    v-model:open="isDiscardConfirmOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="400"
    :min-height="160"
    :z-index="discardConfirmZIndex"
    title="Несохранённые изменения"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-toned">
          В форме заклинания есть несохранённые изменения. Сохранить их?
        </p>

        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click.left.exact.prevent="closeDiscardConfirm"
          >
            Назад
          </UButton>

          <UButton
            variant="ghost"
            color="error"
            size="sm"
            @click.left.exact.prevent="confirmDiscard"
          >
            Отменить изменения
          </UButton>

          <UButton
            color="primary"
            size="sm"
            :disabled="!name.trim()"
            @click.left.exact.prevent="confirmSave"
          >
            Сохранить
          </UButton>
        </div>
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
