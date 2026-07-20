<script setup lang="ts">
  import type {
    AbilityType,
    ArmorCategory,
    SkillType,
    TypedWebSocketClient,
  } from '@vtt/shared';
  import type {
    ClassDefinition,
    GameItem,
    GrantedSpellRef,
    HitDie,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type { SpellOption } from '../grantedSpellsEditorTypes';
  import type {
    EditableClassFeature,
    EditableCounter,
    EditableEquipmentOption,
    EditableLevelRow,
    EditableSpellcasting,
    EditableSubclass,
    EditableTableColumn,
  } from './classEditorTypes';

  import { generateId } from '@vtt/shared';
  import { ABILITY_OPTIONS, SKILLS_LIST } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import {
    findSpellInPacks,
    loadSpellPacks,
  } from '@/systems/dnd5e/composables/spellCompendium';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import {
    ARMOR_PROF_LABELS,
    TOOL_PROF_LABELS,
    WEAPON_PROF_LABELS,
  } from '../constants';
  import FormSection from '../FormSection.vue';
  import { slugify } from '../utils/slugify';
  import ClassCountersEditor from './ClassCountersEditor.vue';
  import {
    buildAsiFeatures,
    buildColumns,
    buildCounter,
    buildFeature,
    buildLevelTable,
    buildSpellcasting,
    buildSubclass,
    createEmptyLevelTable,
    createEmptySpellcasting,
    HIT_DIE_OPTIONS,
    isPlainAsiFeature,
    toEditableColumns,
    toEditableCounter,
    toEditableFeature,
    toEditableLevelTable,
    toEditableSpellcasting,
    toEditableSubclass,
  } from './classEditorTypes';
  import ClassFeaturesEditor from './ClassFeaturesEditor.vue';
  import ClassLevelTableEditor from './ClassLevelTableEditor.vue';
  import ClassSpellcastingFields from './ClassSpellcastingFields.vue';
  import ClassSubclassesEditor from './ClassSubclassesEditor.vue';

  const props = defineProps<{
    open: boolean;
    /** Редактируемый класс (null = создание). Всегда плоский ClassDefinition. */
    classDefinition?: ClassDefinition | null;
    /** id исходного GameItem мира при редактировании (для обновления, не дубля) */
    classItemId?: string | null;
    /** Сокет — для загрузки заклинаний компендиума (подсказки связывания). */
    socket?: TypedWebSocketClient | null;
    zIndex?: number;
    positionOffset?: number;
    allowMultiple?: boolean;
    modalId?: string;
    savedPosition?: unknown;
    savedSize?: unknown;
  }>();

  const emit = defineEmits<{
    'close': [];
    'save': [gameClass: GameItem];
    'bring-to-front': [];
  }>();

  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  const systemDataStore = useSystemDataStore();
  const { openModal } = useModalManager();

  // ── Опции селектов ─────────────────────────────────────────
  const sourceOptions = computed(() => [
    { label: 'Свой источник', value: 'local' },
    ...systemDataStore.sources.map((source) => ({
      label: `${source.name} (${source.abbreviation})`,
      value: source.key,
    })),
  ]);

  const armorOptions: { value: ArmorCategory; label: string }[] = [
    { value: 'light', label: ARMOR_PROF_LABELS.light },
    { value: 'medium', label: ARMOR_PROF_LABELS.medium },
    { value: 'heavy', label: ARMOR_PROF_LABELS.heavy },
    { value: 'shield', label: ARMOR_PROF_LABELS.shield },
  ];

  const weaponOptions = Object.entries(WEAPON_PROF_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  const toolOptions = Object.entries(TOOL_PROF_LABELS).map(
    ([value, label]) => ({
      value,
      label,
    }),
  );

  const abilityOptions = ABILITY_OPTIONS.map((ability) => ({
    value: ability.value,
    label: ability.label,
  }));

  const skillOptions = SKILLS_LIST.map((skill) => ({
    value: skill.key,
    label: skill.label,
  }));

  const tabItems = [
    { label: 'Основное', slot: 'basic' as const },
    { label: 'Владения', slot: 'proficiencies' as const },
    { label: 'Заклинания', slot: 'spellcasting' as const },
    { label: 'Прогрессия', slot: 'progression' as const },
    { label: 'Особенности', slot: 'features' as const },
    { label: 'Подклассы', slot: 'subclasses' as const },
    { label: 'Счётчики', slot: 'counters' as const },
    { label: 'Снаряжение', slot: 'equipment' as const },
  ];

  // ── Состояние формы ────────────────────────────────────────
  const name = ref('');
  const nameEn = ref('');
  const description = ref('');
  const icon = ref('');
  const sourceKey = ref('local');
  const isSRD = ref(false);
  const hitDie = ref<HitDie>(8);
  const subclassLevel = ref(3);
  const subclassLabel = ref('Подкласс');

  const armorProficiencies = ref<ArmorCategory[]>([]);
  const weaponProficiencies = ref<string[]>([]);
  const toolProficiencies = ref<string[]>([]);
  const savingThrowProficiencies = ref<AbilityType[]>([]);
  const skillCount = ref(2);
  const skillFrom = ref<SkillType[]>([]);

  const multiclassEnabled = ref(false);
  const multiclassArmor = ref<ArmorCategory[]>([]);
  const multiclassWeapons = ref<string[]>([]);
  const multiclassTools = ref<string[]>([]);
  const multiclassSkillChoices = ref(0);

  const spellcasting = ref<EditableSpellcasting>(createEmptySpellcasting());

  const tableColumns = ref<EditableTableColumn[]>([]);
  const levelTable = ref<EditableLevelRow[]>(createEmptyLevelTable());

  const features = ref<EditableClassFeature[]>([]);
  const subclasses = ref<EditableSubclass[]>([]);
  const counters = ref<EditableCounter[]>([]);
  const equipment = ref<EditableEquipmentOption[]>([]);

  const existingKey = ref<string | null>(null);
  const existingId = ref<string | null>(null);

  /** Заклинания компендиума по пакам (имя, источник, пак) — для подсказок. */
  const availableSpells = ref<SpellOption[]>([]);

  /** Полные заклинания по пакам — для просмотра по клику. */
  const spellPacks = ref<
    { packId: string; packName: string; spells: Spell[] }[]
  >([]);

  const isCaster = computed(() => spellcasting.value.enabled);

  /** Особенности базового класса как опции привязки счётчиков. */
  const featureOptions = computed(() =>
    features.value
      .filter((feature) => feature.name.trim().length > 0)
      .map((feature) => ({ value: feature.key, label: feature.name })),
  );

  // ── Инициализация ──────────────────────────────────────────
  function resetForm(): void {
    name.value = '';
    nameEn.value = '';
    description.value = '';
    icon.value = '';
    sourceKey.value = 'local';
    isSRD.value = false;
    hitDie.value = 8;
    subclassLevel.value = 3;
    subclassLabel.value = 'Подкласс';
    armorProficiencies.value = [];
    weaponProficiencies.value = [];
    toolProficiencies.value = [];
    savingThrowProficiencies.value = [];
    skillCount.value = 2;
    skillFrom.value = [];
    multiclassEnabled.value = false;
    multiclassArmor.value = [];
    multiclassWeapons.value = [];
    multiclassTools.value = [];
    multiclassSkillChoices.value = 0;
    spellcasting.value = createEmptySpellcasting();
    tableColumns.value = [];
    levelTable.value = createEmptyLevelTable();
    features.value = [];
    subclasses.value = [];
    counters.value = [];
    equipment.value = [];
    existingKey.value = null;
    existingId.value = null;
  }

  function hydrateFromDefinition(definition: ClassDefinition): void {
    name.value = definition.name || '';
    nameEn.value = definition.nameEn || '';
    description.value = definition.description || '';
    icon.value = definition.icon || '';
    sourceKey.value = definition.sourceKey || 'local';
    isSRD.value = definition.isSRD ?? false;
    hitDie.value = definition.hitDie;
    subclassLevel.value = definition.subclassLevel;
    subclassLabel.value = definition.subclassLabel;
    existingKey.value = definition.key;

    armorProficiencies.value = [...definition.armorProficiencies];
    weaponProficiencies.value = [...definition.weaponProficiencies];
    toolProficiencies.value = [...(definition.toolProficiencies ?? [])];
    savingThrowProficiencies.value = [...definition.savingThrowProficiencies];
    skillCount.value = definition.skillChoices.count;
    skillFrom.value = [...definition.skillChoices.from];

    spellcasting.value = toEditableSpellcasting(definition.spellcasting);

    tableColumns.value = toEditableColumns(definition.tableColumns);

    // Только «обычные» ASI представляем чекбоксом строки; эпические дары и любые
    // asi-*, имеющие своё название/описание, сохраняем как настоящие особенности.
    const plainAsiKeys = new Set(
      (definition.features ?? [])
        .filter(isPlainAsiFeature)
        .map((feature) => feature.key),
    );

    levelTable.value = toEditableLevelTable(
      definition.levelTable,
      tableColumns.value,
      plainAsiKeys,
    );

    features.value = (definition.features ?? [])
      .filter((feature) => !isPlainAsiFeature(feature))
      .map(toEditableFeature);

    subclasses.value = (definition.subclasses ?? []).map(toEditableSubclass);
    counters.value = (definition.counters ?? []).map(toEditableCounter);

    equipment.value = (definition.startingEquipment ?? []).map((option) => ({
      uid: generateId('eq'),
      key: option.key,
      description: option.description,
    }));

    if (definition.multiclassProficiencies) {
      multiclassEnabled.value = true;
      multiclassArmor.value = [...definition.multiclassProficiencies.armor];
      multiclassWeapons.value = [...definition.multiclassProficiencies.weapons];
      multiclassTools.value = [...definition.multiclassProficiencies.tools];

      multiclassSkillChoices.value =
        definition.multiclassProficiencies.skillChoices;
    }
  }

  /** Загружает заклинания компендиума по пакам и резолвит имена выданных. */
  async function loadAvailableSpells(): Promise<void> {
    if (!props.socket) {
      availableSpells.value = [];
      spellPacks.value = [];

      return;
    }

    const { packs, options } = await loadSpellPacks(props.socket);

    spellPacks.value = packs;
    availableSpells.value = options;
    resolveGrantedNames();
  }

  /** Подставляет человекочитаемые имена выданным заклинаниям (по spellId). */
  function resolveGrantedNames(): void {
    const byId = new Map(
      availableSpells.value.map((option) => [option.id, option]),
    );

    const fix = (refs: GrantedSpellRef[]): void => {
      for (const ref of refs) {
        if (ref.spellId) {
          const option = byId.get(ref.spellId);

          if (option) {
            ref.name = option.name;
          }
        }
      }
    };

    const fixFeature = (feature: EditableClassFeature): void => {
      fix(feature.grantedSpells);

      for (const entry of feature.grantedSpellsByLevel) {
        fix(entry.spells);
      }
    };

    for (const feature of features.value) {
      fixFeature(feature);
    }

    for (const subclass of subclasses.value) {
      for (const feature of subclass.features) {
        fixFeature(feature);
      }
    }
  }

  /** Открывает детальный просмотр заклинания. */
  function openSpellDetail(spellId: string, packId?: string): void {
    const spell = findSpellInPacks(spellPacks.value, spellId, packId);

    if (spell) {
      openModal('SpellDetailModal', { spell });
    }
  }

  watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) {
        return;
      }

      resetForm();

      existingId.value = props.classItemId ?? null;

      if (props.classDefinition) {
        hydrateFromDefinition(props.classDefinition);
      }

      void loadAvailableSpells();
    },
    { immediate: true },
  );

  // ── Снаряжение ─────────────────────────────────────────────
  function addEquipment(): void {
    equipment.value.push({
      uid: generateId('eq'),
      key: String.fromCharCode(65 + equipment.value.length),
      description: '',
    });
  }

  function removeEquipment(index: number): void {
    equipment.value.splice(index, 1);
  }

  // ── Валидация и сохранение ─────────────────────────────────
  const canSave = computed(() => name.value.trim().length > 0);

  function buildDefinition(): ClassDefinition {
    const key =
      existingKey.value
      ?? `${slugify(nameEn.value || name.value) || 'class'}-${
        generateId('w').split('_')[2] ?? 'x'
      }`;

    const baseFeatures = features.value
      .filter((feature) => feature.name.trim().length > 0)
      .map((feature) => buildFeature(feature));

    const asiFeatures = buildAsiFeatures(levelTable.value, baseFeatures);

    const definition: ClassDefinition = {
      type: 'class',
      key,
      name: name.value.trim(),
      nameEn: nameEn.value.trim() || name.value.trim(),
      description: description.value.trim(),
      icon: icon.value.trim() || undefined,
      sourceKey: sourceKey.value,
      isSRD: isSRD.value,
      hitDie: hitDie.value,
      armorProficiencies: [...armorProficiencies.value],
      weaponProficiencies: [...weaponProficiencies.value],
      savingThrowProficiencies: [...savingThrowProficiencies.value],
      skillChoices: {
        count: skillCount.value,
        from: [...skillFrom.value],
      },
      spellcasting: buildSpellcasting(spellcasting.value),
      subclassLevel: subclassLevel.value,
      subclassLabel: subclassLabel.value.trim() || 'Подкласс',
      subclasses: subclasses.value
        .filter((subclass) => subclass.name.trim().length > 0)
        .map(buildSubclass),
      features: [...baseFeatures, ...asiFeatures],
      levelTable: buildLevelTable(
        levelTable.value,
        features.value,
        tableColumns.value,
      ),
    };

    if (toolProficiencies.value.length > 0) {
      definition.toolProficiencies = [...toolProficiencies.value];
    }

    const columns = buildColumns(tableColumns.value);

    if (columns.length > 0) {
      definition.tableColumns = columns;
    }

    const builtCounters = counters.value
      .filter((counter) => counter.name.trim().length > 0)
      .map((counter) => buildCounter(counter));

    if (builtCounters.length > 0) {
      definition.counters = builtCounters;
    }

    const builtEquipment = equipment.value
      .filter((option) => option.key.trim().length > 0)
      .map((option) => ({
        key: option.key.trim(),
        description: option.description.trim(),
      }));

    if (builtEquipment.length > 0) {
      definition.startingEquipment = builtEquipment;
    }

    if (multiclassEnabled.value) {
      definition.multiclassProficiencies = {
        armor: [...multiclassArmor.value],
        weapons: [...multiclassWeapons.value],
        tools: [...multiclassTools.value],
        skillChoices: multiclassSkillChoices.value,
      };
    }

    return definition;
  }

  function handleSave(): void {
    if (!canSave.value) {
      return;
    }

    const definition = buildDefinition();

    const gameItem: GameItem = {
      id: existingId.value ?? `item_${generateId('class')}`,
      type: 'class',
      name: definition.name,
      nameEn: definition.nameEn,
      description: definition.description ?? '',
      sourceKey: sourceKey.value,
      isSRD: isSRD.value,
      image: icon.value.trim() || undefined,
      quantity: 1,
      weight: 0,
      cost: '',
      rarity: 'common',
      equipped: false,
      isReadOnly: false,
      classData: definition,
    };

    emit('save', gameItem);
    emit('close');
  }

  function handleOpenChange(value: boolean): void {
    if (!value) {
      emit('close');
    }
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="classDefinition ? 'Редактировать класс' : 'Создать класс'"
    :subtitle="nameEn || undefined"
    :initial-width="900"
    :min-width="640"
    :resizable="true"
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
          list: 'mb-3 flex-wrap',
          trigger: 'justify-center',
          content: 'overflow-y-auto max-h-[640px]',
        }"
      >
        <!-- ОСНОВНОЕ -->
        <template #basic>
          <div class="flex flex-col gap-4">
            <FormSection
              title="Общая информация"
              title-color="healing"
            >
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Название">
                  <UInput
                    v-model="name"
                    placeholder="Воин"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Английское название">
                  <UInput
                    v-model="nameEn"
                    placeholder="Fighter"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Кость хитов">
                  <USelect
                    v-model="hitDie"
                    :items="HIT_DIE_OPTIONS"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Источник">
                  <USelect
                    v-model="sourceKey"
                    :items="sourceOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Уровень выбора подкласса">
                  <UInputNumber
                    v-model="subclassLevel"
                    :min="1"
                    :max="20"
                  />
                </UFormField>

                <UFormField label="Название группы подклассов">
                  <UInput
                    v-model="subclassLabel"
                    placeholder="Воинский архетип"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Иконка (tabler:...)">
                  <UInput
                    v-model="icon"
                    placeholder="tabler:sword"
                    class="w-full"
                  />
                </UFormField>

                <div class="flex items-center">
                  <UCheckbox
                    v-model="isSRD"
                    label="SRD контент"
                  />
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Описание (Markdown)"
              title-color="healing"
            >
              <RichTextEditor v-model="description" />
            </FormSection>
          </div>
        </template>

        <!-- ВЛАДЕНИЯ -->
        <template #proficiencies>
          <div class="flex flex-col gap-4">
            <FormSection
              title="Стартовые владения (первый класс)"
              title-color="healing"
            >
              <div class="flex flex-col gap-3">
                <UFormField label="Доспехи">
                  <USelectMenu
                    v-model="armorProficiencies"
                    :items="armorOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Владение доспехами..."
                  />
                </UFormField>

                <UFormField label="Оружие">
                  <USelectMenu
                    v-model="weaponProficiencies"
                    :items="weaponOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Владение оружием..."
                  />
                </UFormField>

                <UFormField label="Инструменты">
                  <USelectMenu
                    v-model="toolProficiencies"
                    :items="toolOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Владение инструментами..."
                  />
                </UFormField>

                <UFormField label="Спасброски">
                  <USelectMenu
                    v-model="savingThrowProficiencies"
                    :items="abilityOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Характеристики..."
                  />
                </UFormField>
              </div>
            </FormSection>

            <FormSection
              title="Выбор навыков"
              title-color="healing"
            >
              <div class="flex items-start gap-3">
                <UFormField
                  label="Кол-во"
                  class="w-1/4"
                >
                  <UInputNumber
                    v-model="skillCount"
                    :min="0"
                    :max="6"
                  />
                </UFormField>

                <UFormField
                  label="Из набора"
                  class="flex-1"
                >
                  <USelectMenu
                    v-model="skillFrom"
                    :items="skillOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Доступные навыки..."
                  />
                </UFormField>
              </div>
            </FormSection>

            <FormSection
              title="Мультикласс (сокращённые владения)"
              title-color="healing"
            >
              <UCheckbox
                v-model="multiclassEnabled"
                label="Задать владения при взятии класса мультиклассом"
              />

              <div
                v-if="multiclassEnabled"
                class="mt-3 flex flex-col gap-3"
              >
                <UFormField label="Доспехи">
                  <USelectMenu
                    v-model="multiclassArmor"
                    :items="armorOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Оружие">
                  <USelectMenu
                    v-model="multiclassWeapons"
                    :items="weaponOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Инструменты">
                  <USelectMenu
                    v-model="multiclassTools"
                    :items="toolOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                  />
                </UFormField>

                <UFormField
                  label="Навыков на выбор"
                  class="w-1/3"
                >
                  <UInputNumber
                    v-model="multiclassSkillChoices"
                    :min="0"
                    :max="4"
                  />
                </UFormField>
              </div>
            </FormSection>
          </div>
        </template>

        <!-- ЗАКЛИНАНИЯ -->
        <template #spellcasting>
          <FormSection
            title="Заклинательная способность класса"
            title-color="healing"
          >
            <ClassSpellcastingFields v-model="spellcasting" />
          </FormSection>
        </template>

        <!-- ПРОГРЕССИЯ -->
        <template #progression>
          <ClassLevelTableEditor
            v-model:rows="levelTable"
            v-model:columns="tableColumns"
            :features="features"
            :is-caster="isCaster"
          />
        </template>

        <!-- ОСОБЕННОСТИ -->
        <template #features>
          <ClassFeaturesEditor
            v-model="features"
            :available-spells="availableSpells"
            @open-spell="openSpellDetail"
          />
        </template>

        <!-- ПОДКЛАССЫ -->
        <template #subclasses>
          <ClassSubclassesEditor
            v-model="subclasses"
            :available-spells="availableSpells"
            :subclass-level="subclassLevel"
            @open-spell="openSpellDetail"
          />
        </template>

        <!-- СЧЁТЧИКИ -->
        <template #counters>
          <ClassCountersEditor
            v-model="counters"
            :feature-options="featureOptions"
          />
        </template>

        <!-- СНАРЯЖЕНИЕ -->
        <template #equipment>
          <div class="flex flex-col gap-2">
            <p class="text-xs text-dimmed">
              Варианты стартового снаряжения (описание текстом — мастер не
              выдаёт предметы автоматически).
            </p>

            <div
              v-for="(option, optionIndex) in equipment"
              :key="option.uid"
              class="flex items-start gap-2 rounded-md border border-default bg-elevated/30 p-2"
            >
              <UInput
                v-model="option.key"
                placeholder="A"
                class="w-[70px]"
              />

              <UTextarea
                v-model="option.description"
                :rows="2"
                autoresize
                placeholder="кольчуга, длинный меч, набор исследователя…"
                class="flex-1"
              />

              <UButton
                icon="tabler:trash"
                color="error"
                variant="ghost"
                size="xs"
                aria-label="Удалить вариант"
                @click.left.exact.prevent="removeEquipment(optionIndex)"
              />
            </div>

            <UButton
              icon="tabler:plus"
              label="Добавить вариант"
              color="primary"
              variant="soft"
              size="xs"
              class="self-start"
              @click.left.exact.prevent="addEquipment"
            />
          </div>
        </template>
      </UTabs>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <span
          v-if="!canSave"
          class="text-xs text-dimmed"
        >
          Укажите название класса
        </span>

        <div class="ml-auto flex gap-3">
          <UButton
            label="Отмена"
            color="neutral"
            variant="ghost"
            @click.left.exact.prevent="emit('close')"
          />

          <UButton
            :label="classDefinition ? 'Сохранить' : 'Создать'"
            color="primary"
            :disabled="!canSave"
            @click.left.exact.prevent="handleSave"
          />
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
