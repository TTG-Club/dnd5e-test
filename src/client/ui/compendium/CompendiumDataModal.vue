<script setup lang="ts">
  import type {
    CompendiumSeparator,
    CompendiumView,
    Feature,
    TypedWebSocketClient,
  } from '@vtt/shared';
  import type {
    ClassDefinition,
    CompendiumEntry,
    GameItem,
    GrantedSpellSource,
    SpeciesDefinition,
    Spell,
  } from '@vtt/shared/system/dnd.js';
  import type { ComponentPublicInstance } from 'vue';

  import { generateId, getAssetUrl, systemRegistry } from '@vtt/shared';
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

  import {
    clearActorDragPayload,
    setActorDragPayload,
  } from '@/core/actorDragState';
  import { getChatService } from '@/core/api/chatService';
  import { getEntityCard } from '@/core/registries';
  import EntityCard from '@/shared_ui/components/EntityCard.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useCompendiumView } from '@/shared_ui/composables/useCompendiumView';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';

  /**
   * Расширенный тип записи компендиума — включает все реальные типы данных,
   * приходящие из разных data-файлов (classes, species, backgrounds, feats, spells)
   */
  /** Запись существа в компендиуме */
  interface CompendiumCreatureEntry {
    id: string;
    name: string;
    nameEn?: string;
    type: 'creature';
    header?: string;
    description?: string;
    source?: string;
    isSRD?: boolean;
    isReadOnly?: boolean;
    token?: import('@vtt/shared').TokenSettings;
    system: Record<string, unknown>;
    /** Заклинания существа (верхний уровень, D&D 2024) */
    spells?: Spell[];
  }

  type CompendiumDataItem =
    | CompendiumEntry
    | Spell
    | Feature
    | CompendiumCreatureEntry
    | Record<string, unknown>;

  const props = defineProps<{
    /** Открыто ли модальное окно */
    open: boolean;
    /** Экземпляр WebSocket-клиента */
    socket: TypedWebSocketClient | null;
    /** Имя data-файла для загрузки */
    dataFile: string;
    /** Заголовок модалки */
    title: string;
    /**
     * Канонический тип записей узла из манифеста: одно из зарегистрированных
     * значений (`spell`/`creature`/`weapon`/`equipment`/`tool`/`feat`/`class`/
     * `species`/`background`), см. docs/CONTENT_AUTHORING.md. Записи с полем
     * `type` рисуются по нему; `dataKind` нужен для определений без `type`.
     */
    dataKind?: string;
    /**
     * Декларативная конфигурация отображения узла из манифеста: макет,
     * фильтры, группировка. Управляет обобщённым движком `useCompendiumView`.
     */
    view?: CompendiumView;
    /** Z-index (управляется родителем для bring-to-front) */
    zIndex?: number;
    savedPosition?: { x: number; y: number };
    savedSize?: { width: number; height: number };
    /**
     * Режим выбора заклинаний 1+ круга: сколько заклинаний можно выбрать.
     * Если не задан — обычный режим просмотра без выбора.
     */
    selectionLimit?: number;
    /**
     * Лимит выбора заговоров (круг 0). Считается отдельно от selectionLimit.
     */
    cantripsLimit?: number;
    /** Начальный фильтр по классу (применяется при открытии) */
    initialClassFilter?: string;
    /** Начальный фильтр по кругам заклинаний (применяется при открытии) */
    initialLevelFilter?: number[];
    /**
     * Идентификаторы уже выбранных заклинаний (из состояния родителя).
     * Предзаполняют набор выбора: отображаются отмеченными и засчитываются в лимит,
     * чтобы при повторном открытии нельзя было превысить лимит.
     */
    preselectedSpellIds?: string[];
    /**
     * Названия заклинаний, которые уже есть у персонажа.
     * В режиме выбора такие заклинания помечаются «Изучено» и недоступны
     * для выбора. Сопоставление по названию, т.к. при добавлении в лист
     * персонажа заклинанию выдаётся новый id.
     */
    knownSpellNames?: string[];
    /**
     * Заклинания, автоматически предоставленные умениями (поле `grantedSpells`
     * умения). В режиме выбора отображаются авто-выбранными и заблокированными
     * (бейдж «Умение: X»), не тратят лимит выбора. Сопоставление по id
     * компендиума, т.к. источники ссылаются именно на него.
     */
    grantedSpells?: GrantedSpellSource[];
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'bring-to-front': [];
    /** Эмитируется при подтверждении выбора заклинаний в режиме selectionLimit */
    'select-spells': [spells: Spell[]];
  }>();

  const items = ref<CompendiumDataItem[]>([]);
  const isLoading = ref(false);
  const loadedFile = ref('');
  const searchQuery = ref('');

  // --- Режим выбора заклинаний ---

  /**
   * Выбранные заклинания в режиме selectionLimit.
   * Инициализируется уже выбранными заклинаниями родителя, чтобы лимит
   * учитывал их и при повторном открытии его нельзя было превысить.
   */
  const selectedSpells = ref<Set<string>>(
    new Set(props.preselectedSpellIds ?? []),
  );

  /** Активен ли режим выбора */
  const isSelectionMode = computed(
    () =>
      props.selectionLimit !== undefined || props.cantripsLimit !== undefined,
  );

  /** Нормализованные названия уже изученных заклинаний персонажа */
  const knownSpellNamesSet = computed(
    () =>
      new Set(
        (props.knownSpellNames ?? []).map((name) => name.trim().toLowerCase()),
      ),
  );

  /**
   * Проверяет, изучено ли заклинание персонажем.
   *
   * @param spell - заклинание компендиума
   */
  function isSpellKnown(spell: Spell): boolean {
    return knownSpellNamesSet.value.has(spell.name.trim().toLowerCase());
  }

  /** Карта «id заклинания компендиума → название умения-источника» */
  const grantedFeatureNameBySpellId = computed(() => {
    const featureNameById = new Map<string, string>();

    for (const granted of props.grantedSpells ?? []) {
      featureNameById.set(granted.spellId, granted.featureName);
    }

    return featureNameById;
  });

  /**
   * Проверяет, предоставлено ли заклинание умением автоматически.
   *
   * @param spell - заклинание компендиума
   */
  function isSpellGranted(spell: Spell): boolean {
    return grantedFeatureNameBySpellId.value.has(spell.id);
  }

  /**
   * Возвращает название умения, предоставившего заклинание.
   *
   * @param spell - заклинание компендиума
   */
  function getGrantedFeatureName(spell: Spell): string {
    return grantedFeatureNameBySpellId.value.get(spell.id) ?? '';
  }

  /**
   * Считает заговоры (круг 0) среди указанных id выбора.
   * Id, отсутствующие в items, заговорами не считаются и потому
   * засчитываются в лимит заклинаний 1+ круга.
   *
   * @param selectionIds - множество id выбранных заклинаний
   */
  function countCantripsInSelection(selectionIds: Set<string>): number {
    let count = 0;

    for (const entry of items.value) {
      if (
        !isSeparator(entry)
        && isSpellDataItem(entry)
        && entry.level === 0
        && selectionIds.has(entry.id)
      ) {
        count++;
      }
    }

    return count;
  }

  /** Количество выбранных заговоров (круг 0) */
  const selectedCantripsCount = computed(() =>
    countCantripsInSelection(selectedSpells.value),
  );

  /** Количество выбранных заклинаний 1+ круга */
  const selectedSpellsCount = computed(
    () => selectedSpells.value.size - selectedCantripsCount.value,
  );

  /** Остаток выбора заклинаний 1+ круга */
  const remainingSpellSelections = computed(() => {
    if (props.selectionLimit === undefined) {
      return 0;
    }

    return props.selectionLimit - selectedSpellsCount.value;
  });

  /** Остаток выбора заговоров */
  const remainingCantripsSelections = computed(() => {
    if (props.cantripsLimit === undefined) {
      return 0;
    }

    return props.cantripsLimit - selectedCantripsCount.value;
  });

  /**
   * Переключает выбор заклинания в режиме выбора.
   * Учитывает раздельные лимиты для заговоров и заклинаний.
   *
   * @param spell - заклинание для переключения
   */
  function toggleSpellSelection(spell: Spell): void {
    // Уже изученные и предоставленные умениями заклинания нельзя переключить
    if (isSpellKnown(spell) || isSpellGranted(spell)) {
      return;
    }

    const newSet = new Set(selectedSpells.value);

    if (newSet.has(spell.id)) {
      newSet.delete(spell.id);
    } else {
      const isCantrip = spell.level === 0;

      const limit = isCantrip ? props.cantripsLimit : props.selectionLimit;

      // При лимите = 1 автоматически отменяем предыдущий выбор той же категории
      if (limit === 1) {
        for (const selectedId of newSet) {
          const found = items.value.find((item) => item.id === selectedId);

          if (
            found
            && !isSeparator(found)
            && isSpellDataItem(found)
            && (isCantrip ? found.level === 0 : found.level > 0)
          ) {
            newSet.delete(selectedId);
          }
        }
      }

      // Остаток считаем по newSet (а не по реактивным computed-остаткам,
      // которые ещё видят отменённый выбор): неопознанные id засчитываются
      // в лимит 1+ круга, поэтому превысить лимит нельзя
      const cantripsInNewSet = countCantripsInSelection(newSet);

      const remaining = isCantrip
        ? (props.cantripsLimit ?? 0) - cantripsInNewSet
        : (props.selectionLimit ?? 0) - (newSet.size - cantripsInNewSet);

      if (remaining > 0) {
        newSet.add(spell.id);
      }
    }

    selectedSpells.value = newSet;
  }

  /**
   * Проверяет, заблокирован ли выбор для данного заклинания (лимит исчерпан).
   *
   * @param spell - заклинание для проверки
   */
  function isSpellSelectionDisabled(spell: Spell): boolean {
    if (isSpellKnown(spell) || isSpellGranted(spell)) {
      return true;
    }

    if (selectedSpells.value.has(spell.id)) {
      return false;
    }

    const isCantrip = spell.level === 0;

    if (isCantrip) {
      // Если лимит 1, выбор не блокируется, чтобы можно было перевыбрать
      if (props.cantripsLimit === 1) {
        return false;
      }

      return remainingCantripsSelections.value === 0;
    }

    // Если лимит 1, выбор не блокируется, чтобы можно было перевыбрать
    if (props.selectionLimit === 1) {
      return false;
    }

    return remainingSpellSelections.value === 0;
  }

  /**
   * Обрабатывает клик по карточке заклинания в зависимости от режима выбора.
   *
   * @param spell - заклинание компендиума
   */
  function handleSpellClick(spell: Spell): void {
    if (
      isSelectionMode.value
      && !isSpellKnown(spell)
      && !isSpellGranted(spell)
    ) {
      toggleSpellSelection(spell);
    } else {
      openSpellDetail(spell);
    }
  }

  /** Подтверждает выбор заклинаний и эмитит событие */
  function confirmSpellSelection(): void {
    // Пока данные не загружены, items пуст — не подтверждаем,
    // иначе предвыбранные заклинания будут потеряны.
    if (isLoading.value || items.value.length === 0) {
      return;
    }

    const chosen = items.value.filter(
      (entry): entry is Spell =>
        !isSeparator(entry)
        && isSpellDataItem(entry)
        && selectedSpells.value.has(entry.id),
    );

    emit('select-spells', chosen);
    emit('update:open', false);
  }

  // --- Тип данных узла ---

  /**
   * Канонический тип записей узла из манифеста (`dataKind`) — одно из
   * зарегистрированных значений (`spell`/`creature`/`weapon`/`equipment`/`tool`/
   * `feat`/`class`/`species`/`background`), см. docs/CONTENT_AUTHORING.md.
   *
   * Записи с собственным полем `type` (заклинания, существа, предметы) рисуются
   * по нему напрямую — `dataKind` здесь нужен лишь для определений без `type`
   * (классы/виды/черты/предыстории) и для сортировки. Угадывание типа по имени
   * файла (`dataFile` — лишь ключ маршрутизации, может содержать префикс пака)
   * НЕ применяется.
   */
  const dataKind = computed(() => props.dataKind ?? '');

  // Обобщённый движок отображения: макет, боковые фильтры и группировка
  // управляются декларативной конфигурацией `view` из манифеста узла.
  // Специфика системы (круги, ПО, типы существ, классы, признак лечения)
  // берётся из VttSystem — компонент о конкретных типах данных не знает.
  const {
    layout: viewLayout,
    showFilters: showFilterSidebar,
    filterSections,
    hasActiveFilters,
    filteredEntries,
    isEnumActive,
    toggleEnum,
    isToggleActive,
    toggleBool,
    resetFilters,
    setEnumSelection,
  } = useCompendiumView({
    view: () => props.view,
    items,
    searchQuery,
  });

  /** Нужен ли широкий макет с сайдбаром фильтров */
  const isWideLayout = computed(() => viewLayout.value === 'filtered');

  /** Размеры модалки: увеличенные для макета с фильтрами */
  const modalWidth = computed(() => (isWideLayout.value ? 720 : 380));
  const modalHeight = computed(() => (isWideLayout.value ? 680 : 460));
  const modalMinWidth = computed(() => (isWideLayout.value ? 560 : 320));

  /**
   * Проверяет, является ли запись разделителем секции
   * @param entry - запись компендиума
   */
  function isSeparator(
    entry: CompendiumDataItem,
  ): entry is CompendiumSeparator {
    return 'type' in entry && entry.type === 'separator';
  }

  /** Узел определений классов (`dataKind: 'class'`) */
  const isClassData = computed(() => dataKind.value === 'class');

  /** Узел определений видов (`dataKind: 'species'`) */
  const isSpeciesData = computed(() => dataKind.value === 'species');

  /** Узел определений черт (`dataKind: 'feat'`) */
  const isFeatsData = computed(() => dataKind.value === 'feat');

  /** Узел определений предысторий (`dataKind: 'background'`) */
  const isBackgroundData = computed(() => dataKind.value === 'background');

  const { openModal } = useModalManager();

  const dataModalRef = ref<ComponentPublicInstance | null>(null);

  /** Обработчик ответа от сервера */
  function handleCompendiumData(
    dataFile: string,
    loadedItems: CompendiumDataItem[],
  ): void {
    if (dataFile === props.dataFile) {
      // Сортируем по алфавиту для классов и видов
      if (isClassData.value || isSpeciesData.value) {
        loadedItems.sort((entryA, entryB) => {
          const nameA =
            'name' in entryA && typeof entryA.name === 'string'
              ? entryA.name
              : '';

          const nameB =
            'name' in entryB && typeof entryB.name === 'string'
              ? entryB.name
              : '';

          return nameA.localeCompare(nameB, 'ru');
        });
      }

      items.value = loadedItems;
      isLoading.value = false;
      loadedFile.value = dataFile;
    }
  }

  /** Запрашивает данные из data-файла */
  function requestData(): void {
    if (!props.socket || !props.dataFile) {
      return;
    }

    // Уже загружен этот файл
    if (loadedFile.value === props.dataFile) {
      return;
    }

    isLoading.value = true;
    props.socket.emit('compendium:request-data', props.dataFile);
  }

  /**
   * Копирует предмет из компедиума в раздел «Предметы».
   * Все паки (бандл + скачиваемые + модули) живут на сервере — копирование
   * единообразно через серверный resolver.
   *
   * @param itemId - ID предмета
   */
  function copyToItems(itemId: string): void {
    if (!props.socket) {
      return;
    }

    props.socket.emit('items:copy-from-compendium', itemId);
  }

  /** Проверяет, является ли запись заклинанием */
  function isSpellDataItem(value: CompendiumDataItem): value is Spell {
    return 'type' in value && value.type === 'spell';
  }

  /** Проверяет, является ли запись определением вида */
  function isSpeciesDefinition(value: unknown): value is SpeciesDefinition {
    return (
      typeof value === 'object'
      && value !== null
      && 'key' in value
      && typeof value.key === 'string'
      && 'creatureType' in value
    );
  }

  /** Проверяет, является ли запись определением предыстории */
  function isBackgroundDefinition(
    value: CompendiumDataItem,
  ): value is { key: string; id?: string; [key: string]: unknown } {
    return (
      'key' in value && typeof value.key === 'string' && 'abilityGrant' in value
    );
  }

  /**
   * Идентификатор предыстории для копирования в предметы. Сервер ищет запись по
   * `id` (`findSrdItemById`), а не по `key`, поэтому отдаём `id` (откат на `key`
   * для совместимости со старыми данными без `id`).
   *
   * @param backgroundDef - определение предыстории из компендиума
   */
  function backgroundCopyId(backgroundDef: {
    key: string;
    id?: string;
  }): string {
    return backgroundDef.id ?? backgroundDef.key;
  }

  /** Проверяет, является ли запись определением класса */
  function isClassDefinition(
    value: CompendiumDataItem,
  ): value is ClassDefinition {
    return 'key' in value && typeof value.key === 'string' && 'hitDie' in value;
  }

  /** Проверяет, является ли запись чертой (Feature без поля type, но с полем featureType) */
  function isFeature(value: CompendiumDataItem): value is Feature {
    return 'featureType' in value;
  }

  /** Проверяет, является ли запись игровым предметом (имеет поле quantity) */
  /** Проверяет, является ли запись существом */
  function isCreatureDataItem(
    value: CompendiumDataItem,
  ): value is CompendiumCreatureEntry {
    return 'type' in value && value.type === 'creature' && 'system' in value;
  }

  /**
   * Проверяет, является ли запись компендиума игровым предметом (GameItem).
   *
   * @param value - проверяемая запись компендиума
   * @returns `true`, если запись содержит поле `quantity` и является предметом
   */
  function isGameItem(value: CompendiumDataItem): value is GameItem {
    return 'quantity' in value;
  }

  /**
   * Открывает модальное окно детального просмотра игрового предмета.
   * Тип окна выбирается по типу предмета (оружие/прочее).
   *
   * @param item - предмет для отображения
   */
  function openDetail(item: GameItem): void {
    if (item.type === 'weapon') {
      openModal('WeaponDetailModal', {
        item,
        showCopyButton: true,
        onCopy: () => copyToItems(item.id),
      });
    } else if (item.type === 'equipment') {
      openModal('EquipmentDetailModal', {
        item,
        showCopyButton: true,
        onCopy: () => copyToItems(item.id),
      });
    } else if (item.type === 'tool') {
      openModal('ToolDetailModal', {
        item,
        showCopyButton: true,
        onCopy: () => copyToItems(item.id),
      });
    } else {
      openModal('EquipmentDetailModal', {
        item,
        showCopyButton: true,
        onCopy: () => copyToItems(item.id),
      });
    }
  }

  /**
   * Открывает модальное окно детального просмотра заклинания.
   *
   * @param spell - заклинание для отображения
   */
  function openSpellDetail(spell: Spell): void {
    openModal('SpellDetailModal', {
      spell,
      showCopyButton: true,
      onCopy: () => copySpellToItems(spell),
    });
  }

  /**
   * Отправляет карточку заклинания в чат из компендиума
   *
   * @param spell - заклинание для отправки
   */
  function shareSpell(spell: Spell): void {
    getChatService().sendItemCard({
      cardType: 'spell',
      title: spell.name,
      payload: JSON.stringify(spell),
    });
  }

  /**
   * Копирует заклинание из компендиума в предметы, конвертируя Spell → GameItem.
   *
   * @param spell - заклинание для копирования
   */
  function copySpellToItems(spell: Spell): void {
    if (!props.socket) {
      return;
    }

    const itemData = {
      name: spell.name,
      nameEn: spell.nameEn,
      description: spell.description,
      type: 'spell' as const,
      quantity: 1,
      weight: 0,
      cost: '',
      rarity: 'common' as const,
      equipped: false,
      sourceKey: spell.sourceKey,
      isSRD: spell.isSRD,
      isReadOnly: false,
      spellData: spell,
    };

    props.socket.emit('items:create', itemData);
  }

  /**
   * Копирует вид из компендиума в предметы, оборачивая плоский
   * SpeciesDefinition в GameItem с вложенным speciesData. Ключу присваивается
   * новое значение — копия становится самостоятельным видом и не перекрывается
   * оригиналом SRD при слиянии видов в systemDataStore.
   *
   * @param species - определение вида для копирования
   */
  function copySpeciesToItems(species: SpeciesDefinition): void {
    if (!props.socket) {
      return;
    }

    const itemData: Partial<GameItem> = {
      name: species.name,
      nameEn: species.nameEn,
      description: species.description,
      type: 'species',
      quantity: 1,
      weight: 0,
      cost: '',
      rarity: 'common',
      equipped: false,
      sourceKey: species.sourceKey,
      isSRD: species.isSRD,
      isReadOnly: false,
      speciesData: { ...species, key: generateId(species.key) },
    };

    props.socket.emit('items:create', itemData);
  }

  /**
   * Копирует класс из компендиума в предметы, оборачивая плоский
   * ClassDefinition в GameItem с вложенным classData. Ключу присваивается новое
   * значение — копия становится самостоятельным классом и не перекрывает
   * оригинал SRD при слиянии классов в актор-листе.
   *
   * @param classDef - определение класса для копирования
   */
  function copyClassToItems(classDef: ClassDefinition): void {
    if (!props.socket) {
      return;
    }

    const itemData: Partial<GameItem> = {
      name: classDef.name,
      nameEn: classDef.nameEn,
      description: classDef.description ?? '',
      type: 'class',
      quantity: 1,
      weight: 0,
      cost: '',
      rarity: 'common',
      equipped: false,
      sourceKey: classDef.sourceKey,
      isSRD: classDef.isSRD,
      isReadOnly: false,
      classData: { ...classDef, key: generateId(classDef.key) },
    };

    props.socket.emit('items:create', itemData);
  }

  /**
   * Открывает детальный просмотр класса.
   * @param classDef - определение класса
   */
  function openClassDetail(classDef: {
    key: string;
    [key: string]: unknown;
  }): void {
    openModal('ClassDetailModal', { classDefinition: classDef });
  }

  /**
   * Открывает детальный просмотр вида.
   * @param species - определение вида
   */
  function openSpeciesDetail(species: SpeciesDefinition): void {
    openModal('SpeciesDetailModal', { speciesDefinition: species });
  }

  /**
   * Открывает детальный просмотр предыстории.
   * @param backgroundDef - определение предыстории
   */
  function openBackgroundDetail(backgroundDef: {
    key: string;
    id?: string;
    [key: string]: unknown;
  }): void {
    openModal('BackgroundDetailModal', {
      backgroundDefinition: backgroundDef,
      showCopyButton: true,
      onCopy: () => copyToItems(backgroundCopyId(backgroundDef)),
    });
  }

  /**
   * Открывает лист существа из компендиума (режим только просмотр).
   * @param creatureEntry - запись существа из компендиума
   */
  function openCreatureDetail(creatureEntry: CompendiumCreatureEntry): void {
    openModal('CreatureSheet', {
      creatureId: creatureEntry.id,
      initialData: creatureEntry,
    });
  }

  /**
   * Собирает существо мира из записи компендиума: новый id, глубокая копия
   * system/token, нормализация, скрытое имя на сцене. Общий билдер для кнопки
   * «Копировать» и перетаскивания существа из компендиума на стол.
   *
   * @param creatureEntry - запись существа компендиума
   * @returns готовое существо мира (ещё не отправленное на сервер)
   */
  function buildWorldCreature(
    creatureEntry: CompendiumCreatureEntry,
  ): import('@vtt/shared/system/dnd.js').Creature {
    const creature: import('@vtt/shared/system/dnd.js').Creature = {
      id: generateId('creature'),
      name: creatureEntry.name,
      nameEn: creatureEntry.nameEn,
      description: creatureEntry.description,
      token: creatureEntry.token
        ? JSON.parse(JSON.stringify(creatureEntry.token))
        : undefined,
      system: JSON.parse(JSON.stringify(creatureEntry.system)),
      spells: creatureEntry.spells
        ? JSON.parse(JSON.stringify(creatureEntry.spells))
        : undefined,
    };

    // Применяем нормализацию, чтобы перевести старые поля токена (hasVision -> enabled)
    const system = systemRegistry.getActiveSystem();

    if (system?.normalizeCreature) {
      system.normalizeCreature(creature);
    }

    // Существа из компендиума по умолчанию скрывают имя на сцене
    if (creature.token) {
      creature.token.showName = false;
    }

    return creature;
  }

  /**
   * Копирует существо из компендиума в список существ мира.
   * @param creatureEntry - запись существа
   */
  function copyCreature(creatureEntry: CompendiumCreatureEntry): void {
    if (!props.socket) {
      return;
    }

    props.socket.emit('creature:created', buildWorldCreature(creatureEntry));
  }

  /**
   * Старт перетаскивания существа из компендиума на стол. В dataTransfer
   * кладётся уже собранное существо мира (новый id) с флагом `fromCompendium` —
   * сцена при дропе копирует его в список существ (creature:created) и ставит
   * токен. Каждый dragstart генерирует новое существо с уникальным id, поэтому
   * повторный перенос создаёт отдельную копию.
   *
   * @param creatureEntry - запись существа компендиума
   * @param event - событие dragstart
   */
  function onCreatureDragStart(
    creatureEntry: CompendiumCreatureEntry,
    event: DragEvent,
  ): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = 'copy';

    const creature = buildWorldCreature(creatureEntry);

    event.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'creature',
        fromCompendium: true,
        creature,
      }),
    );

    // Ghost-превью на сцене (тот же механизм, что у списка существ): данные
    // токена в синглтон, нативный drag-image прячем. URL ассетов резолвим без
    // порта — кадры токенов это статика клиента (`assets/token-frames/...`).
    setActorDragPayload({
      imageUrl: getAssetUrl(creature.token?.imageUrl),
      frameUrl: getAssetUrl(creature.token?.frameUrl),
      tokenScale: creature.token?.scale ?? 1,
      textureScale: creature.token?.textureScale ?? 1,
      textureX: creature.token?.textureX ?? 0.5,
      textureY: creature.token?.textureY ?? 0.5,
      entityKind: 'creature',
    });

    const emptyCanvas = document.createElement('canvas');

    emptyCanvas.width = 1;
    emptyCanvas.height = 1;
    event.dataTransfer.setDragImage(emptyCanvas, 0, 0);
  }

  /** Завершение перетаскивания существа из компендиума (drop или отмена). */
  function onCreatureDragEnd(): void {
    clearActorDragPayload();
  }

  /**
   * Открывает детальный просмотр черты.
   * @param feature - черта для просмотра
   */
  function openFeatDetail(feature: Feature): void {
    getEntityCard('feat')?.openDetail?.(feature, {
      showCopyButton: true,
      onCopy: () => copyToItems(feature.id),
    });
  }

  onMounted(() => {
    if (props.socket) {
      props.socket.on('compendium:data', handleCompendiumData);
    }
  });

  onUnmounted(() => {
    if (props.socket) {
      props.socket.off('compendium:data', handleCompendiumData);
    }
  });

  // Загрузка данных при открытии или смене файла
  watch(
    () => [props.open, props.dataFile] as const,
    ([isOpen, currentFile], oldValue) => {
      // Если файл сменился — сбрасываем кеш и данные
      if (oldValue && currentFile !== oldValue[1]) {
        loadedFile.value = '';
        items.value = [];
        searchQuery.value = '';
        resetFilters();
        selectedSpells.value = new Set();
      }

      if (isOpen) {
        // Применяем начальные фильтры при открытии (id фильтров из манифеста
        // узла заклинаний: `class` — по классу, `level` — по кругу).
        if (props.initialClassFilter) {
          setEnumSelection('class', [props.initialClassFilter]);
        }

        if (props.initialLevelFilter && props.initialLevelFilter.length > 0) {
          setEnumSelection(
            'level',
            props.initialLevelFilter.map((level) => String(level)),
          );
        }

        requestData();
      }
    },
    { immediate: true },
  );
</script>

<template>
  <UDraggableModal
    ref="dataModalRef"
    v-bind="$attrs"
    :open="open"
    :title="title"
    :initial-width="modalWidth"
    :initial-height="modalHeight"
    :min-width="modalMinWidth"
    :min-height="250"
    :z-index="zIndex"
    :saved-position="savedPosition"
    :saved-size="savedSize"
    :ui="{ body: 'overflow-hidden p-0 flex flex-col' }"
    @update:open="emit('update:open', $event)"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <!-- Layout: сайдбар + контент для заклинаний и существ, обычный для остального -->
      <div
        class="flex min-h-0 flex-1"
        :class="showFilterSidebar ? 'flex-row' : 'flex-col'"
      >
        <!-- Боковая панель фильтров (декларативно из view.filters) -->
        <div
          v-if="showFilterSidebar"
          class="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r border-accented/30 p-3"
        >
          <!-- Поиск -->
          <UInput
            v-model="searchQuery"
            icon="tabler:search"
            placeholder="Поиск..."
            size="sm"
            :ui="{ root: 'w-full' }"
          />

          <!-- Секции фильтров -->
          <div
            v-for="section in filterSections"
            :key="section.id"
            class="flex flex-col gap-1.5"
          >
            <span
              class="text-xs font-semibold tracking-wider text-muted uppercase"
            >
              {{ section.label }}
            </span>

            <!-- enum: значения поля (бейджи в ряд или список) -->
            <div
              v-if="section.type === 'enum'"
              :class="
                section.style === 'badges'
                  ? 'flex flex-wrap gap-1'
                  : 'flex flex-col gap-1'
              "
            >
              <UBadge
                v-for="option in section.options"
                :key="option.value"
                :color="
                  isEnumActive(section.id, option.value) ? 'primary' : 'neutral'
                "
                :variant="
                  isEnumActive(section.id, option.value) ? 'solid' : 'subtle'
                "
                size="sm"
                class="cursor-pointer transition-all select-none"
                @click.left.exact.prevent="toggleEnum(section.id, option.value)"
              >
                {{ section.style === 'badges' ? option.short : option.label }}
              </UBadge>
            </div>

            <!-- toggles: булевы переключатели -->
            <div
              v-else
              class="flex flex-col gap-1"
            >
              <UBadge
                v-for="toggle in section.toggles"
                :key="toggle.key"
                :color="toggle.color"
                :variant="
                  isToggleActive(section.id, toggle.key) ? 'solid' : 'subtle'
                "
                size="sm"
                class="cursor-pointer transition-all select-none"
                @click.left.exact.prevent="toggleBool(section.id, toggle.key)"
              >
                <UIcon
                  v-if="toggle.icon"
                  :name="toggle.icon"
                  class="mr-0.5 size-3.5"
                />
                {{ toggle.label }}
              </UBadge>
            </div>
          </div>

          <!-- Сброс фильтров -->
          <UBadge
            v-if="hasActiveFilters"
            color="error"
            variant="subtle"
            size="sm"
            class="cursor-pointer transition-all select-none"
            @click.left.exact.prevent="resetFilters"
          >
            <UIcon
              name="tabler:x"
              class="mr-0.5 size-3.5"
            />
            Сбросить всё
          </UBadge>
        </div>

        <!-- Основная часть контента -->
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <!-- Поиск (когда нет сайдбара с фильтрами) -->
          <div
            v-if="!showFilterSidebar"
            class="shrink-0 px-4 pt-2 pb-2"
          >
            <UInput
              v-model="searchQuery"
              icon="tabler:search"
              placeholder="Поиск по названию..."
              size="sm"
              :ui="{ root: 'w-full' }"
            />
          </div>

          <!-- Прокручиваемая область списка -->
          <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <!-- Загрузка -->
            <div
              v-if="isLoading"
              class="flex items-center justify-center py-8"
            >
              <UIcon
                name="tabler:loader-2"
                class="animate-spin text-2xl text-muted"
              />
            </div>

            <!-- Список предметов с разделителями -->
            <div
              v-else-if="filteredEntries.length > 0"
              class="flex flex-col gap-1"
            >
              <template
                v-for="(entry, index) in filteredEntries"
                :key="
                  isSeparator(entry)
                    ? `sep-${index}`
                    : 'id' in entry
                      ? entry.id
                      : index
                "
              >
                <!-- Разделитель секции -->
                <div
                  v-if="isSeparator(entry)"
                  class="flex items-center gap-2 px-2 pt-3 pb-1"
                  :class="{ 'pt-1': index === 0 }"
                >
                  <span
                    class="shrink-0 text-xs font-semibold tracking-wider text-muted uppercase"
                  >
                    {{ entry.name }}
                  </span>

                  <div class="h-px flex-1 bg-accented/50" />
                </div>

                <!-- Предмет: Вид -->
                <template
                  v-else-if="isSpeciesData && isSpeciesDefinition(entry)"
                >
                  <EntityCard
                    class="hover:bg-primary-500/10"
                    entity-type="species"
                    :entry="entry"
                    show-copy
                    @click="openSpeciesDetail(entry)"
                    @copy="copySpeciesToItems(entry)"
                  />
                </template>

                <!-- Предмет: Предыстория -->
                <template
                  v-else-if="isBackgroundData && isBackgroundDefinition(entry)"
                >
                  <EntityCard
                    class="hover:bg-primary-500/10"
                    entity-type="background"
                    :entry="entry"
                    show-copy
                    @click="openBackgroundDetail(entry)"
                    @copy="copyToItems(backgroundCopyId(entry))"
                  />
                </template>

                <!-- Предмет: Класс -->
                <template v-else-if="isClassData && isClassDefinition(entry)">
                  <EntityCard
                    class="hover:bg-primary-500/10"
                    entity-type="class"
                    :entry="entry"
                    show-copy
                    @click="openClassDetail(entry)"
                    @copy="copyClassToItems(entry)"
                  />
                </template>

                <!-- Предмет: Черта -->
                <template v-else-if="isFeatsData && isFeature(entry)">
                  <EntityCard
                    entity-type="feat"
                    :entry="entry"
                    show-copy
                    @click="openFeatDetail(entry)"
                    @copy="copyToItems(entry.id)"
                  />
                </template>

                <!-- Предмет инвентаря (оружие/снаряжение/инструмент): тип
                     карточки берётся из собственного поля `type` записи -->
                <template v-else-if="isGameItem(entry)">
                  <EntityCard
                    :entity-type="entry.type"
                    :entry="entry"
                    show-copy
                    @click="openDetail(entry)"
                    @copy="copyToItems(entry.id)"
                  />
                </template>

                <!-- Существо -->
                <template v-else-if="isCreatureDataItem(entry)">
                  <div
                    draggable="true"
                    title="Перетащите на стол, чтобы добавить в список существ и поставить токен"
                    @dragstart="onCreatureDragStart(entry, $event)"
                    @dragend="onCreatureDragEnd"
                  >
                    <EntityCard
                      entity-type="creature"
                      :entry="entry"
                      show-copy
                      @click="openCreatureDetail(entry)"
                      @copy="copyCreature(entry)"
                    />
                  </div>
                </template>

                <!-- Предмет: Заклинание -->
                <template v-else-if="isSpellDataItem(entry)">
                  <div class="flex items-center gap-2">
                    <!-- Предоставлено умением — несъёмная галочка -->
                    <UCheckbox
                      v-if="isSelectionMode && isSpellGranted(entry)"
                      :model-value="true"
                      disabled
                    />

                    <!-- Уже изученное заклинание — пометка вместо чекбокса -->
                    <UIcon
                      v-else-if="isSelectionMode && isSpellKnown(entry)"
                      name="tabler:check"
                      class="size-5 shrink-0 text-success"
                    />

                    <!-- Чекбокс выбора (только в режиме выбора) -->
                    <UCheckbox
                      v-else-if="isSelectionMode"
                      :model-value="selectedSpells.has(entry.id)"
                      :disabled="isSpellSelectionDisabled(entry)"
                      @update:model-value="toggleSpellSelection(entry)"
                    />

                    <EntityCard
                      class="flex-1"
                      :class="{
                        'opacity-60': isSelectionMode && isSpellKnown(entry),
                      }"
                      entity-type="spell"
                      :entry="entry"
                      :show-copy="!isSelectionMode"
                      @click="handleSpellClick(entry)"
                      @copy="copySpellToItems(entry)"
                      @share="shareSpell(entry)"
                    />

                    <UBadge
                      v-if="isSelectionMode && isSpellGranted(entry)"
                      color="primary"
                      variant="subtle"
                      size="sm"
                      class="shrink-0"
                    >
                      Умение: {{ getGrantedFeatureName(entry) }}
                    </UBadge>

                    <UBadge
                      v-else-if="isSelectionMode && isSpellKnown(entry)"
                      color="success"
                      variant="subtle"
                      size="sm"
                      class="shrink-0"
                    >
                      Изучено
                    </UBadge>
                  </div>
                </template>
              </template>
            </div>

            <!-- Нет результатов поиска -->
            <div
              v-else-if="searchQuery.trim() && items.length > 0"
              class="py-8 text-center text-sm text-dimmed"
            >
              Ничего не найдено
            </div>

            <!-- Пусто -->
            <div
              v-else
              class="py-8 text-center text-sm text-dimmed"
            >
              Нет данных
            </div>
          </div>

          <!-- Панель подтверждения выбора (только в режиме выбора) -->
          <div
            v-if="isSelectionMode"
            class="shrink-0 border-t border-default/50 px-4 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span v-if="cantripsLimit !== undefined">
                  Заговоры:
                  <span
                    class="font-semibold"
                    :class="
                      remainingCantripsSelections === 0
                        ? 'text-success'
                        : 'text-toned'
                    "
                  >
                    {{ selectedCantripsCount }}
                  </span>
                  /
                  <span class="font-semibold text-toned">{{
                    cantripsLimit
                  }}</span>
                </span>

                <span v-if="selectionLimit !== undefined">
                  Заклинания:
                  <span
                    class="font-semibold"
                    :class="
                      remainingSpellSelections === 0
                        ? 'text-success'
                        : 'text-toned'
                    "
                  >
                    {{ selectedSpellsCount }}
                  </span>
                  /
                  <span class="font-semibold text-toned">{{
                    selectionLimit
                  }}</span>
                </span>
              </div>

              <UButton
                color="primary"
                size="sm"
                :disabled="selectedSpells.size === 0 || isLoading"
                @click.left.exact.prevent="confirmSpellSelection"
              >
                <UIcon
                  name="tabler:check"
                  class="mr-1 size-4"
                />
                Добавить выбранные
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
