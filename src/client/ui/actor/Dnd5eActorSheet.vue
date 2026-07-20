<script setup lang="ts">
  import type {
    AbilityType,
    SkillType,
    TypedWebSocketClient,
  } from '@vtt/shared';
  import type {
    Actor,
    BackgroundDefinition,
    ClassCounterDefinition,
    ClassDefinition,
    GameItem,
    LongRestOptions,
    RestType,
    ShortRestHitDiceResult,
    SpeciesDefinition,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type { AppliedFeatFeature } from './feat/featApply';

  import { useToast } from '@nuxt/ui/composables';
  import { generateId } from '@vtt/shared';
  import {
    applyActorRest,
    applyShortRestWithHitDice,
    calculateAbilityModifier,
    calculateMaxHP,
    computeSpeciesDarkvision,
    computeSpeciesMovement,
    DEFAULT_ACTOR,
    getTotalLevel,
    MULTICLASS_PROFICIENCIES,
    normalizeActor,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, toRef, watch } from 'vue';

  import { ClientHooks } from '@/core/clientHooks';
  import { loadCompendiumKind } from '@/core/compendiumDataClient';
  import { generateEntityId, requireSocket } from '@/core/entityUtils';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useActiveTab } from '@/shared_ui/composables/useActiveTab';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { Z_INDEX } from '@/shared_ui/consts';
  import { useItemsStore } from '@/stores/itemsStore';
  import { useWorldStore } from '@/stores/worldStore';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import ActorCenterPanel from './ActorCenterPanel.vue';
  import ActorHeader from './ActorHeader.vue';
  import ActorLeftPanel from './ActorLeftPanel.vue';
  import ActorRightPanel from './ActorRightPanel.vue';
  import ActorTabs from './ActorTabs.vue';
  import BackgroundSetupWizard from './background/BackgroundSetupWizard.vue';
  import ClassSetupWizard from './class/ClassSetupWizard.vue';
  import {
    BACKGROUND_DEFINITION_MIME,
    CLASS_DEFINITION_MIME,
    GAME_FEATURE_MIME,
    GAME_ITEM_MIME,
    SPECIES_DEFINITION_MIME,
    SPELL_MIME,
  } from './constants';
  import { applyFeatToActor, resolveFeatGrantedSpells } from './feat/featApply';
  import LongRestModal from './LongRestModal.vue';
  import ShortRestModal from './ShortRestModal.vue';
  import SpeciesSetupWizard from './species/SpeciesSetupWizard.vue';

  interface Props {
    open: boolean;
    actorId?: string;
    worldId: string;
    actors: Actor[];
    socket: TypedWebSocketClient | null;
    zIndex?: number;
    modalId?: string;
    isAdmin?: boolean;
    users?: Array<{ id: string; username: string; role: string }>;
    worldPort?: number;
    savedPosition?: { x: number; y: number };
    savedSize?: { width: number; height: number };
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'save': [actor: Actor];
    'close': [];
    'bring-to-front': [];
  }>();

  const worldStore = useWorldStore();
  const systemDataStore = useSystemDataStore();
  const itemsStore = useItemsStore();
  const toast = useToast();
  const { openModal, updateModalProps } = useModalManager();

  // Состояние
  const isEditMode = ref(false);
  const localActor = ref<Actor | null>(null);
  const savedSnapshot = ref<Actor | null>(null); // Снимок для отката изменений
  const isDirty = ref(false);
  const isSaving = ref(false);
  const isCreated = ref(false); // Флаг: персонаж уже создан на сервере

  // Модалка подтверждения
  const isConfirmOpen = ref(false);
  const pendingAction = ref<'close' | null>(null);

  // Модалка мастера классов
  const isClassWizardOpen = ref(false);
  const droppedClassDef = ref<ClassDefinition | null>(null);

  // Модалка мастера видов
  const isSpeciesWizardOpen = ref(false);

  const droppedSpeciesDef = ref<SpeciesDefinition | null>(null);

  // Модалка мастера предыстории
  const isBackgroundWizardOpen = ref(false);
  const droppedBackgroundDef = ref<BackgroundDefinition | null>(null);

  // Модалка подтверждения замены вида/предыстории
  const isReplaceConfirmOpen = ref(false);
  const replaceConfirmTarget = ref<'species' | 'background' | null>(null);

  /**
   * Определение последнего применённого вида.
   * Сохраняется после каждого применения вида для корректного отката при смене.
   */
  const appliedSpeciesDef = ref<SpeciesDefinition | null>(null);

  // Очередь для последовательного повышения уровней (Wizard)
  const wizardQueue = ref<Array<{ classKey: string; targetLevel: number }>>([]);

  // Drag and Drop refs
  const isSpellDragOver = ref(false);
  const isEquipmentDragOver = ref(false);
  const isFeatureDragOver = ref(false);

  const { activeTab } = useActiveTab(
    'actor-sheet',
    toRef(() => localActor.value?.id),
    'equipment',
  );

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function isClassDefinition(value: unknown): value is ClassDefinition {
    return isRecord(value) && value.type === 'class';
  }

  function isSpeciesDefinition(value: unknown): value is SpeciesDefinition {
    return isRecord(value) && value.type === 'species';
  }

  function isBackgroundDefinition(
    value: unknown,
  ): value is BackgroundDefinition {
    return isRecord(value) && value.type === 'background';
  }

  /** Определения классов компендиума (все паки), загружены с сервера */
  const compendiumClassDefinitions = ref<ClassDefinition[]>([]);

  /**
   * Итоговый список классов: компендиум + созданные в мире (items.db).
   * Используется мастером класса (драг/повышение уровня), счётчиками классовых
   * ресурсов и сборкой владений.
   */
  const classDefinitions = ref<ClassDefinition[]>([]);

  /** Определения видов компендиума (все паки), загружены с сервера */
  const compendiumSpeciesDefinitions = ref<SpeciesDefinition[]>([]);

  /**
   * Итоговый список видов: компендиум + созданные в мире (items.db).
   * Используется для отката при смене вида и (через systemDataStore) для
   * выбора вариантов особенностей на листе актёра.
   */
  const speciesDefinitions = ref<SpeciesDefinition[]>([]);

  /**
   * Классы, созданные в мире (GameItem с type==='class'), развёрнутые в плоский
   * ClassDefinition из вложенного classData.
   *
   * @returns массив определений классов мира
   */
  function getWorldClassDefinitions(): ClassDefinition[] {
    return itemsStore.items
      .filter((worldItem) => worldItem.type === 'class')
      .map((worldItem) => worldItem.classData)
      .filter((definition): definition is ClassDefinition =>
        isClassDefinition(definition),
      );
  }

  /**
   * Пересобирает итоговый список классов из кеша компендиума и классов мира
   * (компендиум приоритетен при совпадении ключей — копия SRD-класса получает
   * новый ключ и не перекрывает оригинал).
   */
  function rebuildClassDefinitions(): void {
    const merged = [...compendiumClassDefinitions.value];

    for (const worldClass of getWorldClassDefinitions()) {
      if (!merged.some((definition) => definition.key === worldClass.key)) {
        merged.push(worldClass);
      }
    }

    classDefinitions.value = merged;
  }

  /**
   * Загружает определения классов компендиума с сервера (агрегировано по всем
   * пакам: бандл + скачиваемые + модули) и пересобирает итоговый список вместе
   * с классами мира.
   *
   * @returns массив определений классов
   */
  async function loadClassDefinitions(): Promise<ClassDefinition[]> {
    if (props.socket) {
      const entries = await loadCompendiumKind(props.socket, 'class');

      compendiumClassDefinitions.value = entries.filter(isClassDefinition);
    }

    rebuildClassDefinitions();

    return classDefinitions.value;
  }

  // Классы мира приходят/меняются асинхронно (открытие панели предметов,
  // live-sync, правки) — пересобираем итоговый список при любых изменениях.
  watch(getWorldClassDefinitions, () => rebuildClassDefinitions(), {
    deep: true,
  });

  /**
   * Виды, созданные в мире (GameItem с type==='species'), развёрнутые в
   * плоский SpeciesDefinition из вложенного speciesData.
   *
   * @returns массив определений видов мира
   */
  function getWorldSpeciesDefinitions(): SpeciesDefinition[] {
    return itemsStore.items
      .filter((worldItem) => worldItem.type === 'species')
      .map((worldItem) => worldItem.speciesData)
      .filter((definition): definition is SpeciesDefinition =>
        isSpeciesDefinition(definition),
      );
  }

  /**
   * Пересобирает итоговый список видов из кеша компендиума и видов мира
   * (компендиум приоритетен при совпадении ключей) и синхронизирует его с
   * systemDataStore — оттуда лист берёт варианты особенностей.
   */
  function rebuildSpeciesDefinitions(): void {
    const merged = [...compendiumSpeciesDefinitions.value];

    for (const worldSpecies of getWorldSpeciesDefinitions()) {
      if (!merged.some((definition) => definition.key === worldSpecies.key)) {
        merged.push(worldSpecies);
      }
    }

    speciesDefinitions.value = merged;
    systemDataStore.setSpeciesDefinitions(merged);
  }

  /**
   * Загружает определения видов компендиума с сервера и пересобирает итоговый
   * список (вместе с видами мира).
   *
   * @returns массив определений видов
   */
  async function loadSpeciesDefinitions(): Promise<SpeciesDefinition[]> {
    if (props.socket) {
      // CompendiumEntry[] расширяем до unknown[], т.к. SpeciesDefinition не
      // подтип CompendiumEntry и guard иначе не сузит при filter.
      const entries: unknown[] = await loadCompendiumKind(
        props.socket,
        'species',
      );

      compendiumSpeciesDefinitions.value = entries.filter(isSpeciesDefinition);
    }

    rebuildSpeciesDefinitions();

    return speciesDefinitions.value;
  }

  // Виды мира приходят/меняются асинхронно (открытие панели предметов,
  // live-sync, правки) — пересобираем итоговый список при любых изменениях.
  watch(getWorldSpeciesDefinitions, () => rebuildSpeciesDefinitions(), {
    deep: true,
  });

  /**
   * Загружает определение текущего вида актора для отката при смене.
   *
   * @param actorData - актор с существующим видом
   */
  async function loadCurrentSpeciesDefinition(actorData: Actor): Promise<void> {
    const speciesKey = actorData.system.species?.speciesKey;

    if (!speciesKey) {
      return;
    }

    const definitions = await loadSpeciesDefinitions();

    const found =
      definitions.find((definition) => definition.key === speciesKey) ?? null;

    if (found) {
      appliedSpeciesDef.value = found;
    }
  }

  // Предзагрузка определений компендиума при появлении сокета (и смене мира).
  watch(
    () => props.socket,
    (socket) => {
      if (socket) {
        void loadClassDefinitions();
        void loadSpeciesDefinitions();
      }
    },
    { immediate: true },
  );

  const confirmMessage = 'Сохранить изменения перед закрытием?';

  // Computed
  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const currentUser = computed(() => {
    if (!props.worldId || !worldStore.connectionState.loggedAsUserId) {
      return null;
    }

    const world = worldStore.getWorldById(props.worldId);

    if (!world) {
      return null;
    }

    return world.users.find(
      (user) => user.id === worldStore.connectionState.loggedAsUserId,
    );
  });

  const isAdmin = computed(() => {
    if (props.isAdmin !== undefined) {
      return props.isAdmin;
    }

    return worldStore.isGM;
  });

  const isOwner = computed(() => {
    if (!localActor.value) {
      return false;
    }

    return localActor.value.ownerId === currentUser.value?.id;
  });

  const canEdit = computed(() => {
    return isAdmin.value || isOwner.value;
  });

  /**
   * Собирает определения счётчиков из компендиума для всех классов актора.
   * Используется для отображения name, icon, recovery в ClassCounters.
   */
  const counterDefinitions = computed((): ClassCounterDefinition[] => {
    if (!localActor.value) {
      return [];
    }

    const classes = localActor.value.system.classes;

    if (!classes || classes.length === 0) {
      return [];
    }

    const classDefs = classDefinitions.value;
    const result: ClassCounterDefinition[] = [];

    for (const classEntry of classes) {
      const classDef = classDefs.find(
        (definition) => definition.key === classEntry.classKey,
      );

      if (!classDef) {
        continue;
      }

      if (classDef.counters) {
        for (const counter of classDef.counters) {
          if (classEntry.level >= counter.startLevel) {
            result.push(counter);
          }
        }
      }

      if (classDef.subclasses) {
        const subclassKeys = new Set<string>();

        if (classEntry.subclassKey) {
          subclassKeys.add(classEntry.subclassKey);
        }

        for (const counter of localActor.value.system.classCounters ?? []) {
          if (counter.classKey === classEntry.classKey && counter.subclassKey) {
            subclassKeys.add(counter.subclassKey);
          }
        }

        for (const subclassKey of subclassKeys) {
          const subclass = classDef.subclasses.find(
            (entry) => entry.key === subclassKey,
          );

          if (subclass?.counters) {
            for (const counter of subclass.counters) {
              if (classEntry.level >= counter.startLevel) {
                result.push(counter);
              }
            }
          }
        }
      }
    }

    return result;
  });

  function initializeActor() {
    if (props.actorId) {
      const world = worldStore.getWorldById(props.worldId);

      let actor: Actor | undefined;

      if (world) {
        actor = world.actors.find(
          (actorEntry: Actor) => actorEntry.id === props.actorId,
        );
      } else {
        // Веб версия - используем props.actors
        actor = props.actors.find(
          (actorEntry: Actor) => actorEntry.id === props.actorId,
        );
      }

      if (actor) {
        localActor.value = normalizeActor(JSON.parse(JSON.stringify(actor)));

        isEditMode.value = false;

        // Загружаем определение текущего вида для отката при смене
        void loadCurrentSpeciesDefinition(actor);
      } else {
        console.error('[ActorModal] Actor not found with id:', props.actorId);
      }
    } else {
      const newId = generateEntityId('actor');

      const newActor: Actor = {
        ...DEFAULT_ACTOR,
        id: newId,
        ownerId: !isAdmin.value ? currentUser.value?.id : undefined,
      };

      localActor.value = newActor;
      isEditMode.value = true;
    }

    isDirty.value = false;
  }

  const storeActor = computed(() => {
    if (!props.actorId || !props.worldId) {
      return null;
    }

    const world = worldStore.getWorldById(props.worldId);

    if (!world) {
      return props.actors.find(
        (actorEntry: Actor) => actorEntry.id === props.actorId,
      );
    }

    return world.actors.find(
      (actorEntry: Actor) => actorEntry.id === props.actorId,
    );
  });

  watch(
    () => storeActor.value,
    (newActor, oldActor) => {
      // Если актера удалили, закрываем модалку
      if (oldActor && !newActor) {
        isOpen.value = false;
        emit('close');
      }
    },
  );

  watch(
    () => storeActor.value?.token,
    (newToken) => {
      if (localActor.value && newToken) {
        localActor.value.token = JSON.parse(JSON.stringify(newToken));
      }
    },
    { deep: true },
  );

  /**
   * Синхронизация изменяемых извне разделов актёра из store в localActor:
   * equipment (передача предметов между токенами), system (HP, слоты, размер)
   * и spells (редактирование заклинаний, в т.ч. из других окон).
   *
   * Зачем: localActor — глубокая копия на момент открытия листа, а все
   * сохранения отправляют актёра ЦЕЛИКОМ (`actor:updated`). Без обратной
   * синхронизации любое сохранение листа затирало бы на сервере изменения,
   * пришедшие извне после открытия (потерянное обновление — так «слетали»
   * формулы заклинаний).
   *
   * В режиме редактирования синхронизация выключена: локальные правки имеют
   * приоритет до «Сохранить»/«Отменить». Цикл store → localActor → store
   * не возникает: присваивание в localActor ничего не отправляет на сервер —
   * emit происходит только в явных обработчиках сохранения.
   */
  watch(
    [
      () => storeActor.value?.equipment,
      () => storeActor.value?.system,
      () => storeActor.value?.spells,
      () => storeActor.value?.activeEffects,
    ],
    ([newEquipment, newSystem, newSpells, newActiveEffects]) => {
      if (!localActor.value || isEditMode.value) {
        return;
      }

      if (newEquipment) {
        localActor.value.equipment = JSON.parse(JSON.stringify(newEquipment));
      }

      if (newSystem) {
        localActor.value.system = JSON.parse(JSON.stringify(newSystem));
      }

      if (newSpells) {
        localActor.value.spells = JSON.parse(JSON.stringify(newSpells));
      }

      // Активные эффекты тоже меняются извне (каст самобаффа из хотбара/другого
      // окна добавляет эффект через worldStore) — без синхронизации открытый
      // лист показывал бы устаревшие КД/эффекты, а сохранение листа затёрло бы
      // их на сервере.
      if (newActiveEffects) {
        localActor.value.activeEffects = JSON.parse(
          JSON.stringify(newActiveEffects),
        );
      }
    },
    { deep: true },
  );

  function handleActorUpdate(updates: Partial<Actor>) {
    if (localActor.value) {
      Object.assign(localActor.value, updates);
      isDirty.value = true;

      if (!isEditMode.value) {
        handleImmediateSave();
      }
    }
  }

  /**
   * Немедленное сохранение актёра на сервер (для действий вне режима редактирования:
   * drop в снаряжение, экипировка, удаление)
   */
  function handleImmediateSave() {
    if (!localActor.value || !props.socket) {
      return;
    }

    try {
      requireSocket(props.socket);

      props.socket.emit('actor:updated', localActor.value);
      isDirty.value = false;
    } catch (error) {
      console.error('[ActorModal] Immediate save failed:', error);
    }
  }

  /** Открыта ли модалка короткого отдыха (трата костей хитов) */
  const isShortRestOpen = ref(false);

  /** Открыта ли модалка продолжительного отдыха (предпросмотр восстановления) */
  const isLongRestOpen = ref(false);

  /** Модификатор Телосложения актёра (для броска костей хитов) */
  const constitutionModifier = computed(() =>
    calculateAbilityModifier(
      localActor.value?.system.abilities?.constitution ?? 10,
    ),
  );

  /**
   * Применяет отдых к актёру. Оба типа отдыха открывают модалку: короткий —
   * для траты костей хитов, долгий — для предпросмотра восстановления.
   * @param restType - тип отдыха
   */
  function handleRest(restType: RestType): void {
    if (!localActor.value) {
      return;
    }

    if (restType === 'short') {
      isShortRestOpen.value = true;

      return;
    }

    isLongRestOpen.value = true;
  }

  /**
   * Завершает продолжительный отдых: восстанавливает хиты, ячейки, заряды и
   * кости хитов (половину по правилам или все — по выбору в модалке).
   * @param options - параметры долгого отдыха из модалки
   */
  function handleLongRestApply(options: LongRestOptions): void {
    if (!localActor.value) {
      return;
    }

    handleActorUpdate(applyActorRest(localActor.value, 'long', options));

    toast.add({
      title: 'Продолжительный отдых',
      description: 'Ячейки, заряды, ресурсы, кости и хиты восстановлены.',
      color: 'success',
    });
  }

  /**
   * Завершает короткий отдых: накладывает результат броска костей хитов
   * (лечение + потраченные кости) на восстановление коротких ресурсов.
   * @param result - результат броска костей хитов из модалки
   */
  function handleShortRestApply(result: ShortRestHitDiceResult): void {
    if (!localActor.value) {
      return;
    }

    handleActorUpdate(applyShortRestWithHitDice(localActor.value, result));

    toast.add({
      title: 'Короткий отдых',
      description: 'Пактовые ячейки, короткие ресурсы и заряды восстановлены.',
      color: 'success',
    });
  }

  function toggleEditMode() {
    if (!canEdit.value) {
      return;
    }

    if (!isEditMode.value) {
      if (localActor.value) {
        savedSnapshot.value = JSON.parse(JSON.stringify(localActor.value));
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

  function openSettings() {
    const world = worldStore.getWorldById(props.worldId);

    let users: Array<{ id: string; username: string; role: string }> = [];

    if (props.users && props.users.length > 0) {
      users = props.users;
    } else if (world?.users) {
      users = world.users;
    }

    openModal('ActorSettingsModal', {
      actorId: props.actorId,
      actorData: localActor.value, // Передаем текущие данные
      onSave: (updates: Partial<Actor>) => {
        // Обновляем локальное состояние при сохранении в модалке
        if (localActor.value) {
          Object.assign(localActor.value, updates);
          isDirty.value = true;
        }
      },
      onDelete: () => {
        isOpen.value = false;
      },
      isAdmin: isAdmin.value,
      worldId: props.worldId,
      users,
      socket: props.socket,
      // Фолбэк на порт из мира: если опенер не передал worldPort,
      // файловый менеджер в настройках всё равно получит сервер мира
      worldPort: props.worldPort ?? world?.port,
      zIndex: (props.zIndex || 10000) + 10,
    });
  }

  function handleSave() {
    if (!localActor.value || isSaving.value) {
      return;
    }

    if (!localActor.value.name || localActor.value.name.trim() === '') {
      toast.add({
        title: 'Ошибка валидации',
        description: 'Имя персонажа обязательно',
        color: 'error',
      });

      return;
    }

    isSaving.value = true;

    try {
      requireSocket(props.socket);

      if (props.actorId) {
        const cleanActor = JSON.parse(JSON.stringify(localActor.value));

        props.socket.emit('actor:updated', cleanActor);
      } else {
        const rawLocalActor = JSON.parse(JSON.stringify(localActor.value));

        const newActor: Actor = {
          ...rawLocalActor,
          id: rawLocalActor?.id || generateEntityId('actor'),
        };

        props.socket.emit('actor:created', newActor);
        emit('save', newActor);
        isCreated.value = true;

        if (props.modalId) {
          updateModalProps(props.modalId, { actorId: newActor.id });
        }
      }

      toast.add({
        title: 'Успешно',
        description:
          props.actorId || isCreated.value
            ? 'Персонаж обновлен'
            : 'Персонаж создан',
        color: 'success',
      });

      isDirty.value = false;
      savedSnapshot.value = null;
      isEditMode.value = false;
    } catch (error) {
      console.error('Failed to save actor:', error);

      toast.add({
        title: 'Ошибка сохранения',
        description:
          error instanceof Error
            ? error.message
            : 'Не удалось сохранить персонажа',
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

  /**
   * Отмена в модалке подтверждения
   */
  function onConfirmCancel() {
    isConfirmOpen.value = false;
    pendingAction.value = null;
  }

  /**
   * Сохранить и выполнить отложенное действие
   */
  function onConfirmSave() {
    isConfirmOpen.value = false;
    pendingAction.value = null;
    handleSave();
    isOpen.value = false;
  }

  /**
   * Отменить изменения и выполнить отложенное действие
   */
  function onConfirmDiscard() {
    isConfirmOpen.value = false;
    pendingAction.value = null;

    if (savedSnapshot.value) {
      localActor.value = JSON.parse(JSON.stringify(savedSnapshot.value));
    }

    isDirty.value = false;
    isOpen.value = false;
  }

  /**
   * Заголовок модалки подтверждения замены вида/предыстории
   */
  const replaceConfirmTitle = computed(() => {
    return replaceConfirmTarget.value === 'species'
      ? 'Замена вида'
      : 'Замена предыстории';
  });

  /**
   * Текст предупреждения о замене вида/предыстории
   */
  const replaceConfirmMessage = computed(() => {
    if (!localActor.value) {
      return '';
    }

    if (replaceConfirmTarget.value === 'species') {
      const currentSpeciesName =
        localActor.value.system.species?.speciesName ?? '';

      const newSpeciesName = droppedSpeciesDef.value?.name ?? '';

      return `У персонажа уже есть вид «${currentSpeciesName}». Если применить вид «${newSpeciesName}», всё связанное с текущим видом (владения, особенности, тёмное зрение, размер и скорость) будет удалено.`;
    }

    if (replaceConfirmTarget.value === 'background') {
      const currentBackgroundName =
        localActor.value.system.background?.backgroundName ?? '';

      const newBackgroundName = droppedBackgroundDef.value?.name ?? '';

      return `У персонажа уже есть предыстория «${currentBackgroundName}». Если применить предысторию «${newBackgroundName}», всё связанное с текущей предысторией (бонусы характеристик, навыки, инструменты и черта) будет удалено.`;
    }

    return '';
  });

  /**
   * Подтверждение замены: открывает мастер настройки нового вида/предыстории
   */
  function onReplaceConfirm() {
    if (replaceConfirmTarget.value === 'species') {
      isSpeciesWizardOpen.value = true;
    } else if (replaceConfirmTarget.value === 'background') {
      isBackgroundWizardOpen.value = true;
    }

    isReplaceConfirmOpen.value = false;
    replaceConfirmTarget.value = null;
  }

  /**
   * Отмена замены вида/предыстории
   */
  function onReplaceCancel() {
    if (replaceConfirmTarget.value === 'species') {
      droppedSpeciesDef.value = null;
    } else if (replaceConfirmTarget.value === 'background') {
      droppedBackgroundDef.value = null;
    }

    isReplaceConfirmOpen.value = false;
    replaceConfirmTarget.value = null;
  }

  // --- Drag and Drop классов ---

  function isDroppedGameItem(value: unknown): value is GameItem {
    return (
      isRecord(value)
      && typeof value.id === 'string'
      && typeof value.name === 'string'
      && typeof value.description === 'string'
      && typeof value.type === 'string'
    );
  }

  /** Гард перетаскиваемой черты (несёт featData/activeEffects). */
  function isAppliedFeatFeature(value: unknown): value is AppliedFeatFeature {
    return (
      isRecord(value)
      && typeof value.name === 'string'
      && typeof value.description === 'string'
    );
  }

  let dragLeaveTimeout: number | undefined;

  function handleDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types) {
      return;
    }

    const types = Array.from(event.dataTransfer.types);

    const isClass = types.includes(CLASS_DEFINITION_MIME);
    const isSpecies = types.includes(SPECIES_DEFINITION_MIME);
    const isBackground = types.includes(BACKGROUND_DEFINITION_MIME);
    const isSpell = types.includes(SPELL_MIME);
    const isEquipment = types.includes(GAME_ITEM_MIME);
    const isFeature = types.includes(GAME_FEATURE_MIME);

    if (
      isClass
      || isSpecies
      || isBackground
      || isSpell
      || isEquipment
      || isFeature
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';

      if (isSpell) {
        isSpellDragOver.value = true;
      }

      if (isEquipment) {
        isEquipmentDragOver.value = true;
      }

      if (isFeature) {
        isFeatureDragOver.value = true;
      }

      window.clearTimeout(dragLeaveTimeout);

      dragLeaveTimeout = window.setTimeout(() => {
        isSpellDragOver.value = false;
        isEquipmentDragOver.value = false;
        isFeatureDragOver.value = false;
      }, 100);
    }
  }

  function handleDragLeave() {
    isSpellDragOver.value = false;
    isEquipmentDragOver.value = false;
    isFeatureDragOver.value = false;
  }

  function handleDrop(event: DragEvent) {
    isSpellDragOver.value = false;
    isEquipmentDragOver.value = false;
    isFeatureDragOver.value = false;

    if (!canEdit.value || !event.dataTransfer) {
      return;
    }

    const classDataStr = event.dataTransfer.getData(CLASS_DEFINITION_MIME);
    const speciesDataStr = event.dataTransfer.getData(SPECIES_DEFINITION_MIME);

    const backgroundDataStr = event.dataTransfer.getData(
      BACKGROUND_DEFINITION_MIME,
    );

    const spellData = event.dataTransfer.getData(SPELL_MIME);
    const equipData = event.dataTransfer.getData(GAME_ITEM_MIME);
    const featureData = event.dataTransfer.getData(GAME_FEATURE_MIME);

    if (classDataStr) {
      try {
        const parsedClassDefinition: unknown = JSON.parse(classDataStr);

        if (!isClassDefinition(parsedClassDefinition)) {
          throw new Error('Dropped class definition has invalid shape');
        }

        droppedClassDef.value = parsedClassDefinition;
        wizardQueue.value = []; // Сбрасываем очередь при драг-н-дропе
        isClassWizardOpen.value = true;
        event.preventDefault();
        event.stopPropagation();
      } catch (error) {
        console.error('Failed to parse dropped class definition', error);
      }
    } else if (speciesDataStr) {
      try {
        const parsedSpeciesDefinition: unknown = JSON.parse(speciesDataStr);

        if (!isSpeciesDefinition(parsedSpeciesDefinition)) {
          throw new Error('Dropped species definition has invalid shape');
        }

        droppedSpeciesDef.value = parsedSpeciesDefinition;

        if (localActor.value?.system.species) {
          replaceConfirmTarget.value = 'species';
          isReplaceConfirmOpen.value = true;
        } else {
          isSpeciesWizardOpen.value = true;
        }

        event.preventDefault();
        event.stopPropagation();
      } catch (error) {
        console.error('Failed to parse dropped species definition', error);
      }
    } else if (backgroundDataStr) {
      try {
        const parsedBackgroundDefinition: unknown =
          JSON.parse(backgroundDataStr);

        if (!isBackgroundDefinition(parsedBackgroundDefinition)) {
          throw new Error('Dropped background definition has invalid shape');
        }

        droppedBackgroundDef.value = parsedBackgroundDefinition;

        if (localActor.value?.system.background) {
          replaceConfirmTarget.value = 'background';
          isReplaceConfirmOpen.value = true;
        } else {
          isBackgroundWizardOpen.value = true;
        }

        event.preventDefault();
        event.stopPropagation();
      } catch (error) {
        console.error('Failed to parse dropped background definition', error);
      }
    } else if (spellData) {
      try {
        const droppedSpell = JSON.parse(spellData) as Spell;

        if (localActor.value) {
          const alreadyExists = (localActor.value.spells ?? []).some(
            (spell) => spell.name === droppedSpell.name,
          );

          if (!alreadyExists) {
            const newSpell: Spell = {
              ...droppedSpell,
              id: generateId('spell'),
              prepared: false,
            };

            localActor.value.spells = [
              ...(localActor.value.spells ?? []),
              newSpell,
            ];

            isDirty.value = true;

            if (!isEditMode.value) {
              handleImmediateSave();
            }

            activeTab.value = 'spells';
          }
        }

        event.preventDefault();
        event.stopPropagation();
      } catch {}
    } else if (equipData) {
      try {
        const parsedItem: unknown = JSON.parse(equipData);

        if (!isDroppedGameItem(parsedItem)) {
          return;
        }

        if (localActor.value) {
          const alreadyExists = localActor.value.equipment.some(
            (item) => item.id === parsedItem.id,
          );

          if (!alreadyExists) {
            const newItem: GameItem = {
              ...parsedItem,
              id: generateId('eq'),
              isReadOnly: false,
              equipped: false,
            };

            localActor.value.equipment = [
              ...localActor.value.equipment,
              newItem,
            ];

            isDirty.value = true;

            if (!isEditMode.value) {
              handleImmediateSave();
            }

            activeTab.value = 'equipment';
          }
        }

        event.preventDefault();
        event.stopPropagation();
      } catch {}
    } else if (featureData) {
      try {
        const parsedFeat: unknown = JSON.parse(featureData);

        if (!isAppliedFeatFeature(parsedFeat)) {
          return;
        }

        const droppedFeat = parsedFeat;

        if (localActor.value) {
          const alreadyExists =
            !droppedFeat.repeatable
            && localActor.value.features.some(
              (feature) =>
                feature.featureType === 'feat'
                && feature.name === droppedFeat.name,
            );

          if (!alreadyExists) {
            void applyDroppedFeat(droppedFeat);
          }
        }

        event.preventDefault();
        event.stopPropagation();
      } catch {}
    }
  }

  /**
   * Применяет перетащенную черту к актору: резолвит выдаваемые заклинания через
   * компендиум, затем добавляет особенность-черту, выдаёт заклинания, переносит
   * активные эффекты и владения. Резолв асинхронный — особенность появляется
   * после загрузки компендиума (обычно из кеша, мгновенно).
   *
   * @param droppedFeat - перетащенная черта (с featData/activeEffects)
   */
  async function applyDroppedFeat(
    droppedFeat: AppliedFeatFeature,
  ): Promise<void> {
    if (!localActor.value) {
      return;
    }

    const resolved = await resolveFeatGrantedSpells(props.socket, droppedFeat);

    if (!localActor.value) {
      return;
    }

    const result = applyFeatToActor(localActor.value, droppedFeat, resolved);

    localActor.value.features = result.features;
    localActor.value.spells = result.spells;
    localActor.value.activeEffects = result.activeEffects;
    localActor.value.system.proficiencies = result.proficiencies;

    if (result.token) {
      localActor.value.token = result.token;
    }

    isDirty.value = true;

    if (!isEditMode.value) {
      handleImmediateSave();
    }

    activeTab.value = 'features';
  }

  // --- Последовательное повышение уровня (Wizard) ---

  async function processNextWizardStep(): Promise<void> {
    if (wizardQueue.value.length === 0) {
      isClassWizardOpen.value = false;

      return;
    }

    const nextStep = wizardQueue.value[0];

    // Определения классов агрегированы сервером по всем пакам (loadCompendiumKind
    // кеширует — повторные шаги мастера не делают лишних запросов).
    const classes = await loadClassDefinitions();

    const targetDef =
      classes.find(
        (classDefinition) => classDefinition.key === nextStep.classKey,
      ) ?? null;

    if (targetDef) {
      droppedClassDef.value = targetDef;
      isClassWizardOpen.value = true;

      return;
    }

    toast.add({
      title: 'Ошибка',
      description: 'Определение класса не найдено',
      color: 'error',
    });

    wizardQueue.value.shift();
    void processNextWizardStep();
  }

  function handleStartWizardSequence(data: {
    queue: Array<{ classKey: string; targetLevel: number }>;
    experience: number;
    forceApplies: import('@vtt/shared').ActorClassEntry[];
  }) {
    if (!localActor.value) {
      return;
    }

    // Сначала применяем опыт, чтобы он сохранился даже если мастер отменят
    localActor.value.system.experience = data.experience;

    wizardQueue.value = data.queue;

    // Запускаем первый шаг
    void processNextWizardStep();
  }

  function handleClassSetupApply(
    systemUpdates: Partial<Actor['system']>,
    rootUpdates: Partial<Actor>,
  ) {
    if (!localActor.value) {
      return;
    }

    // Обновляем class/system data
    Object.assign(localActor.value.system, systemUpdates);

    // Обновляем корень актора (напр. features)
    if (Object.keys(rootUpdates).length > 0) {
      Object.assign(localActor.value, rootUpdates);
    }

    // Пересчитываем макс. ХП из истории бросков
    if (systemUpdates.classes) {
      const constitutionScore =
        localActor.value.system.abilities?.constitution ?? 10;

      const constitutionMod = Math.floor((constitutionScore - 10) / 2);
      const previousMax = localActor.value.system.hitPoints?.max ?? 0;
      const newMax = calculateMaxHP(systemUpdates.classes, constitutionMod);
      const hpGain = newMax - previousMax;

      localActor.value.system.hitPoints = {
        ...localActor.value.system.hitPoints,
        max: newMax,
        current: Math.max(
          1,
          (localActor.value.system.hitPoints?.current ?? 0) + hpGain,
        ),
      };
    }

    isDirty.value = true;
    handleImmediateSave();

    // Если мы повышаем уровень по очереди — переходим к следующему
    if (wizardQueue.value.length > 0) {
      wizardQueue.value.shift(); // удаляем выполненный шаг
      void processNextWizardStep();
    }
  }

  /**
   * Пересобирает владения (armor, weapons, tools, savingThrows, skills)
   * на основе SRD-данных оставшихся классов.
   *
   * Первый класс в массиве получает полные стартовые владения,
   * остальные — только мультикласс-владения (PHB 2024).
   *
   * @param actor - актор для обновления
   * @param remainingClasses - оставшиеся записи классов
   * @param removedSkills - навыки удалённого класса для исключения
   */
  function rebuildProficienciesFromRemainingClasses(
    actor: Actor,
    remainingClasses: Actor['system']['classes'],
    removedSkills: string[],
  ): void {
    const proficiencies = actor.system.proficiencies;

    if (remainingClasses.length === 0) {
      // Удалён последний класс — полная очистка
      proficiencies.armor = [];
      proficiencies.weapons = [];
      proficiencies.tools = [];
      proficiencies.savingThrows = [];
      proficiencies.skills = {};

      return;
    }

    const systemStore = useSystemDataStore();
    const localClasses = classDefinitions.value;

    /**
     * Распаковывает ключи доспехов — категории ('light', 'shield') развёрнуты в конкретные baseType ключи
     */
    const unpackArmor = (items: string[]): string[] => {
      const result = new Set<string>();

      for (const item of items) {
        const matchedTypes = systemStore.armorBaseTypes.filter(
          (baseType) => baseType.category === item || baseType.key === item,
        );

        if (matchedTypes.length > 0) {
          matchedTypes.forEach((baseType) => result.add(baseType.key));
        } else {
          result.add(item);
        }
      }

      return Array.from(result);
    };

    /**
     * Распаковывает ключи оружия — категории ('simple', 'martial') развёрнуты в конкретные baseType ключи
     */
    const unpackWeapons = (items: string[]): string[] => {
      const result = new Set<string>();

      for (const item of items) {
        const matchedTypes = systemStore.weaponBaseTypes.filter(
          (baseType) => baseType.category === item || baseType.key === item,
        );

        if (matchedTypes.length > 0) {
          matchedTypes.forEach((baseType) => result.add(baseType.key));
        } else {
          result.add(item);
        }
      }

      return Array.from(result);
    };

    // Собираем все владения из оставшихся классов
    const allArmor = new Set<string>();
    const allWeapons = new Set<string>();
    const allTools = new Set<string>();
    const allSavingThrows = new Set<AbilityType>();

    for (
      let classIndex = 0;
      classIndex < remainingClasses.length;
      classIndex++
    ) {
      const classEntry = remainingClasses[classIndex];

      const classDef = localClasses.find(
        (definition) => definition.key === classEntry.classKey,
      );

      if (!classDef) {
        continue;
      }

      if (classIndex === 0) {
        // Первый класс — полные стартовые владения
        for (const armor of unpackArmor(classDef.armorProficiencies)) {
          allArmor.add(armor);
        }

        for (const weapon of unpackWeapons(classDef.weaponProficiencies)) {
          allWeapons.add(weapon);
        }

        for (const tool of classDef.toolProficiencies ?? []) {
          allTools.add(tool);
        }

        for (const saving of classDef.savingThrowProficiencies) {
          allSavingThrows.add(saving);
        }
      } else {
        // Мультикласс — сокращённые владения (PHB 2024)
        const multiProf = MULTICLASS_PROFICIENCIES[classDef.key];

        if (multiProf) {
          for (const armor of unpackArmor(multiProf.armor)) {
            allArmor.add(armor);
          }

          for (const weapon of unpackWeapons(multiProf.weapons)) {
            allWeapons.add(weapon);
          }

          for (const tool of multiProf.tools) {
            allTools.add(tool);
          }
        }
      }
    }

    proficiencies.armor = Array.from(allArmor);
    proficiencies.weapons = Array.from(allWeapons);
    proficiencies.tools = Array.from(allTools);
    proficiencies.savingThrows = Array.from(allSavingThrows);

    // Навыки — удаляем только те, которые были от удалённого класса
    if (removedSkills.length > 0) {
      // Проверяем, не дублируются ли навыки в оставшихся классах
      const remainingChosenSkills = new Set<string>();

      for (const classEntry of remainingClasses) {
        for (const skill of classEntry.chosenSkills) {
          remainingChosenSkills.add(skill);
        }
      }

      for (const removedSkill of removedSkills) {
        // Удаляем навык только если его нет ни в одном оставшемся классе
        if (!remainingChosenSkills.has(removedSkill)) {
          delete proficiencies.skills[removedSkill as SkillType];
        }
      }
    }
  }

  /**
   * Удаляет класс у актёра и все связанные с ним данные:
   * - Запись из system.classes
   * - Особенности (features) с featureType 'class' или 'subclass', привязанные к этому классу
   * - Пересчёт HP
   */
  function handleRemoveClass(classKey: string) {
    if (!localActor.value) {
      return;
    }

    const classes = localActor.value.system.classes || [];

    const removedEntry = classes.find((entry) => entry.classKey === classKey);

    if (!removedEntry) {
      return;
    }

    const removedClassName = removedEntry.className;

    // Удаляем запись класса
    const remainingClasses = classes.filter(
      (entry) => entry.classKey !== classKey,
    );

    localActor.value.system.classes = remainingClasses;

    // Удаляем все features, связанные с этим классом
    if (localActor.value.features) {
      localActor.value.features = localActor.value.features.filter(
        (feature) => {
          const isClassFeature =
            feature.featureType === 'class'
            || feature.featureType === 'subclass';

          if (!isClassFeature) {
            return true;
          }

          // grantedBy содержит название класса (напр. «Волшебник» или
          // «Волшебник — Школа воплощения»)
          return !feature.grantedBy?.includes(removedClassName);
        },
      );
    }

    // Удаляем activeEffects, связанные с этим классом (ASI, черты)
    if (localActor.value.activeEffects) {
      localActor.value.activeEffects = localActor.value.activeEffects.filter(
        (effect) => !effect.name.includes(removedClassName),
      );
    }

    // Пересобираем proficiencies из SRD-данных оставшихся классов
    rebuildProficienciesFromRemainingClasses(
      localActor.value,
      remainingClasses,
      removedEntry.chosenSkills,
    );

    // Пересчитываем HP
    const constitutionScore =
      localActor.value.system.abilities?.constitution ?? 10;

    const constitutionMod = Math.floor((constitutionScore - 10) / 2);
    const newMax = calculateMaxHP(remainingClasses, constitutionMod);

    localActor.value.system.hitPoints = {
      ...localActor.value.system.hitPoints,
      max: newMax,
      current: Math.min(
        localActor.value.system.hitPoints?.current ?? newMax,
        newMax,
      ),
    };

    isDirty.value = true;
    handleImmediateSave();

    toast.add({
      title: 'Класс удалён',
      description: `${removedClassName} и все связанные особенности и эффекты удалены`,
      color: 'success',
    });
  }

  function handleSpeciesSetupApply(
    systemUpdates: Partial<Actor['system']>,
    rootUpdates: Partial<Actor>,
  ) {
    if (!localActor.value) {
      return;
    }

    Object.assign(localActor.value.system, systemUpdates);

    if (Object.keys(rootUpdates).length > 0) {
      Object.assign(localActor.value, rootUpdates);
    }

    // Сохраняем определение применённого вида для отката при следующей смене
    appliedSpeciesDef.value = droppedSpeciesDef.value;

    isDirty.value = true;
    handleImmediateSave();
  }

  /**
   * Пересчитывает уровне-зависимые дары вида (скорость, тёмное зрение) под
   * текущий суммарный уровень персонажа и выбранный подвид. Особенности-списком
   * не трогаем — лист показывает их по достижении уровня (фильтр по level).
   */
  function recomputeSpeciesLeveledGrants(): void {
    const actorData = localActor.value;
    const speciesEntry = actorData?.system.species;

    if (!actorData || !speciesEntry) {
      return;
    }

    const definition = speciesDefinitions.value.find(
      (entry) => entry.key === speciesEntry.speciesKey,
    );

    if (!definition) {
      return;
    }

    const totalLevel = getTotalLevel(actorData.system.classes);
    const chosenSubspecies = Object.values(speciesEntry.featureChoices ?? {});

    const movement = computeSpeciesMovement(
      definition,
      totalLevel,
      chosenSubspecies,
    );

    const darkvision = computeSpeciesDarkvision(
      definition,
      totalLevel,
      chosenSubspecies,
    );

    let changed = false;

    const current = actorData.system.movement;

    if (
      current.walk !== movement.walk
      || current.fly !== movement.fly
      || current.swim !== movement.swim
      || current.climb !== movement.climb
      || current.burrow !== movement.burrow
    ) {
      actorData.system.movement = { ...current, ...movement };
      changed = true;
    }

    if (
      actorData.token?.vision
      && actorData.token.vision.darkvision < darkvision
    ) {
      actorData.token.vision.darkvision = darkvision;
      changed = true;
    }

    if (changed) {
      isDirty.value = true;
      handleImmediateSave();
    }
  }

  // Дары вида по уровням: при повышении суммарного уровня (через мастер класса)
  // или смене выбранного подвида пересчитываем скорость/тёмное зрение. Сигнатура
  // строкой, чтобы watcher срабатывал только на реальные изменения и не зациклил
  // сам себя (пересчёт даёт те же значения → сигнатура не меняется).
  watch(
    () => {
      const speciesEntry = localActor.value?.system.species;

      if (!speciesEntry) {
        return '';
      }

      const totalLevel = getTotalLevel(localActor.value?.system.classes);

      const choices = Object.values(speciesEntry.featureChoices ?? {}).join(
        ',',
      );

      return `${speciesEntry.speciesKey}|${totalLevel}|${choices}`;
    },
    (signature, previousSignature) => {
      if (!signature || signature === previousSignature) {
        return;
      }

      recomputeSpeciesLeveledGrants();
    },
  );

  function handleBackgroundSetupApply(
    systemUpdates: Partial<Actor['system']>,
    rootUpdates: Partial<Actor>,
  ) {
    if (!localActor.value) {
      return;
    }

    Object.assign(localActor.value.system, systemUpdates);

    if (Object.keys(rootUpdates).length > 0) {
      Object.assign(localActor.value, rootUpdates);
    }

    isDirty.value = true;
    handleImmediateSave();
  }

  watch(
    () => props.open,
    (newValue) => {
      if (newValue) {
        initializeActor();

        // Хук модулей: лист актёра открыт (для расширений слота actor-sheet:tabs).
        // Только для существующего актёра — у нового ещё нет id.
        if (props.actorId) {
          ClientHooks.callAll('render:actor-sheet', props.actorId);
        }
      } else {
        savedSnapshot.value = null;
        isDirty.value = false;
      }
    },
    { immediate: true },
  );
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="true"
    :resizable="true"
    :min-width="800"
    :min-height="600"
    :initial-width="1200"
    initial-height="85vh"
    :z-index="props.zIndex"
    :saved-position="props.savedPosition"
    :saved-size="props.savedSize"
    :ui="{
      content: 'bg-default rounded-2xl',
      body: 'p-0',
    }"
    :hide-header="true"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <div
        class="relative flex h-full flex-col"
        @dragenter.prevent
        @dragover.prevent="handleDragOver"
        @dragleave="handleDragLeave"
        @drop.prevent="handleDrop"
      >
        <!-- Фоновая картинка с затуханием -->
        <img
          src="/assets/modals/actor_bg.webp"
          alt=""
          class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-8"
        />
        <!-- Шапка с информацией о персонаже -->
        <ActorHeader
          v-if="localActor"
          :actor="localActor"
          :is-edit-mode="isEditMode"
          :is-creating="!actorId && !isCreated"
          :can-edit="canEdit"
          :is-admin="isAdmin"
          :world-port="worldPort"
          @update:actor="handleActorUpdate"
          @toggle-edit-mode="toggleEditMode"
          @open-settings="openSettings"
          @short-rest="handleRest('short')"
          @long-rest="handleRest('long')"
          @save="handleSave"
          @close="handleCancel"
          @start-wizard="handleStartWizardSequence"
          @remove-class="handleRemoveClass"
        />
        <!-- Основной контент (3 колонки) -->
        <div class="custom-scrollbar flex-1 overflow-y-auto px-2 pt-4 pb-2">
          <div class="grid grid-cols-[250px_280px_1fr] gap-4">
            <ActorLeftPanel
              v-if="localActor"
              :actor="localActor"
              :is-edit-mode="isEditMode"
              class="flex flex-col"
              @update:actor="handleActorUpdate"
            />

            <!-- Центральная панель с навыками -->
            <ActorCenterPanel
              v-if="localActor"
              :actor="localActor"
              :is-edit-mode="isEditMode"
              :counter-definitions="counterDefinitions"
              class="flex h-full flex-col"
              @update:actor="handleActorUpdate"
            />

            <!-- Правая панель с характеристиками -->
            <div class="flex h-full flex-col">
              <ActorRightPanel
                v-if="localActor"
                :actor="localActor"
                :is-edit-mode="isEditMode"
                class="mb-6"
                @update:actor="handleActorUpdate"
              />

              <!-- Вкладки с дополнительной информацией (теперь внутри правой колонки) -->
              <ActorTabs
                v-if="localActor"
                :actor="localActor"
                :is-edit-mode="isEditMode"
                :is-spell-drag-over="isSpellDragOver"
                :is-equipment-drag-over="isEquipmentDragOver"
                :is-feature-drag-over="isFeatureDragOver"
                class="flex-1"
                @update:actor="handleActorUpdate"
                @immediate-save="handleImmediateSave"
              />
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
          {{ confirmMessage }}
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

  <!-- Модалка подтверждения замены вида/предыстории -->
  <UDraggableModal
    v-model:open="isReplaceConfirmOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="440"
    :min-height="160"
    :z-index="Z_INDEX.MODAL_ELEVATED * 2"
    :title="replaceConfirmTitle"
  >
    <template #body>
      <div class="space-y-4 p-4 text-center">
        <UIcon
          name="tabler:alert-triangle"
          class="mx-auto h-12 w-12 text-warning"
        />

        <p class="text-sm text-toned">
          {{ replaceConfirmMessage }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-center gap-3">
        <UButton
          variant="ghost"
          color="neutral"
          @click.left.exact.prevent="onReplaceCancel"
        >
          Отмена
        </UButton>

        <UButton
          color="error"
          icon="tabler:replace"
          @click.left.exact.prevent="onReplaceConfirm"
        >
          Заменить
        </UButton>
      </div>
    </template>
  </UDraggableModal>

  <!-- Мастер настройки класса -->
  <ClassSetupWizard
    v-if="localActor"
    v-model:open="isClassWizardOpen"
    :actor="localActor"
    :class-definition="droppedClassDef"
    :socket="socket"
    @apply="handleClassSetupApply"
  />

  <!-- Мастер настройки вида -->
  <SpeciesSetupWizard
    v-if="localActor"
    v-model:open="isSpeciesWizardOpen"
    :actor="localActor"
    :species-definition="droppedSpeciesDef"
    :previous-species-definition="appliedSpeciesDef"
    :socket="socket"
    @apply="handleSpeciesSetupApply"
  />

  <!-- Мастер настройки предыстории -->
  <BackgroundSetupWizard
    v-if="localActor"
    v-model:open="isBackgroundWizardOpen"
    :actor="localActor"
    :background-definition="droppedBackgroundDef"
    :socket="socket"
    @apply="handleBackgroundSetupApply"
  />

  <!-- Короткий отдых: трата костей хитов -->
  <ShortRestModal
    v-if="localActor"
    v-model:open="isShortRestOpen"
    :classes="localActor.system.classes"
    :manual-hit-dice="localActor.system.manualHitDice"
    :current-hit-points="localActor.system.hitPoints.current"
    :max-hit-points="localActor.system.hitPoints.max"
    :con-mod="constitutionModifier"
    @apply="handleShortRestApply"
  />

  <!-- Продолжительный отдых: предпросмотр восстановления -->
  <LongRestModal
    v-if="localActor"
    v-model:open="isLongRestOpen"
    :actor="localActor"
    @apply="handleLongRestApply"
  />
</template>

<style scoped>
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgb(75 85 99 / 0.5);
    border-radius: 20px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgb(107 114 128 / 0.6);
  }
</style>
