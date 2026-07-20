<script setup lang="ts">
  import type {
    DamagePart,
    DistanceUnit,
    SpellAreaShape,
    SpellSaveType,
  } from '@vtt/shared';
  import type { ActiveEffect, CreatureAction } from '@vtt/shared/system/dnd.js';

  import { DISTANCE_UNIT_OPTIONS } from '@vtt/shared';
  import {
    AREA_SHAPE_OPTIONS,
    areaShapeUsesHeight,
    areaShapeUsesWidth,
    buildActionDescription,
    getActionDescriptionMarkdown,
    getAreaSizeLabel,
    SAVE_EFFECT_OPTIONS,
    SAVE_TYPE_OPTIONS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, reactive, watch } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import DamagePartsEditor from '../actor/DamagePartsEditor.vue';

  type ActionMode = 'trait' | 'action';

  interface Props {
    open: boolean;
    /** Редактируемое действие/черта (null = создание) */
    action?: CreatureAction;
    /** Режим: черта (trait) или действие (action) */
    mode: ActionMode;
    /** Индекс в массиве (для обновления) */
    index?: number;
    zIndex?: number;
    modalId?: string;
    savedPosition?: { x: number; y: number };
    savedSize?: { width: number; height: number };
  }

  const props = withDefaults(defineProps<Props>(), {
    action: undefined,
    index: -1,
    zIndex: undefined,
    modalId: undefined,
    savedPosition: undefined,
    savedSize: undefined,
  });

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'save': [action: CreatureAction, index: number];
    'bring-to-front': [];
  }>();

  const systemDataStore = useSystemDataStore();
  const { openModal } = useModalManager();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  /** Заголовок модалки */
  const modalTitle = computed(() => {
    const isEditing = !!props.action?.name;
    const typeLabel = props.mode === 'trait' ? 'Черта' : 'Действие';

    return isEditing
      ? `Редактирование: ${props.action!.name}`
      : `Новая ${typeLabel === 'Черта' ? 'черта' : 'действие'}`;
  });

  // ── Локальная форма ────────────────────────────────────────────────────────

  const form = reactive<{
    name: string;
    nameEn: string;
    description: string;
    attackBonus: number | null;
    damageParts: DamagePart[];
    saveType: SpellSaveType;
    saveDC: number | null;
    saveEffect: 'half' | 'none' | 'special';
    useArea: boolean;
    areaShape: SpellAreaShape;
    areaSize: number;
    areaWidth: number;
    areaHeight: number;
    areaUnit: DistanceUnit;
    areaResizable: boolean;
    reach: number;
    rangeNormal: number;
    rangeLong: number;
    distanceUnit: DistanceUnit;
    rangeType: 'melee' | 'ranged';
    activeEffects: ActiveEffect[];
  }>({
    name: '',
    nameEn: '',
    description: '',
    attackBonus: null,
    damageParts: [],
    saveType: 'none',
    saveDC: null,
    saveEffect: 'half',
    useArea: false,
    areaShape: 'cone',
    areaSize: 15,
    areaWidth: 5,
    areaHeight: 0,
    areaUnit: 'ft',
    areaResizable: false,
    reach: 5,
    rangeNormal: 0,
    rangeLong: 0,
    distanceUnit: 'ft',
    rangeType: 'melee',
    activeEffects: [],
  });

  /** Есть ли боевые параметры (только у действий) */
  const hasCombatFields = computed(() => props.mode === 'action');

  /** Вкладки формы (боевые параметры — только у действий) */
  const tabItems = computed(() => {
    const items: Array<{ label: string; slot: string }> = [
      { label: 'Основное', slot: 'general' },
    ];

    if (hasCombatFields.value) {
      items.push({ label: 'Боевые параметры', slot: 'combat' });
    }

    items.push({ label: 'Эффекты', slot: 'effects' });

    return items;
  });

  /** Есть ли спасбросок (заменяет бросок попадания) */
  const hasSave = computed(() => form.saveType !== 'none');

  /** Опции типа урона из системных данных (для DamagePartsEditor) */
  const damageTypeOptions = computed(() =>
    systemDataStore.damageTypes.map((damageTypeEntry) => ({
      label: damageTypeEntry.name,
      value: damageTypeEntry.key,
    })),
  );

  /** Дальнобойная дистанция активна только для ranged-типа */
  const isRangeEnabled = computed(() => form.rangeType === 'ranged');

  /** Подпись поля основного размера области (радиус либо размер стороны) */
  const areaSizeLabel = computed(() => getAreaSizeLabel(form.areaShape));

  /** Нужно ли поле ширины для текущей формы области */
  const showAreaWidth = computed(() => areaShapeUsesWidth(form.areaShape));

  /** Нужно ли поле высоты для текущей формы области */
  const showAreaHeight = computed(() => areaShapeUsesHeight(form.areaShape));

  /**
   * Формула урона невалидна: содержит `@mod.*`/`@prof`/`@level` — у существ
   * модификатор уже вшит в формулу (плоское число), @-переменные не нужны и
   * сломали бы бросок. Блокирует сохранение.
   */
  const damageFormulaInvalid = computed(() =>
    form.damageParts.some((part) =>
      /@(?:mod\.|prof|level)/i.test(part.formula),
    ),
  );

  // ── Инициализация формы ────────────────────────────────────────────────────

  watch(
    () => props.open,
    (opened) => {
      if (!opened) {
        return;
      }

      const action = props.action;

      if (action) {
        form.name = action.name;
        form.nameEn = action.nameEn ?? '';
        form.description = getActionDescriptionMarkdown(action);
        form.attackBonus = action.attackBonus ?? null;

        form.damageParts = (action.damageParts ?? []).map((part) => ({
          ...part,
        }));

        form.saveType = action.saveType ?? 'none';
        form.saveDC = action.saveDC ?? null;
        form.saveEffect = action.saveEffect ?? 'half';

        form.useArea = !!action.areaOfEffect;
        form.areaShape = action.areaOfEffect?.shape ?? 'cone';
        form.areaSize = action.areaOfEffect?.size ?? 15;
        form.areaWidth = action.areaOfEffect?.width ?? 5;
        form.areaHeight = action.areaOfEffect?.height ?? 0;
        form.areaUnit = action.areaOfEffect?.unit ?? 'ft';
        form.areaResizable = action.areaOfEffect?.resizable ?? false;

        form.reach = action.reach ?? 5;
        form.rangeNormal = action.range?.normal ?? 0;
        form.rangeLong = action.range?.long ?? 0;
        form.distanceUnit = action.distanceUnit ?? 'ft';
        form.rangeType = action.rangeType ?? 'melee';

        form.activeEffects = action.activeEffects
          ? action.activeEffects.map((effect) => ({ ...effect }))
          : [];
      } else {
        form.name = '';
        form.nameEn = '';
        form.description = '';
        form.attackBonus = null;
        form.damageParts = [];
        form.saveType = 'none';
        form.saveDC = null;
        form.saveEffect = 'half';
        form.useArea = false;
        form.areaShape = 'cone';
        form.areaSize = 15;
        form.areaWidth = 5;
        form.areaHeight = 0;
        form.areaUnit = 'ft';
        form.areaResizable = false;
        form.reach = 5;
        form.rangeNormal = 0;
        form.rangeLong = 0;
        form.distanceUnit = 'ft';
        form.rangeType = 'melee';
        form.activeEffects = [];
      }
    },
    { immediate: true },
  );

  // ── Управление эффектами ───────────────────────────────────────────────────

  /**
   * Открывает ActiveEffectFormModal для создания или редактирования эффекта
   * @param effectIndex - индекс эффекта для редактирования (-1 = создание)
   */
  function openEffectEditor(effectIndex: number): void {
    const existingEffect =
      effectIndex >= 0 ? form.activeEffects[effectIndex] : undefined;

    openModal('ActiveEffectFormModal', {
      effect: existingEffect,
      hideAura: true,
      onSave: (savedEffect: ActiveEffect) => {
        if (effectIndex >= 0) {
          form.activeEffects[effectIndex] = savedEffect;
        } else {
          form.activeEffects.push(savedEffect);
        }
      },
    });
  }

  /**
   * Удаляет эффект по индексу
   * @param effectIndex - индекс эффекта
   */
  function removeEffect(effectIndex: number): void {
    form.activeEffects.splice(effectIndex, 1);
  }

  /**
   * Включает/выключает эффект (не удаляя его)
   * @param effectIndex - индекс эффекта
   */
  function toggleEffect(effectIndex: number): void {
    const effect = form.activeEffects[effectIndex];

    if (effect) {
      effect.disabled = !effect.disabled;
    }
  }

  // ── Сохранение ─────────────────────────────────────────────────────────────

  /** Собирает CreatureAction из формы (чистый JSON: пустые значения не пишутся) */
  function buildAction(): CreatureAction {
    const result: CreatureAction = {
      name: form.name.trim(),
      description: buildActionDescription(form.description),
    };

    if (form.nameEn.trim()) {
      result.nameEn = form.nameEn.trim();
    }

    if (hasCombatFields.value) {
      const cleanedParts = form.damageParts
        .filter((part) => part.formula.trim().length > 0)
        .map((part) => ({ ...part }));

      if (cleanedParts.length > 0) {
        result.damageParts = cleanedParts;
      }

      // Спасбросок ЗАМЕНЯЕТ бросок попадания: при наличии спаса бонус атаки
      // не пишется (как у оружия со спасброском).
      if (hasSave.value) {
        result.saveType = form.saveType;

        if (form.saveDC !== null) {
          result.saveDC = form.saveDC;
        }

        result.saveEffect = form.saveEffect;
      } else if (form.attackBonus !== null) {
        result.attackBonus = form.attackBonus;
      }

      if (form.useArea) {
        result.areaOfEffect = {
          shape: form.areaShape,
          size: form.areaSize,
          unit: form.areaUnit,
        };

        if (areaShapeUsesWidth(form.areaShape)) {
          result.areaOfEffect.width = form.areaWidth;
        }

        if (areaShapeUsesHeight(form.areaShape)) {
          result.areaOfEffect.height = form.areaHeight;
        }

        if (form.areaResizable) {
          result.areaOfEffect.resizable = true;
        }
      }

      result.rangeType = form.rangeType;
      result.distanceUnit = form.distanceUnit;

      if (form.rangeType === 'melee') {
        result.reach = form.reach;
      } else if (form.rangeNormal > 0) {
        result.range = { normal: form.rangeNormal };

        if (form.rangeLong > 0) {
          result.range.long = form.rangeLong;
        }
      }
    }

    if (form.activeEffects.length > 0) {
      result.activeEffects = form.activeEffects.map((effect) => ({
        ...effect,
      }));
    }

    return result;
  }

  /** Сохраняет действие/черту */
  function handleSave(): void {
    if (!form.name.trim() || damageFormulaInvalid.value) {
      return;
    }

    const action = buildAction();

    emit('save', action, props.index);
    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :title="modalTitle"
    :initial-width="600"
    :initial-height="600"
    :min-width="420"
    :min-height="300"
    :z-index="zIndex"
    :modal-id="modalId"
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
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Название">
                  <UInput
                    v-model="form.name"
                    placeholder="Название действия или черты"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Английское название">
                  <UInput
                    v-model="form.nameEn"
                    placeholder="Multiattack"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <UFormField label="Описание">
                <RichTextEditor
                  v-model="form.description"
                  placeholder="Описание..."
                />
              </UFormField>
            </div>
          </template>

          <!-- Вкладка «Боевые параметры» (только у действий) -->
          <template #combat>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Тип атаки">
                  <USelect
                    v-model="form.rangeType"
                    :items="[
                      { label: 'Ближний бой', value: 'melee' },
                      { label: 'Дальний бой', value: 'ranged' },
                    ]"
                    value-key="value"
                    class="w-full"
                    :portal="false"
                  />
                </UFormField>

                <UFormField
                  v-if="!hasSave"
                  label="+ к попаданию"
                >
                  <UInput
                    v-model="form.attackBonus"
                    type="number"
                    placeholder="+5"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <!-- Урон (единая со заклинаниями и оружием система частей) -->
              <div class="space-y-2">
                <span class="text-xs font-semibold tracking-wide text-warning">
                  Урон / лечение
                </span>

                <p class="text-xs text-muted">
                  Указывайте плоские формулы (модификатор уже вшит, напр. «1к8 +
                  3»). Тип урона, лечение и условия — токенами в формуле.
                </p>

                <DamagePartsEditor
                  v-model="form.damageParts"
                  :damage-type-options="damageTypeOptions"
                  :include-spell-modifier="false"
                  :hide-modifiers="true"
                  :allow-empty="true"
                />
              </div>

              <!-- Спасбросок (заменяет бросок попадания) -->
              <div
                class="space-y-2 rounded-lg border border-muted/60 bg-elevated/20 p-3"
              >
                <span class="text-xs font-semibold tracking-wide text-error">
                  Спасбросок
                </span>

                <div class="grid grid-cols-3 gap-3">
                  <UFormField label="Тип">
                    <USelect
                      v-model="form.saveType"
                      :items="SAVE_TYPE_OPTIONS"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>

                  <UFormField
                    v-if="hasSave"
                    label="Сложность (DC)"
                  >
                    <UInput
                      v-model.number="form.saveDC"
                      type="number"
                      :min="1"
                      placeholder="15"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    v-if="hasSave"
                    label="При успехе"
                  >
                    <USelect
                      v-model="form.saveEffect"
                      :items="SAVE_EFFECT_OPTIONS"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>
                </div>
              </div>

              <!-- Область действия (дыхательное оружие и т.п.) -->
              <div
                class="space-y-2 rounded-lg border border-muted/60 bg-elevated/20 p-3"
              >
                <UCheckbox
                  v-model="form.useArea"
                  label="Область действия (шаблон)"
                />

                <div
                  v-if="form.useArea"
                  class="grid grid-cols-3 gap-3"
                >
                  <UFormField label="Форма">
                    <USelect
                      v-model="form.areaShape"
                      :items="AREA_SHAPE_OPTIONS"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>

                  <UFormField :label="areaSizeLabel">
                    <UInput
                      v-model.number="form.areaSize"
                      type="number"
                      :min="0"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Ед.">
                    <USelect
                      v-model="form.areaUnit"
                      :items="DISTANCE_UNIT_OPTIONS"
                      value-key="value"
                      class="w-full"
                      :portal="false"
                    />
                  </UFormField>

                  <UFormField
                    v-if="showAreaWidth"
                    label="Ширина"
                  >
                    <UInput
                      v-model.number="form.areaWidth"
                      type="number"
                      :min="0"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    v-if="showAreaHeight"
                    label="Высота"
                  >
                    <UInput
                      v-model.number="form.areaHeight"
                      type="number"
                      :min="0"
                      class="w-full"
                    />
                  </UFormField>

                  <div class="col-span-3">
                    <UCheckbox
                      v-model="form.areaResizable"
                      label="Размер можно менять при размещении"
                    />
                  </div>
                </div>
              </div>

              <!-- Дистанция -->
              <div
                class="rounded-lg border border-muted/60 bg-elevated/20 px-3 pt-1 pb-3"
              >
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs font-semibold tracking-wide text-gold">
                    Дистанция
                  </span>

                  <USelect
                    v-model="form.distanceUnit"
                    :items="DISTANCE_UNIT_OPTIONS"
                    value-key="value"
                    size="xs"
                    class="w-36"
                    :portal="false"
                  />
                </div>

                <div class="grid grid-cols-3 gap-3">
                  <!-- Досягаемость -->
                  <UFormField label="Досягаемость">
                    <UInput
                      v-model.number="form.reach"
                      type="number"
                      :min="5"
                      :step="5"
                      class="w-full"
                    />
                  </UFormField>

                  <!-- Нормальная -->
                  <UFormField label="Нормальная">
                    <UInput
                      v-model.number="form.rangeNormal"
                      type="number"
                      :min="0"
                      :disabled="!isRangeEnabled"
                      class="w-full"
                    />
                  </UFormField>

                  <!-- Максимальная -->
                  <UFormField label="Максимальная">
                    <UInput
                      v-model.number="form.rangeLong"
                      type="number"
                      :min="0"
                      :disabled="!isRangeEnabled"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </div>
          </template>

          <!-- Вкладка «Эффекты» -->
          <template #effects>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span
                  class="text-xs font-semibold tracking-wider text-muted uppercase"
                >
                  Активные эффекты
                </span>

                <UButton
                  color="primary"
                  variant="ghost"
                  size="xs"
                  icon="tabler:plus"
                  @click.left.exact.prevent="openEffectEditor(-1)"
                >
                  Добавить
                </UButton>
              </div>

              <div
                v-if="form.activeEffects.length === 0"
                class="rounded-lg border border-dashed border-default p-4 text-center text-xs text-dimmed italic"
              >
                Нет активных эффектов. Эффекты применяются при активации черты
                или попадании атакой.
              </div>

              <div
                v-else
                class="space-y-1"
              >
                <div
                  v-for="(effect, effectIndex) in form.activeEffects"
                  :key="effect.id"
                  class="flex items-center gap-2 rounded-lg border border-default/50 bg-elevated/30 px-3 py-2"
                  :class="{ 'opacity-50 grayscale': effect.disabled }"
                >
                  <UIcon
                    :name="effect.icon || 'tabler:sparkles'"
                    class="size-4 shrink-0 text-primary"
                  />

                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium text-toned">
                      {{ effect.name }}
                    </div>

                    <div
                      v-if="
                        effect.changes.length > 0 || effect.flags.length > 0
                      "
                      class="text-xs text-dimmed"
                    >
                      {{ effect.changes.length }} модификатор{{
                        effect.changes.length !== 1 ? 'а/ов' : ''
                      }}, {{ effect.flags.length }} флаг{{
                        effect.flags.length !== 1 ? 'а/ов' : ''
                      }}
                    </div>
                  </div>

                  <USwitch
                    :model-value="!effect.disabled"
                    size="sm"
                    :title="effect.disabled ? 'Включить' : 'Выключить'"
                    @update:model-value="toggleEffect(effectIndex)"
                  />

                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="tabler:edit"
                    size="xs"
                    title="Редактировать эффект"
                    @click.left.exact.prevent="openEffectEditor(effectIndex)"
                  />

                  <UButton
                    color="error"
                    variant="ghost"
                    icon="tabler:trash"
                    size="xs"
                    title="Удалить эффект"
                    @click.left.exact.prevent="removeEffect(effectIndex)"
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
          @click.left.exact.prevent="isOpen = false"
        >
          Отмена
        </UButton>

        <UButton
          color="primary"
          :disabled="!form.name.trim() || damageFormulaInvalid"
          @click.left.exact.prevent="handleSave"
        >
          Сохранить
        </UButton>
      </div>
    </template>
  </UDraggableModal>
</template>
