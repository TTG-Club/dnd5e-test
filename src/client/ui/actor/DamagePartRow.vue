<script setup lang="ts">
  import type { DamagePart, DamagePartTarget } from '@vtt/shared';

  import { damagePartIsHealing } from '@vtt/shared/system/dnd.js';
  import { computed, nextTick, ref } from 'vue';

  import FormSection from './FormSection.vue';

  const props = withDefaults(
    defineProps<{
      /** Текущая часть урона/лечения */
      modelValue: DamagePart;
      /** Порядковый номер части (для подписи) */
      index: number;
      /** Опции типов урона */
      damageTypeOptions: Array<{ label: string; value: string }>;
      /** Можно ли удалить часть (нельзя удалить единственную) */
      canRemove: boolean;
      /** Показывать кнопку модификатора заклинания (@mod.spell) */
      includeSpellModifier?: boolean;
      /** Показывать поле versatile-формулы (двуручный хват оружия) */
      showVersatile?: boolean;
      /** Скрыть вкладку лечения (@heal) */
      hideHealing?: boolean;
      /** Скрыть вкладку условий (@target) */
      hideConditions?: boolean;
      /**
       * Скрыть вкладку «Добавить мод» целиком. Для оружия мод. характеристики
       * добавляется автоматически — ручные `@mod.*` привели бы к двойному учёту.
       */
      hideModifiers?: boolean;
    }>(),
    {
      includeSpellModifier: true,
      showVersatile: false,
      hideHealing: false,
      hideConditions: false,
      hideModifiers: false,
    },
  );

  const emit = defineEmits<{
    'update:modelValue': [value: DamagePart];
    'remove': [];
  }>();

  /** Опции цели части */
  const TARGET_OPTIONS: Array<{ label: string; value: DamagePartTarget }> = [
    { label: 'Выбранная цель', value: 'selected' },
    { label: 'На себя', value: 'self' },
    { label: 'Указать отдельно', value: 'choose' },
  ];

  /**
   * Хелпер обновления одного поля части с эмитом нового объекта.
   */
  function patch(changes: Partial<DamagePart>): void {
    emit('update:modelValue', { ...props.modelValue, ...changes });
  }

  /** Writable-обёртка над формулой части */
  const formula = computed<string>({
    get: () => props.modelValue.formula,
    set: (value) => patch({ formula: value }),
  });

  /** Writable-обёртка над versatile-формулой части (двуручный хват) */
  const versatileFormula = computed<string>({
    get: () => props.modelValue.versatileFormula ?? '',
    set: (value) => patch({ versatileFormula: value || undefined }),
  });

  /**
   * Лечит ли часть: токен `@heal`/`@heal.temp` в формуле (единственный
   * источник вида части). Управляет видимостью чекбокса «Только если
   * нанесён урон».
   */
  const isHealing = computed<boolean>(() =>
    damagePartIsHealing(props.modelValue),
  );

  /**
   * Ошибка: `@mod.*` в формуле при скрытых модификаторах (оружие). Мод.
   * характеристики уже считается автоматически — ручной токен дал бы двойной
   * учёт и поломку формулы («1к10@mod.str» → «1к103»).
   */
  const modifierTokenError = computed<boolean>(
    () => props.hideModifiers && /@mod\./i.test(props.modelValue.formula),
  );

  const target = computed<DamagePartTarget>({
    get: () => props.modelValue.target ?? 'selected',
    set: (value) => patch({ target: value }),
  });

  const requiresDamage = computed<boolean>({
    get: () => props.modelValue.requiresDamage ?? false,
    set: (value) => patch({ requiresDamage: value || undefined }),
  });

  const inputRef = ref<any>(null);

  /** Вкладки для ввода формулы (лечение/условия скрываются пропами) */
  type DamageTab = {
    label: string;
    slot: 'modifiers' | 'damageTypes' | 'healing' | 'conditions';
  };

  const tabsList = computed<DamageTab[]>(() => {
    const tabs: DamageTab[] = [{ label: 'Тип урона', slot: 'damageTypes' }];

    if (!props.hideModifiers) {
      tabs.unshift({ label: 'Добавить мод', slot: 'modifiers' });
    }

    if (!props.hideHealing) {
      tabs.push({ label: 'Лечение', slot: 'healing' });
    }

    if (!props.hideConditions) {
      tabs.push({ label: 'Условия', slot: 'conditions' });
    }

    return tabs;
  });

  /** Кнопки модификаторов (@mod.spell — только для заклинаний) */
  const modifierButtons = computed(() => {
    const buttons = [];

    if (props.includeSpellModifier) {
      buttons.push({ label: 'Заклинание (@mod.spell)', value: '@mod.spell' });
    }

    buttons.push(
      { label: 'Сила (@mod.str)', value: '@mod.str' },
      { label: 'Ловкость (@mod.dex)', value: '@mod.dex' },
      { label: 'Телосложение (@mod.con)', value: '@mod.con' },
      { label: 'Интеллект (@mod.int)', value: '@mod.int' },
      { label: 'Мудрость (@mod.wis)', value: '@mod.wis' },
      { label: 'Харизма (@mod.cha)', value: '@mod.cha' },
      { label: 'Мастерство (@prof)', value: '@prof' },
      { label: 'Уровень (@level)', value: '@level' },
    );

    return buttons;
  });

  /**
   * Кнопки вида лечения. Токен в формуле помечает своё слагаемое и все
   * последующие без собственного токена: `2к4@heal+@mod.spell` лечит целиком,
   * `@heal.temp` даёт временные ХП (с текущими временными — большее).
   */
  const healingButtons = [
    { label: 'Лечение (@heal)', value: '@heal' },
    { label: 'Временные ХП (@heal.temp)', value: '@heal.temp' },
  ];

  const conditionButtons = [
    { label: 'Полное HP (@target.full)', value: '@target.full' },
    { label: 'Неполное HP (@target.notFull)', value: '@target.notFull' },
  ];

  /** Вставка токена в формулу на текущую позицию курсора */
  function insertText(text: string): void {
    const inputEl = inputRef.value?.$el?.querySelector(
      'input',
    ) as HTMLInputElement | null;

    if (!inputEl) {
      formula.value = (formula.value || '') + text;

      return;
    }

    const start = inputEl.selectionStart ?? formula.value.length;
    const end = inputEl.selectionEnd ?? formula.value.length;
    const original = formula.value || '';

    const newValue =
      original.substring(0, start) + text + original.substring(end);

    formula.value = newValue;

    nextTick(() => {
      inputEl.focus();

      const newCursor = start + text.length;

      inputEl.setSelectionRange(newCursor, newCursor);
    });
  }
</script>

<template>
  <FormSection
    :title="`Часть ${index + 1}`"
    title-color="warning"
  >
    <template #actions>
      <UButton
        v-if="canRemove"
        icon="tabler:trash"
        color="error"
        variant="ghost"
        size="xs"
        aria-label="Удалить часть"
        @click.left.exact.prevent="emit('remove')"
      />
    </template>

    <div class="flex flex-col gap-3">
      <!-- Строка формулы во всю ширину -->
      <UFormField
        label="Формула"
        :error="
          modifierTokenError
            ? 'Убери @mod.* — модификатор характеристики добавляется автоматически'
            : undefined
        "
      >
        <UInput
          ref="inputRef"
          v-model="formula"
          placeholder="8к6"
          :color="modifierTokenError ? 'error' : undefined"
          class="w-full font-mono"
        />
      </UFormField>

      <!-- Versatile-формула (двуручный хват оружия) -->
      <UFormField
        v-if="showVersatile"
        label="Двумя руками (versatile)"
        help="Альтернативная формула при удержании двумя руками (напр. 1к10)"
      >
        <UInput
          v-model="versatileFormula"
          placeholder="1к10"
          class="w-full font-mono"
        />
      </UFormField>

      <!-- Вкладки-помощники ввода формулы -->
      <UTabs
        :items="tabsList"
        variant="link"
        class="w-full"
        :ui="{
          list: 'border-b border-default mb-2',
          trigger: 'justify-center py-1 text-xs',
          content:
            'p-2 bg-elevated/20 rounded-lg border border-default/50 min-h-[60px]',
        }"
      >
        <template #modifiers>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="mod in modifierButtons"
              :key="mod.value"
              :label="mod.label"
              size="xs"
              color="neutral"
              variant="subtle"
              class="cursor-pointer font-medium"
              @click.left.exact.prevent="insertText(mod.value)"
            />
          </div>
        </template>

        <template #damageTypes>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="typeOpt in damageTypeOptions"
              :key="typeOpt.value"
              :label="typeOpt.label"
              size="xs"
              color="neutral"
              variant="subtle"
              class="cursor-pointer font-medium"
              @click.left.exact.prevent="insertText(`@dmg.${typeOpt.value}`)"
            />
          </div>
        </template>

        <template #healing>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="heal in healingButtons"
              :key="heal.value"
              :label="heal.label"
              size="xs"
              color="neutral"
              variant="subtle"
              class="cursor-pointer font-medium"
              @click.left.exact.prevent="insertText(heal.value)"
            />
          </div>
        </template>

        <template #conditions>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="cond in conditionButtons"
              :key="cond.value"
              :label="cond.label"
              size="xs"
              color="neutral"
              variant="subtle"
              class="cursor-pointer font-medium"
              @click.left.exact.prevent="insertText(cond.value)"
            />
          </div>
        </template>
      </UTabs>

      <div class="mt-1 grid grid-cols-2 items-center gap-4">
        <!-- Цель части -->
        <UFormField label="Цель">
          <USelect
            v-model="target"
            :items="TARGET_OPTIONS"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <!-- Только если нанесен урон (лечение) -->
        <div
          v-if="isHealing"
          class="pt-5"
        >
          <UCheckbox
            v-model="requiresDamage"
            label="Только если нанесён урон"
          />
        </div>
      </div>
    </div>
  </FormSection>
</template>
