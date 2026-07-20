<script setup lang="ts">
  import type {
    AbilityType,
    SkillType,
    TypedWebSocketClient,
  } from '@vtt/shared';
  import type {
    ConditionKey,
    CreatureSize,
    CreatureType,
    DamageDefenseEntry,
    GameItem,
    SpeciesDefinition,
    SpeciesFeature,
    SpeciesGrant,
    SpeciesMovementGrant,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type { SpellOption } from '../grantedSpellsEditorTypes';
  import type {
    EditableChoice,
    EditableFeature,
    EditableFeatureFields,
  } from './speciesEditorTypes';

  import { generateId, typedObjectEntries } from '@vtt/shared';
  import {
    ABILITY_OPTIONS,
    CONDITIONS,
    CREATURE_SIZE_LABELS,
    CREATURE_TYPE_LABELS,
    LANGUAGE_TYPES,
    SKILLS_LIST,
    TOOLS_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import {
    buildSpellLinkIndex,
    findSpellInPacks,
    linkGrantedSpellRefs,
    loadSpellPacks,
  } from '@/systems/dnd5e/composables/spellCompendium';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import { ARMOR_PROF_LABELS, WEAPON_PROF_LABELS } from '../constants';
  import FormSection from '../FormSection.vue';
  import { slugify } from '../utils/slugify';
  import DamageDefenseEditor from './DamageDefenseEditor.vue';
  import { createEmptyMovement, MOVEMENT_AXES } from './speciesEditorTypes';
  import SpeciesFeatureFields from './SpeciesFeatureFields.vue';

  // Два корневых узла (форма + попап-редактор узла) — отключаем проброс атрибутов.
  defineOptions({ inheritAttrs: false });

  const props = defineProps<{
    open: boolean;
    /** Редактируемый вид (null = создание). Всегда плоский SpeciesDefinition. */
    speciesDefinition?: SpeciesDefinition | null;
    /** id исходного GameItem мира при редактировании (для обновления, не дубля) */
    speciesItemId?: string | null;
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
    'save': [species: GameItem];
    'bring-to-front': [];
  }>();

  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  // ============================================================
  // Опции для селектов
  // ============================================================
  const creatureTypeOptions = typedObjectEntries(CREATURE_TYPE_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  const sizeOptions = typedObjectEntries(CREATURE_SIZE_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  const skillsOptions = SKILLS_LIST.map((skill) => ({
    value: skill.key,
    label: skill.label,
  }));

  const abilitiesOptions = ABILITY_OPTIONS.map((ability) => ({
    value: ability.value,
    label: ability.label,
  }));

  const armorOptions = Object.entries(ARMOR_PROF_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  const weaponOptions = Object.entries(WEAPON_PROF_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  const toolsOptions = Object.entries(TOOLS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const languageOptions = LANGUAGE_TYPES.map((language) => ({
    value: language,
    label: language,
  }));

  const conditionOptions = CONDITIONS.map((condition) => ({
    value: condition.key,
    label: condition.nameRu,
  }));

  const tabItems = [
    { label: 'Основное', slot: 'basic' as const },
    { label: 'Движение', slot: 'movement' as const },
    { label: 'Дары', slot: 'grants' as const },
    { label: 'Особенности', slot: 'features' as const },
  ];

  const systemDataStore = useSystemDataStore();
  const { openModal } = useModalManager();

  const sourceOptions = computed(() => [
    { label: 'Свой источник', value: 'local' },
    ...systemDataStore.sources.map((source) => ({
      label: `${source.name} (${source.abbreviation})`,
      value: source.key,
    })),
  ]);

  // ============================================================
  // Состояние формы
  // ============================================================
  const name = ref('');
  const nameEn = ref('');
  const description = ref('');
  const icon = ref('');
  const sourceKey = ref('local');
  const isSRD = ref(false);
  const creatureType = ref<CreatureType>('humanoid');
  const selectedSizes = ref<CreatureSize[]>(['medium']);

  const speedWalk = ref(30);
  const speedFly = ref(0);
  const speedSwim = ref(0);
  const speedClimb = ref(0);
  const speedBurrow = ref(0);

  // Дары (уровень 1, фиксированные для вида)
  const darkvisionRange = ref(0);
  const skillCount = ref(0);
  const skillFrom = ref<SkillType[]>([]);
  const savingThrows = ref<AbilityType[]>([]);
  const damageDefenses = ref<DamageDefenseEntry[]>([]);
  const conditionImmunities = ref<ConditionKey[]>([]);

  const armorFixed = ref<string[]>([]);
  const armorChoiceCount = ref(0);
  const armorChoiceFrom = ref<string[]>([]);

  const weaponFixed = ref<string[]>([]);
  const weaponChoiceCount = ref(0);
  const weaponChoiceFrom = ref<string[]>([]);

  const toolFixed = ref<string[]>([]);
  const toolChoiceCount = ref(0);
  const toolChoiceFrom = ref<string[]>([]);

  const languageFixed = ref<string[]>([]);
  const languageChoiceCount = ref(0);
  const languageChoiceFrom = ref<string[]>([]);

  /**
   * Дары будущих/неотображаемых типов, которые форма не редактирует, но обязана
   * сохранить при редактировании, чтобы не потерять (страховка совместимости).
   */
  const preservedGrants = ref<SpeciesGrant[]>([]);

  // Особенности
  const features = ref<EditableFeature[]>([]);

  /** Заклинания компендиума по пакам (имя, источник, пак) — для подсказок. */
  const availableSpells = ref<SpellOption[]>([]);

  /** Полные заклинания по пакам — для просмотра по клику (открыть карточку). */
  const spellPacks = ref<
    { packId: string; packName: string; spells: Spell[] }[]
  >([]);

  /** Тип узла дерева особенностей. */
  type SpeciesNodeKind = 'feature' | 'choice' | 'choiceFeature';

  // Попап-редактор выбранного узла дерева особенностей
  const isNodeEditorOpen = ref(false);
  const editorNodeKind = ref<SpeciesNodeKind>('feature');
  const editorFeatureIndex = ref(-1);
  const editorChoiceIndex = ref(-1);
  const editorChoiceFeatureIndex = ref(-1);

  const existingKey = ref<string | null>(null);
  const existingId = ref<string | null>(null);

  // ============================================================
  // Преобразование между моделью данных и редактируемыми полями
  // ============================================================

  /**
   * Разворачивает особенность вида в редактируемые поля.
   *
   * @param feature - особенность вида (базовая или особенность подвида)
   */
  function toEditableFields(feature: SpeciesFeature): EditableFeatureFields {
    return {
      key: feature.key || generateId('sf'),
      name: feature.name || '',
      description: feature.description || '',
      level: feature.level ?? 1,
      isInformationalOnly: feature.isInformationalOnly ?? false,
      movement: {
        walk: feature.movement?.walk ?? 0,
        fly: feature.movement?.fly ?? 0,
        swim: feature.movement?.swim ?? 0,
        climb: feature.movement?.climb ?? 0,
        burrow: feature.movement?.burrow ?? 0,
      },
      darkvision: feature.darkvision ?? 0,
      grantedSpells: (feature.grantedSpells ?? []).map((spell) => ({
        name: spell.name,
        spellId: spell.spellId,
        packId: spell.packId,
      })),
    };
  }

  /**
   * Создаёт пустые редактируемые поля для новой особенности.
   *
   * @param name - стартовое название
   */
  function createEditableFields(name: string): EditableFeatureFields {
    return {
      key: generateId('sf'),
      name,
      description: '',
      level: 1,
      isInformationalOnly: false,
      movement: createEmptyMovement(),
      darkvision: 0,
      grantedSpells: [],
    };
  }

  /**
   * Собирает особенность вида из редактируемых полей (для сохранения).
   *
   * @param fields - редактируемые поля особенности
   */
  function buildFeatureFromFields(
    fields: EditableFeatureFields,
  ): SpeciesFeature {
    const built: SpeciesFeature = {
      key: fields.key,
      name: fields.name.trim(),
      description: fields.description.trim(),
    };

    const level = Math.max(1, Math.round(fields.level || 1));

    if (level > 1) {
      built.level = level;
    }

    if (fields.isInformationalOnly) {
      built.isInformationalOnly = true;
    }

    const movement: SpeciesMovementGrant = {};

    for (const axis of MOVEMENT_AXES) {
      if (fields.movement[axis] > 0) {
        movement[axis] = fields.movement[axis];
      }
    }

    if (Object.keys(movement).length > 0) {
      built.movement = movement;
    }

    if (fields.darkvision > 0) {
      built.darkvision = fields.darkvision;
    }

    const grantedSpells = fields.grantedSpells
      .filter((spell) => spell.name.trim().length > 0)
      .map((spell) => ({
        name: spell.name.trim(),
        ...(spell.spellId ? { spellId: spell.spellId } : {}),
        ...(spell.packId ? { packId: spell.packId } : {}),
      }));

    if (grantedSpells.length > 0) {
      built.grantedSpells = grantedSpells;
    }

    return built;
  }

  // ============================================================
  // Инициализация при открытии
  // ============================================================
  function resetForm(): void {
    name.value = '';
    nameEn.value = '';
    description.value = '';
    icon.value = '';
    sourceKey.value = 'local';
    isSRD.value = false;
    creatureType.value = 'humanoid';
    selectedSizes.value = ['medium'];
    speedWalk.value = 30;
    speedFly.value = 0;
    speedSwim.value = 0;
    speedClimb.value = 0;
    speedBurrow.value = 0;
    darkvisionRange.value = 0;
    skillCount.value = 0;
    skillFrom.value = [];
    savingThrows.value = [];
    damageDefenses.value = [];
    conditionImmunities.value = [];
    armorFixed.value = [];
    armorChoiceCount.value = 0;
    armorChoiceFrom.value = [];
    weaponFixed.value = [];
    weaponChoiceCount.value = 0;
    weaponChoiceFrom.value = [];
    toolFixed.value = [];
    toolChoiceCount.value = 0;
    toolChoiceFrom.value = [];
    languageFixed.value = [];
    languageChoiceCount.value = 0;
    languageChoiceFrom.value = [];
    preservedGrants.value = [];
    features.value = [];
    isNodeEditorOpen.value = false;
    existingKey.value = null;
    existingId.value = null;
  }

  function hydrateFromDefinition(definition: SpeciesDefinition): void {
    name.value = definition.name || '';
    nameEn.value = definition.nameEn || '';
    description.value = definition.description || '';
    icon.value = definition.icon || '';
    sourceKey.value = definition.sourceKey || 'local';
    isSRD.value = definition.isSRD ?? false;
    creatureType.value = definition.creatureType || 'humanoid';

    selectedSizes.value =
      definition.size && definition.size.length > 0
        ? [...definition.size]
        : ['medium'];

    speedWalk.value = definition.speed?.walk ?? 30;
    speedFly.value = definition.speed?.fly ?? 0;
    speedSwim.value = definition.speed?.swim ?? 0;
    speedClimb.value = definition.speed?.climb ?? 0;
    speedBurrow.value = definition.speed?.burrow ?? 0;
    existingKey.value = definition.key;

    for (const grant of definition.grants ?? []) {
      switch (grant.type) {
        case 'darkvision':
          darkvisionRange.value = grant.range;

          break;
        case 'skillProficiency':
          skillCount.value = grant.count;
          skillFrom.value = [...(grant.from ?? [])];

          break;
        case 'savingThrowProficiency':
          savingThrows.value = [...grant.abilities];

          break;
        case 'damageDefense':
          damageDefenses.value = grant.entries.map((entry) => ({ ...entry }));

          break;
        case 'conditionImmunity':
          conditionImmunities.value = [...grant.conditions];

          break;
        case 'armorProficiency':
          armorFixed.value = [...grant.items];

          if (grant.choices) {
            armorChoiceCount.value = grant.choices.count;
            armorChoiceFrom.value = [...grant.choices.from];
          }

          break;
        case 'weaponProficiency':
          weaponFixed.value = [...grant.items];

          if (grant.choices) {
            weaponChoiceCount.value = grant.choices.count;
            weaponChoiceFrom.value = [...grant.choices.from];
          }

          break;
        case 'toolProficiency':
          toolFixed.value = [...grant.items];

          if (grant.choices) {
            toolChoiceCount.value = grant.choices.count;
            toolChoiceFrom.value = [...grant.choices.from];
          }

          break;
        case 'language':
          languageFixed.value = [...grant.items];

          if (grant.choices) {
            languageChoiceCount.value = grant.choices.count;
            languageChoiceFrom.value = [...grant.choices.from];
          }

          break;
        default:
          // resistance и прочие неотображаемые дары — сохраняем как есть
          preservedGrants.value.push(grant);
      }
    }

    features.value = (definition.features ?? []).map((feature) => ({
      ...toEditableFields(feature),
      choices: (feature.choices ?? []).map((choice) => ({
        key: choice.key || generateId('sfc'),
        name: choice.name || '',
        description: choice.description || '',
        features: (choice.features ?? []).map(toEditableFields),
        damageDefenses: (choice.damageDefenses ?? []).map((entry) => ({
          ...entry,
        })),
        conditionImmunities: [...(choice.conditionImmunities ?? [])],
      })),
    }));
  }

  /**
   * Загружает заклинания компендиума ПО ПАКАМ — для подсказок связывания,
   * выбора пака и просмотра. Без сокета — пусто (имена вводить всё равно можно).
   */
  async function loadAvailableSpells(): Promise<void> {
    if (!props.socket) {
      availableSpells.value = [];
      spellPacks.value = [];

      return;
    }

    const { packs, options } = await loadSpellPacks(props.socket);

    spellPacks.value = packs;
    availableSpells.value = options;
    autoLinkExactMatches();
  }

  /**
   * Авто-связывает заклинания особенностей с компендиумом по ТОЧНОМУ
   * уникальному (по id) совпадению имени — для базовых особенностей и для
   * вложенных особенностей подвидов (обход дерева; связывание — общий хелпер).
   */
  function autoLinkExactMatches(): void {
    const index = buildSpellLinkIndex(availableSpells.value);

    for (const feature of features.value) {
      linkGrantedSpellRefs(feature.grantedSpells, index);

      for (const choice of feature.choices) {
        for (const choiceFeature of choice.features) {
          linkGrantedSpellRefs(choiceFeature.grantedSpells, index);
        }
      }
    }
  }

  /**
   * Открывает детальный просмотр заклинания. Предпочитает указанный пак, иначе
   * берёт первый пак, где это заклинание есть.
   *
   * @param spellId - id заклинания компендиума
   * @param packId - предпочтённый пак (опционально)
   */
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

      existingId.value = props.speciesItemId ?? null;

      if (props.speciesDefinition) {
        hydrateFromDefinition(props.speciesDefinition);
      }

      void loadAvailableSpells();
    },
    { immediate: true },
  );

  // ============================================================
  // Управление особенностями
  // ============================================================
  /** Элемент дерева UTree вкладки «Особенности». */
  interface SpeciesTreeItem {
    /** Составной уникальный ключ узла: `<тип>:<ключи по пути>`. */
    value: string;
    label: string;
    icon: string;
    children?: SpeciesTreeItem[];
  }

  /** Индексы узла в модели формы (−1, если уровень не применим). */
  interface SpeciesNodeIndices {
    featureIndex: number;
    choiceIndex: number;
    choiceFeatureIndex: number;
  }

  /** Иконки узлов дерева по типу. */
  const NODE_ICONS: Record<SpeciesNodeKind, string> = {
    feature: 'tabler:list-details',
    choice: 'tabler:git-branch',
    choiceFeature: 'tabler:sparkles',
  };

  /**
   * Узлы дерева рендерим как `div`, а не `button` — иначе кнопки действий
   * (добавить/правка/удалить) оказались бы вложены в `button` (невалидный HTML).
   */
  const treeRenderAs = { link: 'div' };

  // ── Дерево особенностей (особенность → подвид → особенность подвида) ──
  const featureTreeItems = computed<SpeciesTreeItem[]>(() =>
    features.value.map((feature) => ({
      value: `feature:${feature.key}`,
      label: feature.name || 'Особенность',
      icon: NODE_ICONS.feature,
      children: feature.choices.map((choice) => ({
        value: `choice:${feature.key}:${choice.key}`,
        label: choice.name || 'Вариант (подвид)',
        icon: NODE_ICONS.choice,
        children: choice.features.map((choiceFeature) => ({
          value: `choiceFeature:${feature.key}:${choice.key}:${choiceFeature.key}`,
          label: choiceFeature.name || 'Особенность подвида',
          icon: NODE_ICONS.choiceFeature,
        })),
      })),
    })),
  );

  /** Уникальный ключ узла дерева для UTree. */
  function getNodeKey(item: SpeciesTreeItem): string {
    return item.value;
  }

  /** Иконка-шеврон по состоянию раскрытия узла дерева. */
  function chevronIcon(expanded: boolean): string {
    return expanded ? 'tabler:chevron-down' : 'tabler:chevron-right';
  }

  /** Подпись (aria) кнопки добавления дочернего узла. */
  function addNodeLabel(value: string): string {
    return nodeKind(value) === 'feature'
      ? 'Добавить подвид'
      : 'Добавить особенность подвида';
  }

  /** Тип узла по его составному ключу. */
  function nodeKind(value: string): SpeciesNodeKind {
    const prefix = value.split(':')[0];

    if (prefix === 'choice') {
      return 'choice';
    }

    if (prefix === 'choiceFeature') {
      return 'choiceFeature';
    }

    return 'feature';
  }

  /** Находит индексы узла по ключам, зашитым в его составной `value`. */
  function resolveNodeIndices(value: string): SpeciesNodeIndices {
    const parts = value.split(':');

    const featureIndex = features.value.findIndex(
      (feature) => feature.key === parts[1],
    );

    const feature = features.value[featureIndex];

    const choiceIndex =
      feature?.choices.findIndex((choice) => choice.key === parts[2]) ?? -1;

    const choice = feature?.choices[choiceIndex];

    const choiceFeatureIndex =
      choice?.features.findIndex(
        (choiceFeature) => choiceFeature.key === parts[3],
      ) ?? -1;

    return { featureIndex, choiceIndex, choiceFeatureIndex };
  }

  // ── Попап-редактор выбранного узла ──
  const nodeEditorTitle = computed(() => {
    if (editorNodeKind.value === 'choice') {
      return 'Подвид';
    }

    if (editorNodeKind.value === 'choiceFeature') {
      return 'Особенность подвида';
    }

    return 'Особенность';
  });

  /**
   * Открывает попап-редактор узла дерева.
   *
   * @param value - составной ключ узла
   */
  function openNodeEditor(value: string): void {
    const indices = resolveNodeIndices(value);

    if (indices.featureIndex < 0) {
      return;
    }

    editorNodeKind.value = nodeKind(value);
    editorFeatureIndex.value = indices.featureIndex;
    editorChoiceIndex.value = indices.choiceIndex;
    editorChoiceFeatureIndex.value = indices.choiceFeatureIndex;
    isNodeEditorOpen.value = true;
  }

  /** Закрывает попап-редактор узла. */
  function closeNodeEditor(): void {
    isNodeEditorOpen.value = false;
  }

  /**
   * Обрабатывает закрытие попап-редактора (крестик/клик мимо).
   *
   * @param value - новое состояние открытости
   */
  function handleNodeEditorOpenChange(value: boolean): void {
    if (!value) {
      closeNodeEditor();
    }
  }

  function addFeature(): void {
    const newFeature: EditableFeature = {
      ...createEditableFields('Новая особенность'),
      choices: [],
    };

    features.value.push(newFeature);
    openNodeEditor(`feature:${newFeature.key}`);
  }

  /**
   * Кнопка «+» на узле: добавляет дочерний узел (подвид у особенности либо
   * особенность у подвида) и сразу открывает его редактор.
   *
   * @param value - составной ключ родительского узла
   */
  function addUnderNode(value: string): void {
    const { featureIndex, choiceIndex } = resolveNodeIndices(value);
    const feature = features.value[featureIndex];

    if (!feature) {
      return;
    }

    if (nodeKind(value) === 'feature') {
      const newChoice: EditableChoice = {
        key: generateId('sfc'),
        name: 'Вариант',
        description: '',
        features: [],
        damageDefenses: [],
        conditionImmunities: [],
      };

      feature.choices.push(newChoice);
      openNodeEditor(`choice:${feature.key}:${newChoice.key}`);

      return;
    }

    const choice = feature.choices[choiceIndex];

    if (!choice) {
      return;
    }

    const newChoiceFeature = createEditableFields('Особенность подвида');

    choice.features.push(newChoiceFeature);

    openNodeEditor(
      `choiceFeature:${feature.key}:${choice.key}:${newChoiceFeature.key}`,
    );
  }

  /**
   * Удаляет узел дерева (особенность / подвид / особенность подвида).
   *
   * @param value - составной ключ удаляемого узла
   */
  function deleteNode(value: string): void {
    const { featureIndex, choiceIndex, choiceFeatureIndex } =
      resolveNodeIndices(value);

    const kind = nodeKind(value);

    if (kind === 'feature') {
      features.value.splice(featureIndex, 1);
    } else if (kind === 'choice') {
      features.value[featureIndex]?.choices.splice(choiceIndex, 1);
    } else {
      features.value[featureIndex]?.choices[choiceIndex]?.features.splice(
        choiceFeatureIndex,
        1,
      );
    }

    // Узел мог редактироваться — закрываем редактор, чтобы индексы не устарели.
    closeNodeEditor();
  }

  // ============================================================
  // Валидация и сохранение
  // ============================================================
  const canSave = computed(
    () => name.value.trim().length > 0 && selectedSizes.value.length > 0,
  );

  function buildGrants(): SpeciesGrant[] {
    const grants: SpeciesGrant[] = [];

    if (darkvisionRange.value > 0) {
      grants.push({ type: 'darkvision', range: darkvisionRange.value });
    }

    if (skillCount.value > 0) {
      grants.push({
        type: 'skillProficiency',
        count: skillCount.value,
        from: [...skillFrom.value],
      });
    }

    if (savingThrows.value.length > 0) {
      grants.push({
        type: 'savingThrowProficiency',
        abilities: [...savingThrows.value],
      });
    }

    if (damageDefenses.value.length > 0) {
      grants.push({
        type: 'damageDefense',
        entries: damageDefenses.value.map((entry) => ({ ...entry })),
      });
    }

    if (conditionImmunities.value.length > 0) {
      grants.push({
        type: 'conditionImmunity',
        conditions: [...conditionImmunities.value],
      });
    }

    if (armorFixed.value.length > 0 || armorChoiceCount.value > 0) {
      grants.push({
        type: 'armorProficiency',
        items: [...armorFixed.value],
        choices:
          armorChoiceCount.value > 0
            ? {
                count: armorChoiceCount.value,
                from: [...armorChoiceFrom.value],
              }
            : undefined,
      });
    }

    if (weaponFixed.value.length > 0 || weaponChoiceCount.value > 0) {
      grants.push({
        type: 'weaponProficiency',
        items: [...weaponFixed.value],
        choices:
          weaponChoiceCount.value > 0
            ? {
                count: weaponChoiceCount.value,
                from: [...weaponChoiceFrom.value],
              }
            : undefined,
      });
    }

    if (toolFixed.value.length > 0 || toolChoiceCount.value > 0) {
      grants.push({
        type: 'toolProficiency',
        items: [...toolFixed.value],
        choices:
          toolChoiceCount.value > 0
            ? { count: toolChoiceCount.value, from: [...toolChoiceFrom.value] }
            : undefined,
      });
    }

    if (languageFixed.value.length > 0 || languageChoiceCount.value > 0) {
      grants.push({
        type: 'language',
        items: [...languageFixed.value],
        choices:
          languageChoiceCount.value > 0
            ? {
                count: languageChoiceCount.value,
                from: [...languageChoiceFrom.value],
              }
            : undefined,
      });
    }

    return [...grants, ...preservedGrants.value];
  }

  function buildFeatures(): SpeciesFeature[] {
    return features.value
      .filter((feature) => feature.name.trim().length > 0)
      .map((feature) => {
        const built = buildFeatureFromFields(feature);

        const choices = feature.choices.filter(
          (choice) => choice.name.trim().length > 0,
        );

        if (choices.length > 0) {
          built.choices = choices.map((choice) => {
            const choiceFeatures = choice.features
              .filter((choiceFeature) => choiceFeature.name.trim().length > 0)
              .map(buildFeatureFromFields);

            return {
              key: choice.key,
              name: choice.name.trim(),
              description: choice.description.trim(),
              ...(choiceFeatures.length > 0
                ? { features: choiceFeatures }
                : {}),
              ...(choice.damageDefenses.length > 0
                ? {
                    damageDefenses: choice.damageDefenses.map((entry) => ({
                      ...entry,
                    })),
                  }
                : {}),
              ...(choice.conditionImmunities.length > 0
                ? { conditionImmunities: [...choice.conditionImmunities] }
                : {}),
            };
          });
        }

        return built;
      });
  }

  function handleSave(): void {
    if (!canSave.value) {
      return;
    }

    const key =
      existingKey.value
      ?? `${slugify(nameEn.value || name.value) || 'species'}-${
        generateId('w').split('_')[2] ?? 'x'
      }`;

    const speed: SpeciesDefinition['speed'] = { walk: speedWalk.value };

    if (speedFly.value > 0) {
      speed.fly = speedFly.value;
    }

    if (speedSwim.value > 0) {
      speed.swim = speedSwim.value;
    }

    if (speedClimb.value > 0) {
      speed.climb = speedClimb.value;
    }

    if (speedBurrow.value > 0) {
      speed.burrow = speedBurrow.value;
    }

    const definition: SpeciesDefinition = {
      type: 'species',
      key,
      name: name.value.trim(),
      nameEn: nameEn.value.trim() || name.value.trim(),
      description: description.value.trim(),
      icon: icon.value.trim() || undefined,
      sourceKey: sourceKey.value,
      isSRD: isSRD.value,
      creatureType: creatureType.value,
      size: [...selectedSizes.value],
      speed,
      grants: buildGrants(),
      features: buildFeatures(),
    };

    // При редактировании сохраняем id исходного GameItem (проброшен через
    // speciesItemId), иначе генерируем новый — так правка обновляет запись, а
    // не плодит дубликат (в форму приходит только плоский SpeciesDefinition).
    const gameItem: GameItem = {
      id: existingId.value ?? `item_${generateId('species')}`,
      type: 'species',
      name: definition.name,
      nameEn: definition.nameEn,
      description: definition.description,
      sourceKey: sourceKey.value,
      isSRD: isSRD.value,
      image: icon.value.trim() || undefined,
      quantity: 1,
      weight: 0,
      cost: '',
      rarity: 'common',
      equipped: false,
      isReadOnly: false,
      speciesData: definition,
    };

    emit('save', gameItem);
    emit('close');
  }

  /**
   * Обрабатывает закрытие окна (крестик/клик мимо) — эмитит `close`.
   *
   * @param value - новое состояние открытости окна
   */
  function handleOpenChange(value: boolean): void {
    if (!value) {
      emit('close');
    }
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="speciesDefinition ? 'Редактировать вид' : 'Создать вид'"
    :subtitle="nameEn || undefined"
    :initial-width="760"
    :min-width="560"
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
                    placeholder="Человек"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Английское название">
                  <UInput
                    v-model="nameEn"
                    placeholder="Human"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Тип существа">
                  <USelect
                    v-model="creatureType"
                    :items="creatureTypeOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Размеры (минимум один)">
                  <USelectMenu
                    v-model="selectedSizes"
                    :items="sizeOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Выберите размеры..."
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

                <UFormField label="Иконка (tabler:...)">
                  <UInput
                    v-model="icon"
                    placeholder="tabler:user"
                    class="w-full"
                  />
                </UFormField>

                <div class="col-span-2 flex items-center">
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

        <!-- ДВИЖЕНИЕ -->
        <template #movement>
          <FormSection
            title="Базовая скорость (фт.)"
            title-color="healing"
          >
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <UFormField label="Ходьба">
                <UInputNumber
                  v-model="speedWalk"
                  :min="0"
                  :max="200"
                />
              </UFormField>

              <UFormField label="Полёт">
                <UInputNumber
                  v-model="speedFly"
                  :min="0"
                  :max="200"
                />
              </UFormField>

              <UFormField label="Плавание">
                <UInputNumber
                  v-model="speedSwim"
                  :min="0"
                  :max="200"
                />
              </UFormField>

              <UFormField label="Лазание">
                <UInputNumber
                  v-model="speedClimb"
                  :min="0"
                  :max="200"
                />
              </UFormField>

              <UFormField label="Копание">
                <UInputNumber
                  v-model="speedBurrow"
                  :min="0"
                  :max="200"
                />
              </UFormField>
            </div>

            <p class="mt-3 text-xs text-dimmed">
              Прибавки скорости по уровням (напр. полёт у подвида с 3 уровня)
              задаются в особенностях на вкладке «Особенности».
            </p>
          </FormSection>
        </template>

        <!-- ДАРЫ -->
        <template #grants>
          <div class="flex flex-col gap-4">
            <FormSection
              title="Чувства и спасброски"
              title-color="healing"
            >
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Тёмное зрение (фт., 0 = нет)">
                  <UInputNumber
                    v-model="darkvisionRange"
                    :min="0"
                    :max="300"
                    :step="30"
                  />
                </UFormField>

                <UFormField label="Владение спасбросками">
                  <USelectMenu
                    v-model="savingThrows"
                    :items="abilitiesOptions"
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
              title="Защиты от урона и состояний"
              title-color="healing"
            >
              <div class="flex flex-col gap-4">
                <UFormField label="Защиты от типов урона">
                  <DamageDefenseEditor v-model="damageDefenses" />
                </UFormField>

                <UFormField label="Иммунитет к состояниям">
                  <USelectMenu
                    v-model="conditionImmunities"
                    :items="conditionOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Состояния..."
                  />
                </UFormField>
              </div>
            </FormSection>

            <FormSection
              title="Владение навыками"
              title-color="healing"
            >
              <div class="flex items-start gap-3">
                <UFormField
                  label="Кол-во на выбор"
                  class="w-1/3"
                >
                  <UInputNumber
                    v-model="skillCount"
                    :min="0"
                    :max="6"
                  />
                </UFormField>

                <UFormField
                  label="Из набора (пусто = любой навык)"
                  class="flex-1"
                >
                  <USelectMenu
                    v-model="skillFrom"
                    :items="skillsOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    :disabled="skillCount === 0"
                    class="w-full"
                    placeholder="Любой навык..."
                  />
                </UFormField>
              </div>
            </FormSection>

            <FormSection
              title="Доспехи"
              title-color="healing"
            >
              <div class="flex flex-col gap-3">
                <UFormField label="Фиксированное владение">
                  <USelectMenu
                    v-model="armorFixed"
                    :items="armorOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Даётся всегда..."
                  />
                </UFormField>

                <div class="flex items-start gap-3">
                  <UFormField
                    label="На выбор"
                    class="w-1/3"
                  >
                    <UInputNumber
                      v-model="armorChoiceCount"
                      :min="0"
                      :max="4"
                    />
                  </UFormField>

                  <UFormField
                    label="Из набора"
                    class="flex-1"
                  >
                    <USelectMenu
                      v-model="armorChoiceFrom"
                      :items="armorOptions"
                      value-key="value"
                      label-key="label"
                      multiple
                      :disabled="armorChoiceCount === 0"
                      class="w-full"
                      placeholder="Доступно для выбора..."
                    />
                  </UFormField>
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Оружие"
              title-color="healing"
            >
              <div class="flex flex-col gap-3">
                <UFormField label="Фиксированное владение">
                  <USelectMenu
                    v-model="weaponFixed"
                    :items="weaponOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Даётся всегда..."
                  />
                </UFormField>

                <div class="flex items-start gap-3">
                  <UFormField
                    label="На выбор"
                    class="w-1/3"
                  >
                    <UInputNumber
                      v-model="weaponChoiceCount"
                      :min="0"
                      :max="4"
                    />
                  </UFormField>

                  <UFormField
                    label="Из набора"
                    class="flex-1"
                  >
                    <USelectMenu
                      v-model="weaponChoiceFrom"
                      :items="weaponOptions"
                      value-key="value"
                      label-key="label"
                      multiple
                      :disabled="weaponChoiceCount === 0"
                      class="w-full"
                      placeholder="Доступно для выбора..."
                    />
                  </UFormField>
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Инструменты"
              title-color="healing"
            >
              <div class="flex flex-col gap-3">
                <UFormField label="Фиксированное владение">
                  <USelectMenu
                    v-model="toolFixed"
                    :items="toolsOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Даётся всегда..."
                  />
                </UFormField>

                <div class="flex items-start gap-3">
                  <UFormField
                    label="На выбор"
                    class="w-1/3"
                  >
                    <UInputNumber
                      v-model="toolChoiceCount"
                      :min="0"
                      :max="4"
                    />
                  </UFormField>

                  <UFormField
                    label="Из набора"
                    class="flex-1"
                  >
                    <USelectMenu
                      v-model="toolChoiceFrom"
                      :items="toolsOptions"
                      value-key="value"
                      label-key="label"
                      multiple
                      :disabled="toolChoiceCount === 0"
                      class="w-full"
                      placeholder="Доступно для выбора..."
                    />
                  </UFormField>
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Языки"
              title-color="healing"
            >
              <div class="flex flex-col gap-3">
                <UFormField label="Фиксированные языки">
                  <USelectMenu
                    v-model="languageFixed"
                    :items="languageOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Даются всегда..."
                  />
                </UFormField>

                <div class="flex items-start gap-3">
                  <UFormField
                    label="На выбор"
                    class="w-1/3"
                  >
                    <UInputNumber
                      v-model="languageChoiceCount"
                      :min="0"
                      :max="4"
                    />
                  </UFormField>

                  <UFormField
                    label="Из набора"
                    class="flex-1"
                  >
                    <USelectMenu
                      v-model="languageChoiceFrom"
                      :items="languageOptions"
                      value-key="value"
                      label-key="label"
                      multiple
                      :disabled="languageChoiceCount === 0"
                      class="w-full"
                      placeholder="Доступно для выбора..."
                    />
                  </UFormField>
                </div>
              </div>
            </FormSection>
          </div>
        </template>

        <!-- ОСОБЕННОСТИ -->
        <template #features>
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs text-dimmed">
                Структура: особенность → подвид → особенность подвида. Плюс —
                добавить вложенное, карандаш — правка, корзина — удалить.
              </p>

              <UButton
                icon="tabler:plus"
                label="Особенность"
                color="primary"
                variant="soft"
                size="xs"
                class="shrink-0"
                @click.left.exact.prevent="addFeature"
              />
            </div>

            <div
              v-if="features.length === 0"
              class="rounded-lg border border-dashed border-default p-4 text-center text-xs text-dimmed italic"
            >
              Особенностей пока нет. Нажмите «Особенность», чтобы добавить.
            </div>

            <UTree
              v-else
              :items="featureTreeItems"
              :get-key="getNodeKey"
              :as="treeRenderAs"
              color="neutral"
              class="rounded-lg border border-default bg-elevated/20 p-1.5"
            >
              <template #item-trailing="{ item, expanded, handleToggle }">
                <div class="flex items-center gap-0.5">
                  <UButton
                    v-if="nodeKind(item.value) !== 'choiceFeature'"
                    icon="tabler:plus"
                    color="primary"
                    variant="ghost"
                    size="xs"
                    :aria-label="addNodeLabel(item.value)"
                    @click.left.exact.stop.prevent="addUnderNode(item.value)"
                  />

                  <UButton
                    icon="tabler:pencil"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Редактировать"
                    @click.left.exact.stop.prevent="openNodeEditor(item.value)"
                  />

                  <UButton
                    icon="tabler:trash"
                    color="error"
                    variant="ghost"
                    size="xs"
                    aria-label="Удалить"
                    @click.left.exact.stop.prevent="deleteNode(item.value)"
                  />

                  <UButton
                    v-if="item.children?.length"
                    :icon="chevronIcon(expanded)"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Свернуть или развернуть"
                    @click.left.exact.stop.prevent="handleToggle"
                  />
                </div>
              </template>
            </UTree>
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
          Укажите название и хотя бы один размер
        </span>

        <div class="ml-auto flex gap-3">
          <UButton
            label="Отмена"
            color="neutral"
            variant="ghost"
            @click.left.exact.prevent="emit('close')"
          />

          <UButton
            :label="speciesDefinition ? 'Сохранить' : 'Создать'"
            color="primary"
            :disabled="!canSave"
            @click.left.exact.prevent="handleSave"
          />
        </div>
      </div>
    </template>
  </UDraggableModal>

  <!-- Попап-редактор выбранного узла дерева особенностей -->
  <UDraggableModal
    :open="isNodeEditorOpen"
    :title="nodeEditorTitle"
    :initial-width="640"
    :min-width="480"
    :resizable="false"
    @update:open="handleNodeEditorOpenChange"
  >
    <template #body>
      <div
        v-if="isNodeEditorOpen"
        class="flex flex-col gap-3"
      >
        <SpeciesFeatureFields
          v-if="editorNodeKind === 'feature'"
          v-model="features[editorFeatureIndex]"
          :available-spells="availableSpells"
          @open-spell="openSpellDetail"
        />

        <SpeciesFeatureFields
          v-else-if="editorNodeKind === 'choiceFeature'"
          v-model="
            features[editorFeatureIndex].choices[editorChoiceIndex].features[
              editorChoiceFeatureIndex
            ]
          "
          :available-spells="availableSpells"
          @open-spell="openSpellDetail"
        />

        <template v-else>
          <UFormField label="Название подвида">
            <UInput
              v-model="
                features[editorFeatureIndex].choices[editorChoiceIndex].name
              "
              placeholder="Лесной эльф"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Краткое описание подвида">
            <UTextarea
              v-model="
                features[editorFeatureIndex].choices[editorChoiceIndex]
                  .description
              "
              :rows="2"
              autoresize
              class="w-full"
            />
          </UFormField>

          <UFormField label="Защиты от типов урона (этого подвида)">
            <DamageDefenseEditor
              v-model="
                features[editorFeatureIndex].choices[editorChoiceIndex]
                  .damageDefenses
              "
            />
          </UFormField>

          <UFormField label="Иммунитет к состояниям (этого подвида)">
            <USelectMenu
              v-model="
                features[editorFeatureIndex].choices[editorChoiceIndex]
                  .conditionImmunities
              "
              :items="conditionOptions"
              value-key="value"
              label-key="label"
              multiple
              class="w-full"
              placeholder="Состояния..."
            />
          </UFormField>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          label="Готово"
          color="primary"
          @click.left.exact.prevent="closeNodeEditor"
        />
      </div>
    </template>
  </UDraggableModal>
</template>
