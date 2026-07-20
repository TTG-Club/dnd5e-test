<script setup lang="ts">
  import type {
    AbilityType,
    ProficiencyLevel,
    SkillType,
    TypedWebSocketClient,
  } from '@vtt/shared';
  import type { Creature, RestType, Spell } from '@vtt/shared/system/dnd.js';

  import { useToast } from '@nuxt/ui/composables';
  import { generateId } from '@vtt/shared';
  import {
    applyCreatureRest,
    calculateAbilityModifier,
    calculateSkillModifier,
    CONDITIONS,
    CR_TABLE,
    CREATURE_ENVIRONMENTS,
    DEFAULT_CREATURE,
    getProficiencyContribution,
    getSkillAbility,
    normalizeCreature,
    SKILLS_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, toRef, watch } from 'vue';

  import { generateEntityId, requireSocket } from '@/core/entityUtils';
  import FieldsetLabel from '@/shared_ui/components/FieldsetLabel.vue';
  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';
  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { Z_INDEX } from '@/shared_ui/consts';
  import { useWorldStore } from '@/stores/worldStore';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import { useResolvedStats } from '../../composables/useResolvedStats';
  import { SPELL_MIME } from '../actor/constants';
  import LanguageProficiencyModal from '../actor/LanguageProficiencyModal.vue';
  import CreatureAbilities from './CreatureAbilities.vue';
  import CreatureActionsBlock from './CreatureActionsBlock.vue';
  import CreatureCombatBlock from './CreatureCombatBlock.vue';
  import CreatureConditionImmunitiesModal from './CreatureConditionImmunitiesModal.vue';
  import CreatureDefensesModal from './CreatureDefensesModal.vue';
  import CreatureEffectsBlock from './CreatureEffectsBlock.vue';
  import CreatureEnvironmentsModal from './CreatureEnvironmentsModal.vue';
  import CreatureHeader from './CreatureHeader.vue';
  import CreatureSkillsModal from './CreatureSkillsModal.vue';
  import CreatureSpellsBlock from './CreatureSpellsBlock.vue';

  interface Props {
    open: boolean;
    creatureId?: string;
    worldId?: string;
    creatures?: Creature[];
    socket?: TypedWebSocketClient | null;
    zIndex?: number;
    modalId?: string;
    isAdmin?: boolean;
    savedPosition?: { x: number; y: number };
    savedSize?: { width: number; height: number };
    /** Данные существа из компендиума (режим только просмотр) */
    initialData?: {
      id: string;
      name: string;
      description?: string;
      system: Creature['system'];
      nameEn?: string;
      header?: string;
      token?: Creature['token'];
      spells?: Spell[];
      activeEffects?: Creature['activeEffects'];
      [key: string]: unknown;
    };
  }

  const props = defineProps<Props>();

  const worldStore = useWorldStore();

  /** Режим только просмотр (компендиум, без сокета) */
  const isReadOnly = computed(
    () => !props.socket || (!props.creatures && !!props.initialData),
  );

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'update:creature': [creature: Creature];
    'save': [creature: Creature];
    'close': [];
    'bring-to-front': [];
  }>();

  const toast = useToast();
  const { updateModalProps, openModal } = useModalManager();

  // Состояние
  const isEditMode = ref(false);
  const localCreature = ref<Creature | null>(null);
  const savedSnapshot = ref<Creature | null>(null);
  const isDirty = ref(false);
  const isSaving = ref(false);
  const isCreated = ref(false);

  /**
   * Является ли текущий пользователь владельцем существа
   * (существо передано игроку под контроль ГМом).
   */
  const isOwner = computed(() => {
    const ownerId = localCreature.value?.ownerId;
    const userId = worldStore.connectionState.loggedAsUserId;

    return Boolean(ownerId && userId && ownerId === userId);
  });

  /** Может ли пользователь управлять существом (ГМ или владелец) */
  const canControl = computed(() => Boolean(props.isAdmin) || isOwner.value);

  /** Текущий мир существа (источник пользователей и порта файлового менеджера) */
  const currentWorld = computed(() =>
    props.worldId ? worldStore.getWorldById(props.worldId) : null,
  );

  /** Список пользователей мира для выбора владельца в настройках */
  const worldUsers = computed(() => currentWorld.value?.users ?? []);

  /** Порт сервера мира — нужен файловому менеджеру (AssetBrowser) в настройках */
  const worldPort = computed(() => currentWorld.value?.port);

  // Модалка подтверждения
  const isConfirmOpen = ref(false);
  const pendingAction = ref<'close' | null>(null);

  // Вкладки
  const tabs = [
    { id: 'actions', label: 'Действия' },
    { id: 'traits', label: 'Особенности' },
    { id: 'spells', label: 'Заклинания' },
    { id: 'effects', label: 'Эффекты' },
    { id: 'description', label: 'Описание' },
  ];

  const activeTab = ref('actions');

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  /**
   * Инициализирует данные существа: загружает существующее или создаёт новое
   */
  function initializeCreature() {
    // Режим компендиума — берём данные из initialData
    if (props.initialData) {
      const creature: Creature = {
        entityType: 'creature',
        id: props.initialData.id,
        name: props.initialData.name,
        system: props.initialData.system,
        description: props.initialData.description,
        nameEn: props.initialData.nameEn,
        header: props.initialData.header,
        token: props.initialData.token,
        spells: props.initialData.spells,
        activeEffects: props.initialData.activeEffects,
      };

      localCreature.value = normalizeCreature(
        JSON.parse(JSON.stringify(creature)),
      );

      isEditMode.value = false;
      isDirty.value = false;

      return;
    }

    if (props.creatureId && props.creatures) {
      const creature = props.creatures.find(
        (entry) => entry.id === props.creatureId,
      );

      if (creature) {
        localCreature.value = normalizeCreature(
          JSON.parse(JSON.stringify(creature)),
        );

        isEditMode.value = false;
      } else {
        console.error(
          '[CreatureSheet] Creature not found with id:',
          props.creatureId,
        );
      }
    } else if (!props.creatureId) {
      const newId = generateEntityId('creature');

      const newCreature: Creature = JSON.parse(
        JSON.stringify({ ...DEFAULT_CREATURE, id: newId }),
      );

      localCreature.value = newCreature;
      isEditMode.value = true;
    }

    isDirty.value = false;
  }

  // Автоматическое обновление бонуса мастерства при смене CR
  const proficiencyBonusFromCr = computed(() => {
    if (!localCreature.value) {
      return 2;
    }

    const crEntry = CR_TABLE.find(
      (entry) => entry.cr === localCreature.value?.system.challengeRating,
    );

    return crEntry?.proficiencyBonus ?? 2;
  });

  watch(proficiencyBonusFromCr, (newBonus) => {
    if (localCreature.value && isEditMode.value) {
      localCreature.value.system.proficiencyBonus = newBonus;
      isDirty.value = true;
      handleImmediateSave();
    }
  });

  // Синхронизация при внешнем обновлении
  const storeCreature = computed(() => {
    if (!props.creatureId || !props.creatures) {
      return null;
    }

    return props.creatures.find((entry) => entry.id === props.creatureId);
  });

  watch(
    () => storeCreature.value,
    (newCreature, oldCreature) => {
      // Если существо было удалено
      if (oldCreature && !newCreature) {
        isOpen.value = false;
        emit('close');
      }

      // Если localCreature был null (открыли с пустым creatures), инициализируем сейчас
      if (newCreature && !localCreature.value) {
        initializeCreature();
      }
    },
  );

  /**
   * Синхронизация token из store в localCreature.
   * Позволяет обновлять визуал/зрение, если они были изменены через настройки токена.
   */
  watch(
    () => storeCreature.value?.token,
    (newToken) => {
      if (localCreature.value && newToken && !isEditMode.value) {
        localCreature.value.token = JSON.parse(JSON.stringify(newToken));
      }
    },
    { deep: true },
  );

  /**
   * Синхронизация system из store в localCreature.
   */
  watch(
    () => storeCreature.value?.system,
    (newSystem) => {
      if (localCreature.value && newSystem && !isEditMode.value) {
        localCreature.value.system = JSON.parse(JSON.stringify(newSystem));
      }
    },
    { deep: true },
  );

  /**
   * Синхронизация activeEffects из store в localCreature: наложенные в бою
   * эффекты (статус/DoT по цели) и снятые повторным спасом должны появляться
   * в списке существа сразу, без перезагрузки страницы.
   */
  watch(
    () => storeCreature.value?.activeEffects,
    (newActiveEffects) => {
      if (localCreature.value && newActiveEffects && !isEditMode.value) {
        localCreature.value.activeEffects = JSON.parse(
          JSON.stringify(newActiveEffects),
        );
      }
    },
    { deep: true },
  );

  function handleImmediateSave() {
    if (isEditMode.value || !localCreature.value || !isDirty.value) {
      return;
    }

    emit('update:creature', localCreature.value);

    if (props.socket && props.creatureId) {
      const cleanCreature = JSON.parse(JSON.stringify(localCreature.value));

      props.socket.emit('creature:updated', cleanCreature);
    }

    savedSnapshot.value = JSON.parse(JSON.stringify(localCreature.value));
    isDirty.value = false;
  }

  function handleCreatureUpdate(updates: Partial<Creature>) {
    if (localCreature.value) {
      Object.assign(localCreature.value, updates);
      isDirty.value = true;
      handleImmediateSave();
    }
  }

  /**
   * Обновляет Markdown-описание существа.
   * @param description - новое описание существа
   */
  function handleCreatureDescriptionUpdate(description: string): void {
    handleCreatureUpdate({ description });
  }

  function handleSystemUpdate(updates: Partial<Creature['system']>) {
    if (localCreature.value) {
      Object.assign(localCreature.value.system, updates);
      isDirty.value = true;
      handleImmediateSave();
    }
  }

  const isLanguagesOpen = ref(false);

  function onLanguagesApply(selected: string[]) {
    if (localCreature.value) {
      localCreature.value.system.languages = selected;
      isDirty.value = true;
      handleImmediateSave();
    }
  }

  const isEnvironmentsOpen = ref(false);

  function onEnvironmentsApply(
    environments: string[],
    customEnvironments: string,
  ) {
    if (localCreature.value) {
      localCreature.value.system.environments = environments;
      localCreature.value.system.customEnvironments = customEnvironments;
      isDirty.value = true;
      handleImmediateSave();
    }
  }

  const isSkillsOpen = ref(false);

  const isDefensesOpen = ref(false);

  const systemDataStore = useSystemDataStore();

  /**
   * Карта ключей защит → локализованные названия (кэшируется через computed)
   */
  const defenseLabelMap = computed(() => {
    const labelMap: Record<string, string> = {
      // Ключи физического пробивания
      'bypass-adamantine': 'Пробивание: Адамантиновое',
      'bypass-magical': 'Пробивание: Магическое',
      'bypass-silvered': 'Пробивание: Посеребрённое',
    };

    for (const dt of systemDataStore.damageTypes) {
      labelMap[dt.key] = dt.name;
    }

    for (const condition of CONDITIONS) {
      labelMap[condition.key] = condition.nameRu;
    }

    return labelMap;
  });

  /**
   * Получает локализованное название типа урона/модификатора
   */
  function getDefenseLabel(key: string): string {
    return defenseLabelMap.value[key] || key;
  }

  const activeDefenseCategory = ref<
    'vulnerabilities' | 'resistances' | 'immunities'
  >('vulnerabilities');

  function onDefensesApply(
    category: 'vulnerabilities' | 'resistances' | 'immunities',
    selected: string[],
  ): void {
    if (localCreature.value) {
      localCreature.value.system.defenses[category] = selected;
      isDirty.value = true;
      handleImmediateSave();
    }
  }

  const isConditionImmunitiesOpen = ref(false);

  function onConditionImmunitiesApply(selected: string[]): void {
    if (localCreature.value) {
      localCreature.value.system.defenses.conditionImmunities = selected;
      isDirty.value = true;
      handleImmediateSave();
    }
  }

  function openDefensesModal(
    category: 'vulnerabilities' | 'resistances' | 'immunities',
  ): void {
    if (isEditMode.value) {
      activeDefenseCategory.value = category;
      isDefensesOpen.value = true;
    }
  }

  function onSkillsApply(skills: Partial<Record<SkillType, ProficiencyLevel>>) {
    if (localCreature.value) {
      localCreature.value.system.skills = skills;
      isDirty.value = true;
      handleImmediateSave();
    }
  }

  const formattedSkills = computed(() => {
    if (!localCreature.value) {
      return [];
    }

    const skills = localCreature.value.system.skills;
    const profBonus = localCreature.value.system.proficiencyBonus || 0;
    const result: string[] = [];

    for (const [key, level] of Object.entries(skills)) {
      if (level === 'none') {
        continue;
      }

      const ability = getSkillAbility(key as SkillType);
      const abilityScore = localCreature.value.system.abilities[ability];

      const total = calculateSkillModifier(
        abilityScore,
        profBonus,
        level as ProficiencyLevel,
      );

      const formattedTotal = total >= 0 ? `+${total}` : `${total}`;
      const label = SKILLS_LABELS[key as keyof typeof SKILLS_LABELS];

      if (label) {
        result.push(`${label} ${formattedTotal}`);
      }
    }

    return result.sort();
  });

  function openSettings() {
    openModal('CreatureSettingsModal', {
      creatureId: props.creatureId,
      creatureData: localCreature.value,
      onSave: (updates: Partial<Creature>) => {
        if (localCreature.value) {
          Object.assign(localCreature.value, updates);
          isDirty.value = true;
          handleImmediateSave();
        }
      },
      isAdmin: props.isAdmin,
      users: worldUsers.value,
      worldId: props.worldId,
      worldPort: worldPort.value,
      socket: props.socket,
      zIndex: (props.zIndex || 10000) + 10,
    });
  }

  function toggleEditMode() {
    if (!isEditMode.value) {
      if (localCreature.value) {
        savedSnapshot.value = JSON.parse(JSON.stringify(localCreature.value));
      }

      isEditMode.value = true;
    } else {
      if (isDirty.value) {
        handleSave();

        return;
      }

      isEditMode.value = false;
      savedSnapshot.value = null;
    }
  }

  function handleSave() {
    if (!localCreature.value || isSaving.value) {
      return;
    }

    if (!localCreature.value.name || localCreature.value.name.trim() === '') {
      toast.add({
        title: 'Ошибка валидации',
        description: 'Имя существа обязательно',
        color: 'error',
      });

      return;
    }

    isSaving.value = true;

    try {
      requireSocket(props.socket);

      const cleanCreature = JSON.parse(JSON.stringify(localCreature.value));

      if (props.creatureId) {
        props.socket!.emit('creature:updated', cleanCreature);
      } else {
        props.socket!.emit('creature:created', cleanCreature);
        emit('save', cleanCreature);
        isCreated.value = true;

        if (props.modalId) {
          updateModalProps(props.modalId, { creatureId: cleanCreature.id });
        }
      }

      toast.add({
        title: 'Успешно',
        description:
          props.creatureId || isCreated.value
            ? 'Существо обновлено'
            : 'Существо создано',
        color: 'success',
      });

      isDirty.value = false;
      savedSnapshot.value = null;
      isEditMode.value = false;
    } catch (error) {
      console.error('Failed to save creature:', error);

      toast.add({
        title: 'Ошибка сохранения',
        description:
          error instanceof Error
            ? error.message
            : 'Не удалось сохранить существо',
        color: 'error',
      });
    } finally {
      isSaving.value = false;
    }
  }

  function handleCancel() {
    if (isDirty.value) {
      pendingAction.value = 'close';
      isConfirmOpen.value = true;

      return;
    }

    isDirty.value = false;
    savedSnapshot.value = null;
    isOpen.value = false;
  }

  function onConfirmCancel() {
    isConfirmOpen.value = false;
    pendingAction.value = null;
  }

  function onConfirmSave() {
    isConfirmOpen.value = false;
    pendingAction.value = null;
    handleSave();
    isOpen.value = false;
  }

  function onConfirmDiscard() {
    isConfirmOpen.value = false;
    pendingAction.value = null;

    if (savedSnapshot.value) {
      localCreature.value = JSON.parse(JSON.stringify(savedSnapshot.value));
    }

    isDirty.value = false;
    isOpen.value = false;
  }

  watch(
    () => props.open,
    (newOpen) => {
      if (newOpen) {
        initializeCreature();
      }
    },
    { immediate: true },
  );

  function handleLegendaryActionsUpdate(
    legendaryActions: Creature['system']['legendary']['actions'],
  ) {
    if (!localCreature.value) {
      return;
    }

    handleSystemUpdate({
      legendary: {
        ...localCreature.value.system.legendary,
        actions: legendaryActions,
      },
    });
  }

  function handleLegendaryCountUpdate(count: number) {
    if (!localCreature.value) {
      return;
    }

    handleSystemUpdate({
      legendary: { ...localCreature.value.system.legendary, count },
    });
  }

  function handleActionsUpdate(actions: Creature['system']['actions']): void {
    handleSystemUpdate({ actions });
  }

  function handleBonusActionsUpdate(
    bonusActions: Creature['system']['bonusActions'],
  ): void {
    handleSystemUpdate({ bonusActions });
  }

  function handleReactionsUpdate(
    reactions: Creature['system']['reactions'],
  ): void {
    handleSystemUpdate({ reactions });
  }

  function handleTraitsUpdate(traits: Creature['system']['traits']): void {
    handleSystemUpdate({ traits });
  }

  /**
   * Обновляет список заклинаний существа (верхний уровень).
   * @param spells - новый список заклинаний
   */
  function handleSpellsUpdate(spells: NonNullable<Creature['spells']>): void {
    handleCreatureUpdate({ spells });
  }

  /**
   * Обновляет параметры заклинательства существа (плоский DC/бонус/характеристика).
   * @param spellcasting - новые параметры заклинательства
   */
  function handleSpellcastingUpdate(
    spellcasting: NonNullable<Creature['system']['spellcasting']>,
  ): void {
    handleSystemUpdate({ spellcasting });
  }

  /**
   * Применяет отдых к существу: восстанавливает заряды заклинаний (долгий
   * отдых — также хиты), затем сохраняет.
   * @param restType - тип отдыха
   */
  function handleRest(restType: RestType): void {
    if (!localCreature.value) {
      return;
    }

    handleCreatureUpdate(applyCreatureRest(localCreature.value, restType));

    toast.add({
      title: restType === 'long' ? 'Продолжительный отдых' : 'Короткий отдых',
      description:
        restType === 'long'
          ? 'Заряды заклинаний и хиты восстановлены.'
          : 'Заряды коротких заклинаний восстановлены.',
      color: 'success',
    });
  }

  /**
   * Разрешает перетаскивание заклинания из компендиума на лист существа.
   * @param event - событие dragover
   */
  function handleSpellDragOver(event: DragEvent): void {
    if (isReadOnly.value || !event.dataTransfer) {
      return;
    }

    if (event.dataTransfer.types.includes(SPELL_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  /**
   * Добавляет перетащенное заклинание в блок заклинательства существа
   * (новый id, дубликат по имени игнорируется).
   * @param event - событие drop
   */
  function handleSpellDrop(event: DragEvent): void {
    if (isReadOnly.value || !localCreature.value) {
      return;
    }

    const data = event.dataTransfer?.getData(SPELL_MIME);

    if (!data) {
      return;
    }

    event.preventDefault();

    try {
      const dropped = JSON.parse(data) as Spell;

      const current = localCreature.value.spells ?? [];

      if (current.some((entry) => entry.name === dropped.name)) {
        return;
      }

      const newSpell: Spell = { ...dropped, id: generateId('spell') };

      handleCreatureUpdate({ spells: [...current, newSpell] });

      activeTab.value = 'spells';

      toast.add({
        title: 'Заклинание добавлено',
        description: dropped.name,
        color: 'success',
      });
    } catch (error) {
      console.error(
        'Не удалось разобрать заклинание при перетаскивании',
        error,
      );
    }
  }

  function openSkillsModal(): void {
    if (isEditMode.value) {
      isSkillsOpen.value = true;
    }
  }

  function openLanguagesModal(): void {
    if (isEditMode.value) {
      isLanguagesOpen.value = true;
    }
  }

  function openEnvironmentsModal(): void {
    if (isEditMode.value) {
      isEnvironmentsOpen.value = true;
    }
  }

  // ── Спасброски ──────────────────────────────────────────────────────────

  const SAVING_THROW_ABILITIES: Array<{
    key: AbilityType;
    label: string;
    shortLabel: string;
  }> = [
    { key: 'strength', label: 'Сила', shortLabel: 'Сил.' },
    { key: 'intelligence', label: 'Интеллект', shortLabel: 'Инт.' },
    { key: 'dexterity', label: 'Ловкость', shortLabel: 'Лов.' },
    { key: 'wisdom', label: 'Мудрость', shortLabel: 'Мдр.' },
    { key: 'constitution', label: 'Телосложение', shortLabel: 'Тел.' },
    { key: 'charisma', label: 'Харизма', shortLabel: 'Хар.' },
  ];

  const { resolvedStats } = useResolvedStats(toRef(() => localCreature.value));

  /** Спасброски существа как массив AbilityType[] */
  const creatureSavingThrows = computed((): AbilityType[] => {
    return localCreature.value?.system.savingThrows ?? [];
  });

  /**
   * Вычисляет модификатор спасброска для характеристики
   */
  function calculateSavingThrow(abilityKey: AbilityType): number {
    if (resolvedStats.value) {
      return resolvedStats.value.saves[abilityKey] ?? 0;
    }

    if (!localCreature.value) {
      return 0;
    }

    const abilityScore = localCreature.value.system.abilities[abilityKey] ?? 10;
    const abilityMod = calculateAbilityModifier(abilityScore);
    const hasProficiency = creatureSavingThrows.value.includes(abilityKey);

    const profBonus = hasProficiency
      ? localCreature.value.system.proficiencyBonus || 0
      : 0;

    return abilityMod + profBonus;
  }

  /**
   * Вычисляет пассивную Внимательность на основе Мудрости и владения навыком Внимательность (perception).
   */
  const passivePerception = computed(() => {
    if (!localCreature.value) {
      return 10;
    }

    const wisScore = localCreature.value.system.abilities.wisdom ?? 10;
    const wisMod = calculateAbilityModifier(wisScore);

    const perceptionProf =
      localCreature.value.system.skills.perception ?? 'none';

    const baseProf = localCreature.value.system.proficiencyBonus ?? 0;

    const profBonus = getProficiencyContribution(baseProf, perceptionProf);

    return 10 + wisMod + profBonus;
  });

  /**
   * Форматирует модификатор со знаком (+/-)
   */
  function formatModifier(value: number): string {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  /**
   * Переключает владение спасброском для характеристики
   */
  function toggleSavingThrow(abilityKey: AbilityType): void {
    if (!isEditMode.value || !localCreature.value) {
      return;
    }

    const current = [...creatureSavingThrows.value];
    const index = current.indexOf(abilityKey);

    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(abilityKey);
    }

    handleSystemUpdate({ savingThrows: current });
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    hide-header
    :initial-width="940"
    :initial-height="780"
    :min-width="400"
    :min-height="300"
    :z-index="zIndex"
    :modal-id="modalId"
    :saved-position="savedPosition"
    :saved-size="savedSize"
    :ui="{
      content: 'bg-default rounded-2xl',
      body: 'p-0 h-full flex flex-col',
    }"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <div
        v-if="localCreature"
        class="relative flex h-full flex-col"
        @dragover="handleSpellDragOver"
        @drop="handleSpellDrop"
      >
        <!-- Фоновая картинка с затуханием -->
        <img
          src="/assets/modals/actor_bg.webp"
          alt=""
          class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-8"
        />
        <!-- Шапка существа (Full bleed) -->
        <CreatureHeader
          :creature="localCreature"
          :is-edit-mode="isEditMode"
          :is-creating="!props.creatureId && !isCreated"
          :can-edit="canControl && !isReadOnly"
          @update="handleCreatureUpdate"
          @update:system="handleSystemUpdate"
          @toggle-edit-mode="toggleEditMode"
          @open-settings="openSettings"
          @short-rest="handleRest('short')"
          @long-rest="handleRest('long')"
          @close="handleCancel"
          @save="handleSave"
        />

        <div class="custom-scrollbar flex-1 overflow-y-auto p-4">
          <div class="flex gap-6">
            <!-- Левая колонка -->
            <div class="flex w-[250px] shrink-0 flex-col gap-3">
              <!-- Боевой блок: КД, ХП, Скорость -->
              <CreatureCombatBlock
                :system="localCreature.system"
                :is-edit-mode="isEditMode"
                @update:system="handleSystemUpdate"
              />

              <!-- Защиты -->
              <FieldsetLabel
                label="Уязвимости"
                class="bg-default/20 transition-colors"
                :class="[
                  isEditMode
                    ? 'cursor-pointer border-error/30 hover:border-error/50'
                    : 'border-muted',
                ]"
                @click.left.exact.prevent="openDefensesModal('vulnerabilities')"
              >
                <div class="flex flex-wrap gap-1.5 p-2 pt-1">
                  <UBadge
                    v-for="key in localCreature.system.defenses.vulnerabilities"
                    :key="key"
                    :label="getDefenseLabel(key)"
                    color="error"
                    variant="subtle"
                    :ui="{
                      base: 'h-auto max-w-full',
                      label:
                        'whitespace-normal wrap-break-word text-left leading-tight',
                    }"
                  />

                  <span
                    v-if="
                      localCreature.system.defenses.vulnerabilities.length === 0
                    "
                    class="text-xs text-dimmed italic"
                  >
                    Нет
                  </span>
                </div>
              </FieldsetLabel>

              <FieldsetLabel
                label="Сопротивления"
                class="bg-default/20 transition-colors"
                :class="[
                  isEditMode
                    ? 'cursor-pointer border-info/30 hover:border-info/50'
                    : 'border-muted',
                ]"
                @click.left.exact.prevent="openDefensesModal('resistances')"
              >
                <div class="flex flex-wrap gap-1.5 p-2 pt-1">
                  <UBadge
                    v-for="key in localCreature.system.defenses.resistances"
                    :key="key"
                    :label="getDefenseLabel(key)"
                    color="info"
                    variant="subtle"
                    :ui="{
                      base: 'h-auto max-w-full',
                      label:
                        'whitespace-normal wrap-break-word text-left leading-tight',
                    }"
                  />

                  <span
                    v-if="
                      localCreature.system.defenses.resistances.length === 0
                    "
                    class="text-xs text-dimmed italic"
                  >
                    Нет
                  </span>
                </div>
              </FieldsetLabel>

              <FieldsetLabel
                label="Иммунитеты"
                class="bg-default/20 transition-colors"
                :class="[
                  isEditMode
                    ? 'cursor-pointer border-warning/30 hover:border-warning/50'
                    : 'border-muted',
                ]"
                @click.left.exact.prevent="openDefensesModal('immunities')"
              >
                <div class="flex flex-wrap gap-1.5 p-2 pt-1">
                  <UBadge
                    v-for="key in localCreature.system.defenses.immunities"
                    :key="key"
                    :label="getDefenseLabel(key)"
                    color="warning"
                    variant="subtle"
                    :ui="{
                      base: 'h-auto max-w-full',
                      label:
                        'whitespace-normal wrap-break-word text-left leading-tight',
                    }"
                  />

                  <span
                    v-if="localCreature.system.defenses.immunities.length === 0"
                    class="text-xs text-dimmed italic"
                  >
                    Нет
                  </span>
                </div>
              </FieldsetLabel>

              <FieldsetLabel
                label="Иммунитет к состояниям"
                class="bg-default/20 transition-colors"
                :class="[
                  isEditMode
                    ? 'cursor-pointer border-primary/30 hover:border-primary/50'
                    : 'border-muted',
                ]"
                @click.left.exact.prevent="isConditionImmunitiesOpen = true"
              >
                <div class="flex flex-wrap gap-1.5 p-2 pt-1">
                  <UBadge
                    v-for="key in localCreature.system.defenses
                      .conditionImmunities"
                    :key="key"
                    :label="getDefenseLabel(key)"
                    color="neutral"
                    variant="subtle"
                    :ui="{
                      base: 'h-auto max-w-full',
                      label:
                        'whitespace-normal wrap-break-word text-left leading-tight',
                    }"
                  />

                  <span
                    v-if="
                      localCreature.system.defenses.conditionImmunities.length
                      === 0
                    "
                    class="text-xs text-dimmed italic"
                  >
                    Нет
                  </span>
                </div>
              </FieldsetLabel>
              <!-- Навыки, Чувства и Языки -->
              <FieldsetLabel
                label="Спасброски"
                class="bg-default/20"
                :class="[isEditMode ? 'border-gold/30' : 'border-muted']"
              >
                <div class="px-2 pb-1">
                  <div class="grid grid-cols-2 gap-x-2 gap-y-1">
                    <div
                      v-for="ability in SAVING_THROW_ABILITIES"
                      :key="ability.key"
                      class="flex items-center gap-2 rounded p-1.5 transition-colors"
                      :class="[!isEditMode ? 'cursor-default' : '']"
                    >
                      <button
                        class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-accented"
                        :class="
                          creatureSavingThrows.includes(ability.key)
                            ? 'bg-inverted'
                            : 'bg-transparent'
                        "
                        @click.left.exact.prevent.stop="
                          toggleSavingThrow(ability.key)
                        "
                      >
                        <div
                          v-if="creatureSavingThrows.includes(ability.key)"
                          class="h-1.5 w-1.5 rounded-full bg-inverted"
                        />
                      </button>

                      <span
                        class="flex-1 truncate text-sm font-medium text-toned"
                        >{{ ability.shortLabel }}</span
                      >

                      <span
                        class="rounded border border-default bg-elevated px-2 py-0.5 text-sm font-bold text-highlighted shadow-sm"
                      >
                        {{ formatModifier(calculateSavingThrow(ability.key)) }}
                      </span>
                    </div>
                  </div>
                </div>
              </FieldsetLabel>

              <FieldsetLabel
                label="Навыки"
                class="bg-default/20 transition-colors"
                :class="[
                  isEditMode
                    ? 'cursor-pointer border-gold/30 hover:border-gold/50'
                    : 'border-muted',
                ]"
                @click.left.exact.prevent="openSkillsModal"
              >
                <div class="flex flex-wrap gap-1.5 p-2 pt-1">
                  <UBadge
                    v-for="skill in formattedSkills"
                    :key="skill"
                    :label="skill"
                    color="neutral"
                    variant="subtle"
                  />

                  <span
                    v-if="formattedSkills.length === 0"
                    class="text-xs text-dimmed italic"
                  >
                    Нет
                  </span>
                </div>
              </FieldsetLabel>

              <FieldsetLabel
                label="Восприятие"
                class="border-muted bg-default/20"
              >
                <div class="flex flex-col gap-1 p-2 pt-1 text-sm text-default">
                  <div class="flex items-center justify-between">
                    <span class="text-dimmed">Зрение:</span>

                    <span
                      >{{ localCreature.token?.vision?.range ?? 0 }} фт.</span
                    >
                  </div>

                  <div
                    v-if="localCreature.token?.vision?.darkvision"
                    class="flex items-center justify-between"
                  >
                    <span class="text-dimmed">Тёмное зрение:</span>

                    <span>{{ localCreature.token.vision.darkvision }} фт.</span>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-dimmed">Пассивное Внимание:</span>

                    <span class="font-bold text-highlighted">{{
                      passivePerception
                    }}</span>
                  </div>
                </div>
              </FieldsetLabel>

              <FieldsetLabel
                label="Языки"
                class="bg-default/20 transition-colors"
                :class="[
                  isEditMode
                    ? 'cursor-pointer border-gold/30 hover:border-gold/50'
                    : 'border-muted',
                ]"
                @click.left.exact.prevent="openLanguagesModal"
              >
                <div class="flex flex-wrap gap-1.5 p-2 pt-1">
                  <UBadge
                    v-for="language in localCreature.system.languages"
                    :key="language"
                    :label="language"
                    color="neutral"
                    variant="subtle"
                    :ui="{
                      base: 'h-auto max-w-full',
                      label:
                        'whitespace-normal wrap-break-word text-left leading-tight',
                    }"
                  />

                  <span
                    v-if="
                      !localCreature.system.languages
                      || localCreature.system.languages.length === 0
                    "
                    class="text-xs text-dimmed italic"
                  >
                    Нет
                  </span>
                </div>
              </FieldsetLabel>

              <FieldsetLabel
                label="Среда обитания"
                class="bg-default/20 transition-colors"
                :class="[
                  isEditMode
                    ? 'cursor-pointer border-success/30 hover:border-success/50'
                    : 'border-muted',
                ]"
                @click.left.exact.prevent="openEnvironmentsModal"
              >
                <div class="flex flex-col gap-1 p-2 pt-1">
                  <div class="flex flex-wrap gap-1.5">
                    <UBadge
                      v-for="env in localCreature.system.environments"
                      :key="env"
                      :label="
                        CREATURE_ENVIRONMENTS.find((entry) => entry.key === env)
                          ?.label || env
                      "
                      color="neutral"
                      variant="subtle"
                      :ui="{
                        base: 'h-auto max-w-full',
                        label:
                          'whitespace-normal wrap-break-word text-left leading-tight',
                      }"
                    />

                    <span
                      v-if="
                        (!localCreature.system.environments
                          || localCreature.system.environments.length === 0)
                        && !localCreature.system.customEnvironments
                      "
                      class="text-xs text-dimmed italic"
                    >
                      Нет
                    </span>
                  </div>

                  <div
                    v-if="localCreature.system.customEnvironments"
                    class="mt-1 text-sm text-toned"
                  >
                    <span class="mb-0.5 block text-xs text-dimmed"
                      >Особая:</span
                    >
                    {{ localCreature.system.customEnvironments }}
                  </div>
                </div>
              </FieldsetLabel>
            </div>

            <!-- Правая колонка -->
            <div class="flex min-w-0 flex-1 flex-col gap-4">
              <!-- Характеристики: 6 ячеек -->
              <CreatureAbilities
                :creature="localCreature"
                :is-edit-mode="isEditMode"
                @update:system="handleSystemUpdate"
              />

              <!-- Вкладки -->
              <div class="relative mt-2 flex flex-1 flex-col space-y-2">
                <div class="flex gap-4 border-b border-muted/30">
                  <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    :class="[
                      'relative pb-2 text-xs font-bold tracking-wider uppercase transition-colors',
                      activeTab === tab.id
                        ? 'border-b-2 border-gold text-gold'
                        : 'border-b-2 border-transparent text-muted hover:text-highlighted',
                    ]"
                    @click.left.exact.prevent="activeTab = tab.id"
                  >
                    {{ tab.label }}
                  </button>
                </div>

                <!-- Содержимое вкладок -->
                <div class="flex flex-1 flex-col space-y-3">
                  <!-- Действия -->
                  <template v-if="activeTab === 'actions'">
                    <CreatureActionsBlock
                      mode="action"
                      :actions="localCreature.system.actions"
                      :is-edit-mode="isEditMode"
                      :is-read-only="isReadOnly"
                      :creature-id="localCreature.id"
                      :creature-name="localCreature.name"
                      @update="handleActionsUpdate"
                    />

                    <CreatureActionsBlock
                      title="Бонусные действия"
                      mode="action"
                      :actions="localCreature.system.bonusActions"
                      :is-edit-mode="isEditMode"
                      :is-read-only="isReadOnly"
                      :creature-id="localCreature.id"
                      :creature-name="localCreature.name"
                      @update="handleBonusActionsUpdate"
                    />

                    <CreatureActionsBlock
                      title="Реакции"
                      mode="action"
                      :actions="localCreature.system.reactions"
                      :is-edit-mode="isEditMode"
                      :is-read-only="isReadOnly"
                      :creature-id="localCreature.id"
                      :creature-name="localCreature.name"
                      @update="handleReactionsUpdate"
                    />

                    <CreatureActionsBlock
                      v-if="
                        isEditMode
                        || localCreature.system.legendary.actions.length > 0
                      "
                      title="Легендарные действия"
                      mode="action"
                      :actions="localCreature.system.legendary.actions"
                      :is-edit-mode="isEditMode"
                      :is-read-only="isReadOnly"
                      :creature-id="localCreature.id"
                      :creature-name="localCreature.name"
                      :legendary-count="localCreature.system.legendary.count"
                      @update="handleLegendaryActionsUpdate"
                      @update:legendary-count="handleLegendaryCountUpdate"
                    />
                  </template>

                  <!-- Особенности -->
                  <template v-if="activeTab === 'traits'">
                    <CreatureActionsBlock
                      mode="trait"
                      :actions="localCreature.system.traits"
                      :is-edit-mode="isEditMode"
                      :is-read-only="isReadOnly"
                      :creature-id="localCreature.id"
                      :creature-name="localCreature.name"
                      @update="handleTraitsUpdate"
                    />
                  </template>

                  <!-- Заклинания -->
                  <template v-if="activeTab === 'spells'">
                    <CreatureSpellsBlock
                      :creature="localCreature"
                      :spells="localCreature.spells"
                      :spellcasting="localCreature.system.spellcasting"
                      :is-edit-mode="isEditMode"
                      :is-read-only="isReadOnly"
                      :creature-id="localCreature.id"
                      :creature-name="localCreature.name"
                      @update:spells="handleSpellsUpdate"
                      @update:spellcasting="handleSpellcastingUpdate"
                    />
                  </template>

                  <!-- Эффекты -->
                  <template v-if="activeTab === 'effects'">
                    <CreatureEffectsBlock
                      :creature="localCreature"
                      :is-edit-mode="isEditMode"
                      @update:creature="handleCreatureUpdate"
                      @immediate-save="handleSave"
                    />
                  </template>

                  <!-- Описание -->
                  <template v-if="activeTab === 'description'">
                    <RichTextEditor
                      v-if="isEditMode"
                      :model-value="localCreature.description ?? ''"
                      placeholder="Описание существа..."
                      @update:model-value="handleCreatureDescriptionUpdate"
                    />

                    <div
                      v-else
                      class="min-h-[200px] rounded-lg bg-accented/30"
                    >
                      <ItemDescriptionRenderer
                        v-if="localCreature.description"
                        :content="localCreature.description"
                        class="p-4"
                      />

                      <p
                        v-else
                        class="p-4 text-sm text-dimmed"
                      >
                        Нет описания
                      </p>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDraggableModal>

  <!-- Модалка подтверждения -->
  <UDraggableModal
    v-model:open="isConfirmOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="400"
    :min-height="160"
    :z-index="Z_INDEX.MODAL_ELEVATED"
    title="Несохранённые изменения"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-toned">
          У вас есть несохранённые изменения. Что сделать?
        </p>

        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click.left.exact.prevent="onConfirmCancel"
          >
            Отмена
          </UButton>

          <UButton
            variant="ghost"
            color="error"
            size="sm"
            @click.left.exact.prevent="onConfirmDiscard"
          >
            Отменить изменения
          </UButton>

          <UButton
            color="primary"
            size="sm"
            @click.left.exact.prevent="onConfirmSave"
          >
            Сохранить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>

  <!-- Языки -->
  <LanguageProficiencyModal
    v-if="localCreature"
    v-model:open="isLanguagesOpen"
    :selected="localCreature.system.languages || []"
    @apply="onLanguagesApply"
  />

  <!-- Навыки -->
  <CreatureSkillsModal
    v-if="localCreature"
    v-model:open="isSkillsOpen"
    :creature="localCreature"
    @apply="onSkillsApply"
  />

  <!-- Защиты -->
  <CreatureDefensesModal
    v-if="localCreature"
    v-model:open="isDefensesOpen"
    :category="activeDefenseCategory"
    :selected="
      (localCreature.system.defenses[activeDefenseCategory] as string[]) || []
    "
    @apply="onDefensesApply"
  />

  <CreatureConditionImmunitiesModal
    v-if="localCreature"
    v-model:open="isConditionImmunitiesOpen"
    :selected="
      (localCreature.system.defenses.conditionImmunities as string[]) || []
    "
    @apply="onConditionImmunitiesApply"
  />

  <CreatureEnvironmentsModal
    v-if="localCreature"
    v-model:open="isEnvironmentsOpen"
    :environments="localCreature.system.environments ?? []"
    :custom-environments="localCreature.system.customEnvironments ?? ''"
    @apply="onEnvironmentsApply"
  />
</template>
