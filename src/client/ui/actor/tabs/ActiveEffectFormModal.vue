<script setup lang="ts">
  import type { AbilityType, DamagePart } from '@vtt/shared';
  import type {
    ActiveEffect,
    AreaEffectTrigger,
    ConditionKey,
    EffectSaveOutcome,
    EffectSaveTiming,
    EffectTurnAnchor,
    EffectTurnTiming,
  } from '@vtt/shared/system/dnd.js';

  import { generateId } from '@vtt/shared';
  import {
    ABILITY_OPTIONS,
    AREA_TRIGGER_LABELS,
    CONDITION_EFFECT_TEMPLATES,
    CONDITIONS,
    describeActiveEffect,
    EFFECT_DURATION_LABELS,
    EFFECT_FLAG_LABELS,
    EFFECT_TURN_ANCHOR_LABELS,
    EFFECT_TURN_TIMING_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, reactive, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import DamagePartsEditor from '../DamagePartsEditor.vue';
  import ActiveEffectConditionTemplatesModal from './ActiveEffectConditionTemplatesModal.vue';
  import ActiveEffectFlagTemplatesModal from './ActiveEffectFlagTemplatesModal.vue';
  import ActiveEffectKeyTemplatesModal from './ActiveEffectKeyTemplatesModal.vue';
  import ActiveEffectValueTemplatesModal from './ActiveEffectValueTemplatesModal.vue';

  interface Props {
    open: boolean;
    modalId: string;
    zIndex?: number;
    effect?: ActiveEffect; // Если не передано — создание нового
    savedPosition?: { x: number; y: number };
    savedSize?: { width: number; height: number };
    onSave?: (effect: ActiveEffect) => void;
    /** Скрыть секцию «Аура» (напр. для area-эффектов) */
    hideAura?: boolean;
    /** Показать переключатель «Цель эффекта» (Себе / Цели при атаке) */
    showEffectTarget?: boolean;
    /** Показать выбор триггера области (При входе / выходе / Пока внутри) */
    showAreaTrigger?: boolean;
  }

  const props = withDefaults(defineProps<Props>(), {
    zIndex: undefined,
    effect: undefined,
    savedPosition: undefined,
    savedSize: undefined,
    onSave: () => {},
    hideAura: false,
    showEffectTarget: false,
    showAreaTrigger: false,
  });

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'save': [effect: ActiveEffect];
    'bring-to-front': [];
    'close': [];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => {
      if (!value) {
        handleClose();
      }

      emit('update:open', value);
    },
  });

  // Локальное состояние формы
  const form = reactive<ActiveEffect>({
    id: '',
    name: 'Новый Эффект',
    description: '',
    icon: 'tabler:sparkles',
    disabled: false,
    origin: 'manual',
    transfer: false,
    duration: { type: 'permanent' },
    changes: [],
    flags: [],
  });

  const isActive = computed({
    get: () => !form.disabled,
    set: (val) => {
      form.disabled = !val;
    },
  });

  /** Сегменты «Снять эффект» (`consumeOn`) — как у «Цели эффекта». */
  const consumeOnTabs = [
    { value: 'none', label: 'Нет', icon: 'tabler:hourglass' },
    { value: 'carrierAttack', label: 'Своя атака', icon: 'tabler:sword' },
    {
      value: 'attackOnCarrier',
      label: 'Атака по цели',
      icon: 'tabler:target-arrow',
    },
  ];

  /** Применяет выбор «Снять эффект»: «none» → не задано (по длительности). */
  function handleConsumeOnChange(value: string | number) {
    form.consumeOn =
      value === 'carrierAttack' || value === 'attackOnCarrier'
        ? value
        : undefined;
  }

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        if (props.effect) {
          Object.assign(form, JSON.parse(JSON.stringify(props.effect)));

          // Гарантируем значение по умолчанию для effectTarget
          if (!form.effectTarget) {
            form.effectTarget = 'self';
          }
        } else {
          // Дефолтные значения для нового эффекта
          form.id = generateId('effect');
          form.name = 'Новый Эффект';
          form.icon = 'tabler:sparkles';
          form.disabled = false;
          form.origin = 'manual';
          form.transfer = false;
          form.duration = { type: 'permanent' };
          form.changes = [];
          form.flags = [];
          form.effectTarget = 'target';
          delete form.aura;
        }
      }
    },
    { immediate: true },
  );

  /** Авто-описание, собранное из текущих настроек эффекта (для предпросмотра). */
  const generatedDescription = computed(() => describeActiveEffect(form));

  /** Заполняет поле описания авто-сгенерированным текстом. */
  function applyGeneratedDescription() {
    form.description = generatedDescription.value;
  }

  function handleClose() {
    emit('update:open', false);
  }

  function handleSave() {
    if (!form.name.trim()) {
      return;
    }

    // У области/ауры нет «кастера» — динамический DC (0 = подставить Сл кастера)
    // резолвить нечем, поэтому фиксируем минимум 1.
    if (
      (props.showAreaTrigger || form.aura)
      && form.applySave
      && form.applySave.dc < 1
    ) {
      form.applySave.dc = 1;
    }

    emit('save', JSON.parse(JSON.stringify(form)) as ActiveEffect);
    handleClose();
  }

  function addChange() {
    form.changes.push({
      key: 'armorClass',
      mode: 'add',
      value: '1',
      condition: '',
      priority: 20,
    });
  }

  function removeChange(index: number) {
    form.changes.splice(index, 1);
  }

  const modeOptions = [
    { value: 'add', label: 'Добавить (+)' },
    { value: 'multiply', label: 'Умножить (*)' },
    { value: 'override', label: 'Перезаписать (=)' },
    { value: 'upgrade', label: 'Улучшить (Max)' },
    { value: 'downgrade', label: 'Ухудшить (Min)' },
    { value: 'custom', label: 'Пользовательский' },
  ];

  const auraTargetOptions = [
    { value: 'allies', label: 'Только союзники' },
    { value: 'enemies', label: 'Только враги' },
    { value: 'all', label: 'Все существа' },
  ];

  const effectTargetTabs = [
    { value: 'target', label: 'Цель', icon: 'tabler:crosshair' },
    { value: 'self', label: 'Себе', icon: 'tabler:user-shield' },
  ];

  /** Вкладки редактора эффекта */
  const tabItems = [
    { label: 'Основное', slot: 'general' as const },
    { label: 'Дополнительная', slot: 'combat' as const },
  ];

  /**
   * Применяет выбор «Цель эффекта» из сегментированного переключателя.
   * Сбрасывает ауру при выборе 'target', т.к. аура и эффект на цель —
   * взаимоисключающие режимы.
   */
  function handleEffectTargetChange(value: string | number) {
    const next = value === 'target' ? 'target' : 'self';

    form.effectTarget = next;

    if (next === 'target' && form.aura) {
      delete form.aura;
    }
  }

  /** Опции пресетов состояний для UDropdownMenu */
  const conditionPresetItems = [
    CONDITIONS.filter((condition) => condition.key !== 'exhaustion').map(
      (condition) => ({
        label: condition.nameRu,
        icon: condition.icon,
        onSelect: () => applyConditionPreset(condition.key),
      }),
    ),
  ];

  /**
   * Заполняет форму данными из шаблона стандартного D&D 5e состояния.
   * Сохраняет текущий id и effectTarget, заменяет остальное.
   */
  function applyConditionPreset(conditionKey: ConditionKey) {
    const conditionEntry = CONDITIONS.find(
      (condition) => condition.key === conditionKey,
    );

    const template = CONDITION_EFFECT_TEMPLATES[conditionKey];

    if (!conditionEntry || !template) {
      return;
    }

    form.name = conditionEntry.nameRu;
    form.icon = conditionEntry.icon;
    form.description = conditionEntry.description;
    form.origin = 'condition';
    form.disabled = false;
    // conditionKey нужен для проверки иммунитета цели и опознания состояния
    form.conditionKey = conditionKey;
    form.changes = template.changes.map((change) => ({ ...change }));
    form.flags = [...template.flags];
    form.duration = { type: 'special' };
    delete form.aura;
  }

  const isTemplateModalOpen = ref(false);
  const isKeyModalOpen = ref(false);
  const isValueModalOpen = ref(false);
  const activeChangeIndex = ref<number | null>(null);

  function openTemplateModal(index: number) {
    activeChangeIndex.value = index;
    isTemplateModalOpen.value = true;
  }

  function openKeyModal(index: number) {
    activeChangeIndex.value = index;
    isKeyModalOpen.value = true;
  }

  function openValueModal(index: number) {
    activeChangeIndex.value = index;
    isValueModalOpen.value = true;
  }

  function applyConditionTemplate(value: string) {
    if (
      activeChangeIndex.value !== null
      && form.changes[activeChangeIndex.value]
    ) {
      form.changes[activeChangeIndex.value].condition = value;
    }

    isTemplateModalOpen.value = false;
    activeChangeIndex.value = null;
  }

  function applyValueTemplate(value: string) {
    if (
      activeChangeIndex.value !== null
      && form.changes[activeChangeIndex.value]
    ) {
      form.changes[activeChangeIndex.value].value = value;
    }

    isValueModalOpen.value = false;
    activeChangeIndex.value = null;
  }

  function applyKeyTemplate(value: string) {
    if (
      activeChangeIndex.value !== null
      && form.changes[activeChangeIndex.value]
    ) {
      // @ts-expect-error - Разрешаем любые строковые ключи для динамических эффектов
      form.changes[activeChangeIndex.value].key = value;
    }

    isKeyModalOpen.value = false;
    activeChangeIndex.value = null;
  }

  const isFlagModalOpen = ref(false);
  const activeFlagIndex = ref<number | null>(null);

  function openFlagModal(index: number) {
    activeFlagIndex.value = index;
    isFlagModalOpen.value = true;
  }

  function applyFlagTemplate(value: string) {
    if (
      activeFlagIndex.value !== null
      && typeof form.flags[activeFlagIndex.value] !== 'undefined'
    ) {
      // @ts-expect-error - Разрешаем строковые ключи для динамических эффектов
      form.flags[activeFlagIndex.value] = value;
    }

    isFlagModalOpen.value = false;
    activeFlagIndex.value = null;
  }

  function addFlag() {
    form.flags.push('vision.blinded'); // Дефолтное значение для удобства редактирования или пустая строка
  }

  function removeFlag(index: number) {
    form.flags.splice(index, 1);
  }

  const durationTypes = Object.entries(EFFECT_DURATION_LABELS).map(
    ([value, label]) => ({
      value,
      label,
    }),
  );

  const hasDurationValue = computed(() =>
    ['rounds', 'minutes', 'hours', 'days'].includes(form.duration.type),
  );

  /** Точная «ходовая» длительность (до начала/конца хода носителя/источника). */
  const isTurnDuration = computed(() => form.duration.type === 'turn');

  const turnAnchorOptions = Object.entries(EFFECT_TURN_ANCHOR_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  const turnTimingOptions = Object.entries(EFFECT_TURN_TIMING_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  /** Якорь хода (носитель/источник) с дефолтом `carrier`. */
  const turnAnchorValue = computed<EffectTurnAnchor>({
    get: () => form.duration.turnAnchor ?? 'carrier',
    set: (val) => {
      form.duration.turnAnchor = val;
    },
  });

  /** Момент хода (начало/конец) с дефолтом `end`. */
  const turnTimingValue = computed<EffectTurnTiming>({
    get: () => form.duration.turnTiming ?? 'end',
    set: (val) => {
      form.duration.turnTiming = val;
    },
  });

  const durationDescription = computed(() => {
    switch (form.duration.type) {
      case 'permanent':
        return 'Действует вечно, пока не снят вручную.';
      case 'rounds':
        return 'Снижается автоматически каждый раунд в бою.';
      case 'turn':
        return 'Точно спадает на ходу носителя или источника (кастера) — «до конца моего следующего хода», а не на границе раунда. Работает в бою.';
      case 'special':
        return 'Специальное событие, отслеживается Мастером.';
      default:
        return 'Информационная подсказка, не пересчитывается.';
    }
  });

  const effectTargetDescription = computed(() =>
    form.effectTarget === 'target'
      ? 'Накладывается на цель при попадании атакой.'
      : 'Применяется к владельцу при экипировке.',
  );

  const isAura = computed({
    get: () => !!form.aura,
    set: (val) => {
      if (val) {
        form.aura = {
          radius: 10,
          target: 'allies',
          applyToSelf: true,
          visible: true,
        };

        // Аура и effectTarget: 'target' взаимоисключающие
        form.effectTarget = 'self';
      } else {
        delete form.aura;
      }
    },
  });

  // «Цель эффекта» доступна всегда (кроме режима ауры) — единый редактор для
  // само-баффов и эффектов на цель при попадании. Проп `showEffectTarget`
  // оставлен для обратной совместимости вызывающих.
  const showEffectTargetField = computed(() => !isAura.value);

  const systemDataStore = useSystemDataStore();

  /** Опции типа урона (для DamagePartsEditor) */
  const damageTypeOptions = computed(() =>
    systemDataStore.damageTypes.map((damageTypeEntry) => ({
      label: damageTypeEntry.name,
      value: damageTypeEntry.key,
    })),
  );

  /** Эффект успешного спасброска наложения */
  const onSuccessOptions: Array<{ value: EffectSaveOutcome; label: string }> = [
    { value: 'negate', label: 'Отменяет эффект' },
    { value: 'half', label: 'Половина урона' },
  ];

  /** Момент периодического спасброска / урона */
  const recurringTimingOptions: Array<{
    value: EffectSaveTiming;
    label: string;
  }> = [
    { value: 'endOfTurn', label: 'В конце хода цели' },
    { value: 'startOfTurn', label: 'В начале хода цели' },
  ];

  /** Опции триггера области (При входе / При выходе / Пока внутри) */
  const areaTriggerOptions = Object.entries(AREA_TRIGGER_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  /** Триггер срабатывания эффекта области (по умолчанию «Пока внутри») */
  const areaTriggerModel = computed<AreaEffectTrigger>({
    get: () => form.areaTrigger ?? 'stay',
    set: (trigger) => {
      // `stay` — поведение по умолчанию, поле не храним для чистоты данных
      form.areaTrigger = trigger === 'stay' ? undefined : trigger;
    },
  });

  /** Подсказка под выбором триггера области/ауры */
  const areaTriggerDescription = computed(() => {
    switch (areaTriggerModel.value) {
      case 'enter':
        return 'Разовая нагрузка (урон/статус) в момент входа в область/ауру. Срабатывает на каждый вход.';
      case 'exit':
        return 'Разовая нагрузка (урон/статус) в момент выхода из области/ауры.';
      default:
        return 'Эффект висит на цели, пока она внутри области/ауры, и снимается при выходе.';
    }
  });

  /** Спасбросок при наложении эффекта (при попадании атакой) */
  const hasApplySave = computed({
    get: () => form.applySave !== undefined,
    set: (enabled) => {
      form.applySave = enabled
        ? { ability: 'wisdom', dc: 13, onSuccess: 'negate' }
        : undefined;
    },
  });

  const applySaveAbility = computed<AbilityType>({
    get: () => form.applySave?.ability ?? 'wisdom',
    set: (ability) => {
      if (form.applySave) {
        form.applySave.ability = ability;
      }
    },
  });

  const applySaveDc = computed<number>({
    get: () => form.applySave?.dc ?? 13,
    set: (dc) => {
      if (form.applySave) {
        form.applySave.dc = dc;
      }
    },
  });

  const applySaveOnSuccess = computed<EffectSaveOutcome>({
    get: () => form.applySave?.onSuccess ?? 'negate',
    set: (onSuccess) => {
      if (form.applySave) {
        form.applySave.onSuccess = onSuccess;
      }
    },
  });

  /** Накладывать эффект-состояние даже при успешном спасброске */
  const applyOnSuccess = computed({
    get: () => form.applyOnSuccess === true,
    set: (value) => {
      form.applyOnSuccess = value ? true : undefined;
    },
  });

  /** Урон, наносимый при наложении эффекта (v-model для DamagePartsEditor) */
  const damagePartsModel = computed<DamagePart[]>({
    get: () => form.damageParts ?? [],
    set: (parts) => {
      form.damageParts = parts.length > 0 ? parts : undefined;
    },
  });

  /** Периодический спасбросок для снятия эффекта */
  const hasRecurringSave = computed({
    get: () => form.recurringSave !== undefined,
    set: (enabled) => {
      form.recurringSave = enabled
        ? {
            ability: form.applySave?.ability ?? 'wisdom',
            dc: form.applySave?.dc ?? 13,
            timing: 'endOfTurn',
          }
        : undefined;
    },
  });

  const recurringAbility = computed<AbilityType>({
    get: () => form.recurringSave?.ability ?? 'wisdom',
    set: (ability) => {
      if (form.recurringSave) {
        form.recurringSave.ability = ability;
      }
    },
  });

  const recurringDc = computed<number>({
    get: () => form.recurringSave?.dc ?? 13,
    set: (dc) => {
      if (form.recurringSave) {
        form.recurringSave.dc = dc;
      }
    },
  });

  const recurringTiming = computed<EffectSaveTiming>({
    get: () => form.recurringSave?.timing ?? 'endOfTurn',
    set: (timing) => {
      if (form.recurringSave) {
        form.recurringSave.timing = timing;
      }
    },
  });

  /** Периодический урон (DoT) — наносится каждый ход, пока эффект активен */
  const hasRecurringDamage = computed({
    get: () => form.recurringDamage !== undefined,
    set: (enabled) => {
      form.recurringDamage = enabled
        ? { damageParts: [], timing: 'startOfTurn' }
        : undefined;
    },
  });

  /** Части периодического урона (v-model для DamagePartsEditor) */
  const recurringDamageModel = computed<DamagePart[]>({
    get: () => form.recurringDamage?.damageParts ?? [],
    set: (parts) => {
      if (form.recurringDamage) {
        form.recurringDamage.damageParts = parts;
      }
    },
  });

  const recurringDamageTiming = computed<EffectSaveTiming>({
    get: () => form.recurringDamage?.timing ?? 'startOfTurn',
    set: (timing) => {
      if (form.recurringDamage) {
        form.recurringDamage.timing = timing;
      }
    },
  });

  // eslint-disable-next-line unused-imports/no-unused-vars
  const flagOptions = Object.entries(EFFECT_FLAG_LABELS).map(
    ([value, label]) => ({
      value,
      label,
    }),
  );
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="true"
    :resizable="true"
    :blocking="false"
    :initial-width="900"
    :min-width="600"
    :min-height="400"
    :z-index="props.zIndex"
    :title="effect ? `Редактирование: ${effect.name}` : 'Новый Эффект'"
    :saved-position="savedPosition"
    :saved-size="savedSize"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-4 px-1 pb-1">
        <UTabs
          :items="tabItems"
          variant="pill"
          class="flex min-h-0 flex-1 flex-col"
          :ui="{
            list: 'mb-3',
            trigger: 'flex-1 justify-center',
            content: 'min-h-0 overflow-y-auto',
          }"
        >
          <!-- Вкладка «Основное» -->
          <template #general>
            <div class="space-y-4">
              <!-- Кнопка «Шаблон состояния» -->
              <div class="flex items-center gap-2">
                <UDropdownMenu
                  :items="conditionPresetItems"
                  :ui="{ content: 'max-h-[300px] overflow-y-auto' }"
                >
                  <UButton
                    icon="tabler:template"
                    label="Шаблон состояния"
                    color="neutral"
                    variant="outline"
                    size="xs"
                  />
                </UDropdownMenu>

                <span class="text-xs text-dimmed italic">
                  Заполнит форму данными стандартного состояния D&D 5e
                </span>
              </div>

              <!-- Базовые данные -->
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <UFormField
                  label="Название"
                  class="sm:col-span-4"
                >
                  <UInput
                    v-model="form.name"
                    class="w-full"
                  />
                </UFormField>

                <UFormField
                  label="Иконка"
                  class="sm:col-span-4"
                >
                  <UInput
                    v-model="form.icon"
                    class="w-full"
                    placeholder="Напр: tabler:sparkles"
                  />
                </UFormField>

                <UFormField
                  v-if="!props.hideAura && form.effectTarget !== 'target'"
                  label="Аура"
                  class="sm:col-span-2"
                >
                  <div
                    class="flex h-full min-h-[32px] cursor-pointer items-center justify-between rounded-[calc(var(--ui-radius)*1.5)] border border-default/50 bg-elevated/50 px-3 py-1"
                    @click.left.exact.prevent="isAura = !isAura"
                  >
                    <span
                      class="text-xs font-medium transition-colors"
                      :class="isAura ? 'text-indigo-400' : 'text-muted'"
                    >
                      {{ isAura ? 'Включена' : 'Нет' }}
                    </span>

                    <USwitch
                      v-model="isAura"
                      size="sm"
                      color="primary"
                      @click.stop
                    />
                  </div>
                </UFormField>

                <UFormField
                  label="Статус"
                  class="sm:col-span-2"
                >
                  <div
                    class="flex h-full min-h-[32px] cursor-pointer items-center justify-between rounded-[calc(var(--ui-radius)*1.5)] border border-default/50 bg-elevated/50 px-3 py-1"
                    @click.left.exact.prevent="isActive = !isActive"
                  >
                    <span
                      class="text-xs font-medium transition-colors"
                      :class="isActive ? 'text-success' : 'text-muted'"
                    >
                      {{ isActive ? 'Работает' : 'Отключен' }}
                    </span>

                    <USwitch
                      v-model="isActive"
                      size="sm"
                      @click.stop
                    />
                  </div>
                </UFormField>
              </div>

              <!-- Описание + авто-генерация -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-medium text-muted">Описание</span>

                  <UButton
                    icon="tabler:wand"
                    label="Сгенерировать из настроек"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :disabled="!generatedDescription"
                    title="Заполнить описание автоматически из модификаторов, флагов и прочих настроек эффекта"
                    @click.left.exact.prevent="applyGeneratedDescription"
                  />
                </div>

                <UTextarea
                  v-model="form.description"
                  :rows="2"
                  autoresize
                  class="w-full"
                  placeholder="Краткое описание для тултипа и списка эффектов"
                />
              </div>

              <!-- Цель эффекта + Длительность (одной компактной строкой) -->
              <div
                class="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-lg border border-muted bg-elevated/30 px-4 py-3"
              >
                <!-- Цель эффекта: сегментированный переключатель -->
                <div
                  v-if="showEffectTargetField"
                  class="flex flex-col gap-1.5"
                >
                  <span
                    class="flex items-center gap-1 text-xs font-medium text-muted"
                  >
                    Цель эффекта

                    <UTooltip :text="effectTargetDescription">
                      <UIcon
                        name="tabler:info-circle"
                        class="size-3.5 text-dimmed transition-colors hover:text-default"
                      />
                    </UTooltip>
                  </span>

                  <UTabs
                    :model-value="form.effectTarget"
                    :items="effectTargetTabs"
                    :content="false"
                    size="xs"
                    color="primary"
                    class="w-fit"
                    @update:model-value="handleEffectTargetChange"
                  />
                </div>

                <!-- Снять эффект: сегменты (одноразовость «следующей атаки») -->
                <div class="flex flex-col gap-1.5">
                  <span
                    class="flex items-center gap-1 text-xs font-medium text-muted"
                  >
                    Снять эффект

                    <UTooltip
                      text="«Своя атака» / «Атака по цели»: эффект сгорает после первого же броска атаки (помеха/преимущество ровно на одну атаку), не дожидаясь конца длительности. «Нет» — живёт по длительности."
                    >
                      <UIcon
                        name="tabler:info-circle"
                        class="size-3.5 text-dimmed transition-colors hover:text-default"
                      />
                    </UTooltip>
                  </span>

                  <UTabs
                    :model-value="form.consumeOn ?? 'none'"
                    :items="consumeOnTabs"
                    :content="false"
                    size="xs"
                    color="primary"
                    class="w-fit"
                    @update:model-value="handleConsumeOnChange"
                  />
                </div>

                <!-- Тип длительности: селект + инлайн-количество -->
                <div class="flex min-w-[260px] flex-1 flex-col gap-1.5">
                  <span
                    class="flex items-center gap-1 text-xs font-medium text-muted"
                  >
                    Тип длительности

                    <UTooltip :text="durationDescription">
                      <UIcon
                        name="tabler:info-circle"
                        class="size-3.5 text-dimmed transition-colors hover:text-default"
                      />
                    </UTooltip>
                  </span>

                  <div class="flex items-center gap-2">
                    <USelect
                      v-model="form.duration.type"
                      :items="durationTypes"
                      value-key="value"
                      class="flex-1"
                      :portal="false"
                    />

                    <UInput
                      v-if="hasDurationValue"
                      v-model="form.duration.value"
                      type="number"
                      placeholder="Количество"
                      class="w-28 shrink-0"
                    />
                  </div>

                  <!-- Точная «ходовая» длительность: момент + чей ход -->
                  <div
                    v-if="isTurnDuration"
                    class="flex items-center gap-2"
                  >
                    <USelect
                      v-model="turnTimingValue"
                      :items="turnTimingOptions"
                      value-key="value"
                      class="flex-1"
                      :portal="false"
                    />

                    <USelect
                      v-model="turnAnchorValue"
                      :items="turnAnchorOptions"
                      value-key="value"
                      class="flex-1"
                      :portal="false"
                    />
                  </div>
                </div>
              </div>

              <!-- Аура -->
              <div
                v-if="!props.hideAura && isAura && form.aura"
                class="mb-4"
              >
                <div
                  class="grid grid-cols-1 items-end gap-4 rounded-lg border border-indigo-800/50 bg-indigo-900/20 p-2 px-3 sm:grid-cols-12"
                >
                  <UFormField
                    label="Радиус (фт)"
                    class="sm:col-span-2"
                  >
                    <UInput
                      v-model="form.aura.radius"
                      type="number"
                      min="0"
                      step="5"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    label="Цель ауры"
                    class="sm:col-span-4"
                  >
                    <USelect
                      v-model="form.aura.target"
                      :items="auraTargetOptions"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>

                  <div
                    class="flex h-8 items-center justify-start gap-4 pb-1 pl-2 sm:col-span-6"
                  >
                    <UCheckbox
                      v-model="form.aura.applyToSelf"
                      label="Применять к источнику"
                    />

                    <UCheckbox
                      v-model="form.aura.visible"
                      label="Круг на сцене"
                    />
                  </div>
                </div>
              </div>

              <!-- Флаги (нечисловые эффекты) -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-sm font-medium"
                    >Флаги (Состояния и иммунитеты)</span
                  >

                  <UButton
                    color="primary"
                    variant="ghost"
                    size="xs"
                    icon="tabler:plus"
                    @click.left.exact.prevent="addFlag"
                  >
                    Добавить
                  </UButton>
                </div>

                <div
                  v-if="form.flags.length === 0"
                  class="rounded-lg border border-dashed border-default p-4 text-center text-xs text-dimmed italic"
                >
                  Нет активных флагов.
                </div>

                <div
                  v-else
                  class="space-y-4 pb-4"
                >
                  <div
                    v-for="(flag, idx) in form.flags"
                    :key="idx"
                    class="flex flex-col gap-2 rounded-lg border border-default bg-elevated/50 p-3"
                  >
                    <UFormField>
                      <div class="flex w-full items-center gap-2">
                        <UInput
                          v-model="form.flags[idx]"
                          placeholder="Напр: vision.blinded"
                          size="sm"
                          class="flex-1 font-mono text-xs"
                        />

                        <UButton
                          color="neutral"
                          variant="soft"
                          icon="tabler:flag"
                          size="sm"
                          title="Библиотека флагов"
                          @click.left.exact.prevent="openFlagModal(idx)"
                        />

                        <UButton
                          color="red"
                          variant="soft"
                          icon="tabler:trash"
                          size="sm"
                          title="Удалить флаг"
                          @click.left.exact.prevent="removeFlag(idx)"
                        />
                      </div>
                    </UFormField>

                    <div
                      v-if="
                        EFFECT_FLAG_LABELS[
                          form.flags[idx] as keyof typeof EFFECT_FLAG_LABELS
                        ]
                      "
                      class="text-xs text-muted italic"
                    >
                      {{
                        EFFECT_FLAG_LABELS[
                          form.flags[idx] as keyof typeof EFFECT_FLAG_LABELS
                        ]
                      }}
                    </div>

                    <div
                      v-else-if="form.flags[idx]"
                      class="text-xs text-warning/80 italic"
                    >
                      Кастомный или Неизвестный флаг
                    </div>
                  </div>
                </div>
              </div>

              <!-- Список изменений -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-sm font-medium"
                    >Модификаторы (Changes)</span
                  >

                  <UButton
                    color="primary"
                    variant="ghost"
                    size="xs"
                    icon="tabler:plus"
                    @click.left.exact.prevent="addChange"
                  >
                    Добавить
                  </UButton>
                </div>

                <div
                  v-if="form.changes.length === 0"
                  class="rounded-lg border border-dashed border-default p-4 text-center text-xs text-dimmed italic"
                >
                  Нет активных модификаторов.
                </div>

                <div
                  v-else
                  class="space-y-2 pb-4"
                >
                  <div
                    v-for="(change, idx) in form.changes"
                    :key="idx"
                    class="grid grid-cols-1 items-end gap-2 rounded-lg border border-default bg-elevated/50 p-2 px-3 sm:grid-cols-[200px_140px_1.5fr_2.5fr_70px_auto]"
                  >
                    <UFormField label="Ключ атрибута">
                      <div class="flex w-full gap-1">
                        <UInput
                          v-model="change.key"
                          placeholder="Напр: armorClass"
                          size="sm"
                          class="flex-1 font-mono text-xs"
                        />

                        <UButton
                          color="neutral"
                          variant="soft"
                          icon="tabler:target"
                          size="sm"
                          title="Библиотека ключей"
                          @click.left.exact.prevent="openKeyModal(idx)"
                        />
                      </div>
                    </UFormField>

                    <UFormField label="Режим">
                      <USelect
                        v-model="change.mode"
                        :items="modeOptions"
                        value-key="value"
                        size="sm"
                        class="w-full"
                        :portal="false"
                      />
                    </UFormField>

                    <UFormField label="Значение">
                      <div class="flex w-full gap-1">
                        <UInput
                          v-model="change.value"
                          placeholder="+2, 1к4"
                          size="sm"
                          class="flex-1 font-mono text-xs"
                        />

                        <UButton
                          color="neutral"
                          variant="soft"
                          icon="tabler:bulb"
                          size="sm"
                          title="Библиотека значений"
                          @click.left.exact.prevent="openValueModal(idx)"
                        />
                      </div>
                    </UFormField>

                    <UFormField label="Условие">
                      <div class="flex w-full gap-1">
                        <UInput
                          v-model="change.condition"
                          placeholder="roll.hasAdvantage"
                          size="sm"
                          class="flex-1 font-mono text-xs"
                        />

                        <UButton
                          color="neutral"
                          variant="soft"
                          icon="tabler:bulb"
                          size="sm"
                          title="Шаблоны условий"
                          @click.left.exact.prevent="openTemplateModal(idx)"
                        />
                      </div>
                    </UFormField>

                    <UTooltip text="Приоритет: меньше = раньше (дефолт 20)">
                      <UFormField label="Пр-т">
                        <UInput
                          v-model="change.priority"
                          type="number"
                          placeholder="20"
                          size="sm"
                          class="w-full px-1 text-center"
                        />
                      </UFormField>
                    </UTooltip>

                    <div class="flex h-8 items-center justify-end pb-[2px]">
                      <UButton
                        color="red"
                        variant="soft"
                        icon="tabler:trash"
                        size="sm"
                        title="Удалить модификатор"
                        @click.left.exact.prevent="removeChange(idx)"
                      />
                    </div>

                    <div
                      v-if="String(change.key).startsWith('damage.')"
                      class="text-xs text-muted italic sm:col-span-6"
                    >
                      Кроме плоского числа (+2), можно указать формулу костей —
                      она бросается отдельной частью урона: «2к6», тип через
                      токен «2к6@dmg.fire», условие по цели —
                      «2к6@dmg.fire@target.full» (только при полном HP) или
                      «@target.notFull» (только по раненой).
                    </div>
                  </div>
                </div>

                <!-- Блок с ключами эффектов (целями) удалён согласно UI паттерну -->
              </div>
            </div>
          </template>

          <!-- Вкладка «Дополнительная» -->
          <template #combat>
            <div class="space-y-3">
              <!-- Триггер области/ауры (в редакторе областей или для аур) -->
              <div
                v-if="props.showAreaTrigger || isAura"
                class="rounded-lg border border-muted bg-elevated/30 p-3"
              >
                <UFormField label="Триггер области / ауры">
                  <USelect
                    v-model="areaTriggerModel"
                    :items="areaTriggerOptions"
                    value-key="value"
                    class="w-full"
                    :portal="false"
                  />
                </UFormField>

                <p class="mt-1.5 text-xs text-muted">
                  {{ areaTriggerDescription }}
                </p>
              </div>

              <p class="text-xs text-dimmed italic">
                Срабатывает при наложении эффекта на цель (напр. при попадании
                атакой). Для само-баффов можно оставить пустым.
              </p>

              <!-- Спасбросок при наложении -->
              <div class="rounded-lg border border-muted bg-elevated/30 p-3">
                <UCheckbox
                  v-model="hasApplySave"
                  :ui="{ label: 'font-medium' }"
                  label="Спасбросок при наложении"
                />

                <p class="mt-1.5 text-xs text-muted">
                  При попадании цель совершает спасбросок — от результата
                  зависят статус и урон ниже.
                </p>

                <div
                  v-if="hasApplySave"
                  class="mt-3 grid grid-cols-3 gap-3 border-t border-default/40 pt-3"
                >
                  <UFormField label="Характеристика">
                    <USelect
                      v-model="applySaveAbility"
                      :items="ABILITY_OPTIONS"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>

                  <UFormField label="Сложность (DC)">
                    <UInput
                      v-model.number="applySaveDc"
                      type="number"
                      :min="1"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="При успехе">
                    <USelect
                      v-model="applySaveOnSuccess"
                      :items="onSuccessOptions"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>
                </div>

                <div class="mt-3 border-t border-default/40 pt-3">
                  <UCheckbox
                    v-model="applyOnSuccess"
                    label="Накладывать эффект даже при успешном спасе"
                  />

                  <p class="mt-1.5 text-xs text-muted">
                    Состояние повиснет на цели, даже если она прошла спасбросок
                    (свой выше или спасбросок области у действия). Урон при
                    успехе — по правилу «При успехе».
                  </p>
                </div>
              </div>

              <!-- Урон при наложении -->
              <div
                class="space-y-2 rounded-lg border border-muted bg-elevated/30 p-3"
              >
                <div class="flex items-center gap-2">
                  <UIcon
                    name="tabler:flame"
                    class="size-4 text-warning"
                  />

                  <span class="text-sm font-medium">Урон при наложении</span>
                </div>

                <p class="text-xs text-muted">
                  Наносится цели при наложении. Если включён спасбросок выше —
                  урон гейтится им (на успехе: нет урона либо половина).
                </p>

                <DamagePartsEditor
                  v-model="damagePartsModel"
                  :damage-type-options="damageTypeOptions"
                  :include-spell-modifier="false"
                  :hide-modifiers="true"
                  :hide-healing="true"
                  :hide-conditions="true"
                  :allow-empty="true"
                  add-label="Добавить урон"
                />
              </div>

              <!-- Периодический спасбросок -->
              <div class="rounded-lg border border-muted bg-elevated/30 p-3">
                <UCheckbox
                  v-model="hasRecurringSave"
                  :ui="{ label: 'font-medium' }"
                  label="Периодический спасбросок снимает эффект"
                />

                <p class="mt-1.5 text-xs text-muted">
                  Пока эффект активен, цель повторяет спасбросок и при успехе
                  сбрасывает его досрочно.
                </p>

                <div
                  v-if="hasRecurringSave"
                  class="mt-3 grid grid-cols-3 gap-3 border-t border-default/40 pt-3"
                >
                  <UFormField label="Характеристика">
                    <USelect
                      v-model="recurringAbility"
                      :items="ABILITY_OPTIONS"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>

                  <UFormField label="Сложность (DC)">
                    <UInput
                      v-model.number="recurringDc"
                      type="number"
                      :min="1"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Когда">
                    <USelect
                      v-model="recurringTiming"
                      :items="recurringTimingOptions"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>
                </div>
              </div>

              <!-- Периодический урон (DoT) -->
              <div class="rounded-lg border border-muted bg-elevated/30 p-3">
                <UCheckbox
                  v-model="hasRecurringDamage"
                  :ui="{ label: 'font-medium' }"
                  label="Периодический урон (каждый ход)"
                />

                <p class="mt-1.5 text-xs text-muted">
                  Пока эффект висит на цели, наносит урон каждый ход (напр.
                  «Горение»). Тикает в бою при смене хода.
                </p>

                <div
                  v-if="hasRecurringDamage"
                  class="mt-3 space-y-3 border-t border-default/40 pt-3"
                >
                  <UFormField label="Когда наносится">
                    <USelect
                      v-model="recurringDamageTiming"
                      :items="recurringTimingOptions"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>

                  <DamagePartsEditor
                    v-model="recurringDamageModel"
                    :damage-type-options="damageTypeOptions"
                    :include-spell-modifier="false"
                    :hide-modifiers="true"
                    :hide-healing="true"
                    :hide-conditions="true"
                    :allow-empty="true"
                    add-label="Добавить урон"
                  />
                </div>
              </div>
            </div>
          </template>
        </UTabs>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-3">
        <UButton
          variant="ghost"
          color="neutral"
          @click.left.exact.prevent="handleClose"
          >Отмена</UButton
        >

        <UButton
          color="primary"
          :disabled="!form.name.trim()"
          @click.left.exact.prevent="handleSave"
          >Сохранить</UButton
        >
      </div>
    </template>
  </UDraggableModal>

  <!-- Модальное окно библиотеки шаблонов условий -->
  <ActiveEffectConditionTemplatesModal
    v-model:open="isTemplateModalOpen"
    @select="applyConditionTemplate"
  />

  <!-- Модальное окно библиотеки ключей атрибутов -->
  <ActiveEffectKeyTemplatesModal
    v-model:open="isKeyModalOpen"
    @select="applyKeyTemplate"
  />

  <!-- Модальное окно библиотеки флагов -->
  <ActiveEffectFlagTemplatesModal
    v-model:open="isFlagModalOpen"
    @select="applyFlagTemplate"
  />

  <!-- Модальное окно библиотеки шаблонов значений -->
  <ActiveEffectValueTemplatesModal
    v-model:open="isValueModalOpen"
    @select="applyValueTemplate"
  />
</template>
