<script setup lang="ts">
  import type { SceneEntity } from '@vtt/shared';
  import type {
    Actor,
    AttackRollMode,
    GameItem,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type {
    RolledSpellDamagePart,
    SpellDamagePartInput,
  } from '../../../composables/useSpellResolution';

  import {
    calculateWeaponAttackModifier,
    calculateWeaponDamageModifier,
    describeDamagePart,
    evaluateConditionalBonuses,
    formatWeaponDamageFormula,
    getEquipmentCategoryIcon,
    getWeaponPrimaryDamageType,
    resolveActorStats,
    TOOL_CATEGORIES,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, toRef } from 'vue';

  import { startHotbarDrag } from '@/core/utils/hotbarDrag';
  import { ContextMenuDangerItem } from '@/shared_ui/components';
  import FieldGroupReset from '@/shared_ui/components/FieldGroupReset.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { useChatStore } from '@/stores/chatStore';
  import { useHotbarStore } from '@/stores/hotbarStore';
  import { useTargetStore } from '@/stores/targetStore';
  import { useWorldStore } from '@/stores/worldStore';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import { useBonusDamageParts } from '../../../composables/useBonusDamageParts';
  import { useResolvedStats } from '../../../composables/useResolvedStats';
  import { useSpellResolution } from '../../../composables/useSpellResolution';
  import { useWeaponIcon } from '../../../composables/useWeaponIcon';
  import { GAME_ITEM_TRANSFER_MIME } from '../constants';
  import DiceRollModal from '../DiceRollModal.vue';
  import { extractSpellFromGameItem } from '../utils/extractSpellFromGameItem';
  import WeaponIcon from '../WeaponIcon.vue';

  const props = defineProps<Props>();

  const { resolvedStats, combinedEffects } = useResolvedStats(
    toRef(() => props.actor),
  );

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
    'immediate-save': [];
  }>();

  interface Props {
    actor: Actor;
    isEditMode: boolean;
    isDragOver?: boolean;
  }

  /**
   * Запрашивает у хозяина вкладки немедленное сохранение актёра — только вне
   * режима редактирования. В режиме редактирования изменения копятся в
   * локальной копии до «Сохранить»: немедленный push рассинхронизировал бы
   * снапшот отката (последующая «Отмена» затирала бы уже сохранённое).
   */
  function triggerSaveIfNotEdit(): void {
    if (!props.isEditMode) {
      emit('immediate-save');
    }
  }

  const { getWeaponIcon } = useWeaponIcon();

  /** Иконки по типу предмета (кроме weapon/armor — у них своя логика) */
  const ITEM_TYPE_ICON_MAP: Record<string, string> = {
    'trinket': 'tabler:diamond',
    'rod': 'tabler:wand',
    'ring': 'tabler:circle-dotted',
    'clothing': 'tabler:hanger',
    'wand': 'tabler:wand',
    'wondrous': 'tabler:sparkles',
    'vehicle-equipment': 'tabler:horse',
    'tool': 'tabler:tools',
    'spell': 'tabler:sparkles',
  };

  /** Fallback-иконка для неизвестных типов */
  const DEFAULT_ITEM_ICON = 'tabler:box';

  const systemDataStore = useSystemDataStore();
  const hotbarStore = useHotbarStore();
  const targetStore = useTargetStore();
  const chatStore = useChatStore();
  const worldStore = useWorldStore();

  const { resolveSpellDamageWithParts } = useSpellResolution();

  const { buildWeaponRollSetup, buildTargetHpContext } = useBonusDamageParts();

  /**
   * Карта key → name для локализации типов урона
   */
  const damageTypeMap = computed(() => {
    const map = new Map<string, string>();

    for (const dt of systemDataStore.damageTypes) {
      map.set(dt.key, dt.name);
    }

    return map;
  });

  /**
   * Карта key → name для локализации категорий доспехов
   */
  const armorCategoryMap = computed(() => {
    const map = new Map<string, string>();

    for (const cat of systemDataStore.armorCategories) {
      map.set(cat.key, cat.name);
    }

    return map;
  });

  /**
   * Карта key → name для категорий инструментов
   */
  const toolCategoryMap = computed(() => {
    const map = new Map<string, string>();

    for (const [key, name] of Object.entries(TOOL_CATEGORIES)) {
      map.set(key, name);
    }

    return map;
  });

  /** Лейблы категорий оружия */
  const WEAPON_CATEGORY_LABELS: Record<string, string> = {
    simple: 'Простое оружие',
    martial: 'Воинское оружие',
  };

  /**
   * Получает лейбл категории оружия по baseType (через weaponBaseTypes)
   * @param baseType - ключ базового типа оружия
   */
  function getWeaponCategoryLabel(baseType: string | undefined): string {
    if (!baseType) {
      return '';
    }

    const found = systemDataStore.weaponBaseTypes.find(
      (bt) => bt.key === baseType,
    );

    return found ? (WEAPON_CATEGORY_LABELS[found.category] ?? '') : '';
  }

  /** Конфигурация групп предметов для разделителей */
  const EQUIPMENT_GROUP_ORDER = [
    { type: 'weapon', label: 'Оружие' },
    { type: 'equipment', label: 'Экипировка' },
    { type: 'tool', label: 'Инструменты' },
  ];

  /**
   * Группировка предметов по типу:
   * Оружие, Доспехи, Прочее
   */
  const equipmentGroups = computed(() => {
    const groups: Array<{ label: string; items: GameItem[] }> = [];

    for (const group of EQUIPMENT_GROUP_ORDER) {
      const items = props.actor.equipment.filter(
        (item) => item.type === group.type,
      );

      if (items.length > 0) {
        groups.push({ label: group.label, items });
      }
    }

    // Прочее — всё, что не weapon и не armor
    const knownTypes = new Set(
      EQUIPMENT_GROUP_ORDER.map((group) => group.type),
    );

    const otherItems = props.actor.equipment.filter(
      (item) => !knownTypes.has(item.type),
    );

    if (otherItems.length > 0) {
      groups.push({ label: 'Прочее', items: otherItems });
    }

    return groups;
  });

  /** Категории, являющиеся настоящей бронёй (нельзя носить 2 одновременно) */
  const ARMOR_CATEGORIES = new Set(['light', 'medium', 'heavy']);

  /**
   * Есть ли уже экипированная броня (не щит).
   * По правилам D&D можно носить только один доспех.
   */
  const equippedArmorId = computed(() => {
    const found = props.actor.equipment.find(
      (item) =>
        item.type === 'equipment'
        && item.equipped
        && ARMOR_CATEGORIES.has(item.equipmentCategory ?? ''),
    );

    return found?.id ?? null;
  });

  /**
   * Проверяет, заблокирована ли кнопка экипировки для предмета.
   * Блокирует экипировку второй брони (не щита), если одна уже надета.
   *
   * @param item - предмет для проверки
   * @returns true если кнопка должна быть заблокирована
   */
  function isEquipDisabled(item: GameItem): boolean {
    // Если предмет уже экипирован — всегда можно снять
    if (item.equipped) {
      return false;
    }

    // Блокировка только для настоящей брони (light/medium/heavy)
    if (
      item.type !== 'equipment'
      || !ARMOR_CATEGORIES.has(item.equipmentCategory ?? '')
    ) {
      return false;
    }

    // Блокируем, если уже есть экипированная броня
    return equippedArmorId.value !== null;
  }

  // --- Бросок урона (через DiceRollModal) ---
  const isRollModalOpen = ref(false);

  const rollConfig = ref({
    name: '',
    formula: '',
    attackModifier: undefined as number | undefined,
    evaluateBonuses: undefined as
      | ((context: { hasAdvantage: boolean; hasDisadvantage: boolean }) => {
          attackBonus: number;
          damageBonus: number;
        })
      | undefined,
    initialRollMode: 'normal' as AttackRollMode,
    incomingAttackType: undefined as 'melee' | 'ranged' | 'spell' | undefined,
    damageType: undefined as string | undefined,
    // Многочастный путь (бонус-части урона от Active Effects)
    damageParts: undefined as SpellDamagePartInput[] | undefined,
    evaluateBonusDamageParts: undefined as
      | ((context: {
          hasAdvantage: boolean;
          hasDisadvantage: boolean;
        }) => SpellDamagePartInput[])
      | undefined,
    onRollParts: undefined as
      | ((parts: RolledSpellDamagePart[]) => void)
      | undefined,
    onHit: undefined as (() => void) | undefined,
  });

  /**
   * Сущности текущего мира (акторы + существа) — цели многочастного применения.
   */
  function getCurrentWorldEntities(): SceneEntity[] {
    const worldId = worldStore.connectionState.currentWorldId;

    if (!worldId) {
      return [];
    }

    const world = worldStore.worlds.find(
      (worldEntry) => worldEntry.id === worldId,
    );

    if (!world) {
      return [];
    }

    return [...(world.actors ?? []), ...(world.creatures ?? [])];
  }

  /**
   * Открывает модалку броска урона для оружия
   * @param weapon - оружие с формулой урона
   */
  function openRollModal(weapon: GameItem): void {
    if (!weapon.damageParts?.length) {
      return;
    }

    // Оружие со спасброском: цель кидает спас, броска попадания нет.
    const hasSave = !!weapon.saveType && weapon.saveType !== 'none';

    const baseMod = calculateWeaponAttackModifier(
      props.actor,
      weapon,
      resolvedStats.value,
    );

    const weaponSaveDC = 8 + baseMod;

    const evaluateBonuses = (context: {
      hasAdvantage: boolean;
      hasDisadvantage: boolean;
    }) => {
      const attackKey =
        weapon.rangeType === 'ranged' ? 'attack.ranged' : 'attack.melee';

      const damageKey =
        weapon.rangeType === 'ranged' ? 'damage.ranged' : 'damage.melee';

      // HP цели читается в момент броска — для условий target.hp.* («Убийца»)
      const rollContext = { ...context, target: buildTargetHpContext() };

      return {
        attackBonus: evaluateConditionalBonuses(
          combinedEffects.value,
          attackKey,
          rollContext,
        ),
        damageBonus: evaluateConditionalBonuses(
          combinedEffects.value,
          damageKey,
          rollContext,
        ),
      };
    };

    const targetActor = targetStore.getTargetActor();

    let targetFlags = new Set<string>();

    if (targetActor) {
      targetFlags = resolveActorStats(targetActor).activeFlags;
    }

    const isAdvantage =
      resolvedStats.value?.activeFlags.has('attack.advantage')
      || targetFlags.has('attacksAgainst.advantage');

    const isDisadvantage =
      resolvedStats.value?.activeFlags.has('attack.disadvantage')
      || targetFlags.has('attacksAgainst.disadvantage');

    let initialRollMode: AttackRollMode = 'normal';

    if (isAdvantage && !isDisadvantage) {
      initialRollMode = 'advantage';
    } else if (isDisadvantage && !isAdvantage) {
      initialRollMode = 'disadvantage';
    }

    // Единая со заклинаниями система урона: бросок ВСЕГДА идёт многочастным
    // путём (части урона оружия + бонус-части эффектов). Состояние HP цели —
    // для условных веток @target.full/@target.notFull.
    const targetHp = buildTargetHpContext();

    const targetIsFull = targetHp
      ? targetHp.currentHp >= targetHp.maxHp
      : undefined;

    const weaponPartsSetup = buildWeaponRollSetup({
      weapon,
      actor: props.actor,
      effects: combinedEffects.value,
      resolvedStats: resolvedStats.value,
      targetIsFull,
    });

    rollConfig.value = {
      name: weapon.name,
      formula: weaponPartsSetup.baseParts[0]?.formula ?? '',
      attackModifier: hasSave ? undefined : baseMod,
      evaluateBonuses,
      initialRollMode,
      incomingAttackType: weapon.rangeType === 'ranged' ? 'ranged' : 'melee',
      damageType: getWeaponPrimaryDamageType(weapon),
      damageParts: weaponPartsSetup.baseParts,
      evaluateBonusDamageParts: weaponPartsSetup.evaluateBonusDamageParts,
      onRollParts: (parts: RolledSpellDamagePart[]) =>
        handleWeaponRollParts(
          weaponPartsSetup.pseudoSpell,
          parts,
          weaponSaveDC,
        ),
    };

    isRollModalOpen.value = true;
  }

  /**
   * Применяет брошенные части урона оружия через многочастный оркестратор:
   * защиты по типу на каждую часть, per-target гейты @target.*, единый
   * HP-апдейт и одно сообщение в чат.
   *
   * @param pseudoSpell - псевдо-заклинание оружия (со спасбросском оружия, если есть)
   * @param parts - брошенные части урона
   * @param spellSaveDC - DC спасброска оружия (для оружия со спасброском)
   */
  function handleWeaponRollParts(
    pseudoSpell: Spell,
    parts: RolledSpellDamagePart[],
    spellSaveDC: number,
  ): void {
    const actors = getCurrentWorldEntities();
    const socket = chatStore.getSocket();

    if (actors.length === 0 || !socket) {
      return;
    }

    void resolveSpellDamageWithParts(
      {
        spell: pseudoSpell,
        damageTotal: 0,
        spellSaveDC,
        actors,
        socket,
        casterId: props.actor.id,
      },
      parts,
      { scene: worldStore.currentScene },
    );
  }

  /**
   * Обработчик dragstart для перетаскивания оружия на hotbar.
   * @param event - событие dragstart
   * @param weapon - оружие
   */
  function handleWeaponDragStart(event: DragEvent, weapon: GameItem): void {
    if (!weapon.damageParts?.length) {
      return;
    }

    const { iconName, svgContent } = getWeaponIcon(weapon.baseType);
    const hotbarIcon = svgContent ?? iconName ?? 'tabler:target-arrow';

    startHotbarDrag(event, {
      id: weapon.id,
      type: 'weapon-attack',
      label: `Атака — ${weapon.name}`,
      icon: hotbarIcon,
      ref: weapon.id,
      actorId: props.actor.id,
    });
  }

  /**
   * Обработчик dragstart для передачи любого предмета между токенами через DnD на сцену.
   * Добавляет MIME `application/game-item-transfer` с данными предмета и ID актора.
   * @param event - событие dragstart
   * @param item - передаваемый предмет
   */
  function handleItemDragStart(event: DragEvent, item: GameItem): void {
    if (!event.dataTransfer) {
      return;
    }

    // Для любого предмета — MIME передачи между токенами
    const transferPayload = JSON.stringify({
      item,
      sourceActorId: props.actor.id,
    });

    event.dataTransfer.setData(GAME_ITEM_TRANSFER_MIME, transferPayload);
    event.dataTransfer.effectAllowed = 'copyMove';

    // Для оружия с уроном — дополнительно hotbar drag
    if (item.type === 'weapon' && item.damageParts?.length) {
      handleWeaponDragStart(event, item);
    }
  }

  const { openModal, closeModal } = useModalManager();

  /**
   * Открывает модалку просмотра предмета через глобальный ModalContainer.
   * Модалки независимы от листа персонажа и остаются при его закрытии.
   * @param item - предмет снаряжения
   */
  function openDetailModal(item: GameItem): void {
    if (item.type === 'equipment') {
      openModal('EquipmentDetailModal', { item, open: true });
    } else if (item.type === 'tool') {
      openModal('ToolDetailModal', { item, open: true });
    } else if (item.type === 'spell') {
      openModal('SpellDetailModal', { spell: extractSpellFromGameItem(item) });
    } else {
      openModal('WeaponDetailModal', { item, open: true });
    }
  }

  /**
   * Открывает модалку редактирования предмета в зависимости от типа
   * @param item - предмет снаряжения
   */
  function openEditModal(item: GameItem): void {
    const modalMap: Record<string, string> = {
      equipment: 'EquipmentFormModal',
      tool: 'ToolFormModal',
      spell: 'SpellFormModal',
      weapon: 'WeaponFormModal',
    };

    const modalName = modalMap[item.type] ?? 'WeaponFormModal';
    const formId = `${modalName}-${item.id}`;

    if (item.type === 'spell') {
      openModal(modalName, {
        item,
        onSave: (updatedSpell: Spell) =>
          saveSpellEdit(updatedSpell, formId, item),
        onClose: () => closeModal(formId),
      });
    } else {
      openModal(modalName, {
        item,
        onSave: (updated: GameItem) => saveEquipmentEdit(updated, formId),
        onClose: () => closeModal(formId),
      });
    }
  }

  /**
   * Сохраняет редактированный предмет (оружие, доспех, инструмент) в equipment.
   *
   * @param updatedItem - обновлённый предмет
   * @param formId - ID модалки для закрытия
   */
  function saveEquipmentEdit(updatedItem: GameItem, formId: string): void {
    const equipment = props.actor.equipment.map((item) =>
      item.id === updatedItem.id
        ? { ...updatedItem, equipped: item.equipped }
        : item,
    );

    emit('update:actor', { equipment });
    closeModal(formId);

    triggerSaveIfNotEdit();
  }

  /** Сохраняет редактированное заклинание-предмет в equipment */
  function saveSpellEdit(
    updatedSpell: Spell,
    formId: string,
    originalItem: GameItem,
  ): void {
    const updatedSpellItem: GameItem = {
      ...originalItem,
      name: updatedSpell.name,
      nameEn: updatedSpell.nameEn,
      description: updatedSpell.description,
      spellData: updatedSpell,
    };

    const equipment = props.actor.equipment.map((item) =>
      item.id === originalItem.id ? updatedSpellItem : item,
    );

    emit('update:actor', { equipment });
    closeModal(formId);

    triggerSaveIfNotEdit();
  }

  // --- Действия ---

  // TODO: Подумать над правилами для больших (Large+) существ:
  // - Большие существа могут держать двуручное оружие одной рукой
  // - Влияние размера на урон (oversized weapons)
  // TODO: Вернуть блокировку экипировки при нехватке рук (canEquip / freeHands)

  /**
   * Переключает экипировку предмета
   * @param itemId - ID предмета
   */
  function toggleEquipped(itemId: string): void {
    const equipment = props.actor.equipment.map((item) =>
      item.id === itemId
        ? {
            ...item,
            equipped: !item.equipped,
            twoHandedGrip: item.equipped ? false : item.twoHandedGrip,
          }
        : item,
    );

    emit('update:actor', { equipment });

    triggerSaveIfNotEdit();
  }

  /**
   * Переключает хват универсального оружия (1 рука ↔ 2 руки)
   * @param itemId - ID предмета
   */
  function toggleTwoHandedGrip(itemId: string): void {
    const target = props.actor.equipment.find((item) => item.id === itemId);

    if (!target || !target.equipped) {
      return;
    }

    const equipment = props.actor.equipment.map((item) =>
      item.id === itemId
        ? { ...item, twoHandedGrip: !item.twoHandedGrip }
        : item,
    );

    emit('update:actor', { equipment });

    triggerSaveIfNotEdit();
  }

  /**
   * Обновляет количество предмета
   * @param itemId - ID предмета
   * @param newQuantity - новое количество (минимум 1)
   */
  function updateItemQuantity(itemId: string, newQuantity: number): void {
    const clampedQuantity = Math.max(1, Math.floor(newQuantity));

    const equipment = props.actor.equipment.map((item) =>
      item.id === itemId ? { ...item, quantity: clampedQuantity } : item,
    );

    emit('update:actor', { equipment });

    triggerSaveIfNotEdit();
  }

  /**
   * Переключает настройку (attunement) предмета
   * @param itemId - ID предмета
   */
  function toggleAttuned(itemId: string): void {
    const equipment = props.actor.equipment.map((item) =>
      item.id === itemId ? { ...item, isAttuned: !item.isAttuned } : item,
    );

    emit('update:actor', { equipment });

    triggerSaveIfNotEdit();
  }

  /**
   * Удаляет предмет из инвентаря
   * @param itemId - ID предмета
   */
  function removeItem(itemId: string): void {
    const equipment = props.actor.equipment.filter(
      (item) => item.id !== itemId,
    );

    emit('update:actor', { equipment });
    hotbarStore.removeByRef(itemId);

    triggerSaveIfNotEdit();
  }

  // --- Контекстное меню ---
  const isContextMenuOpen = ref(false);
  const contextMenuX = ref(0);
  const contextMenuY = ref(0);
  const contextMenuItem = ref<GameItem | null>(null);

  /**
   * Открывает контекстное меню для предмета
   * @param event - Событие мыши
   * @param item - Предмет снаряжения
   */
  function openContextMenu(event: MouseEvent, item: GameItem): void {
    event.preventDefault();
    event.stopPropagation();

    contextMenuX.value = event.clientX;
    contextMenuY.value = event.clientY;
    contextMenuItem.value = item;
    isContextMenuOpen.value = true;
  }

  /** Закрывает контекстное меню */
  function closeContextMenu(): void {
    isContextMenuOpen.value = false;
    contextMenuItem.value = null;
  }

  /** Обрабатывает выбор пункта меню */
  function handleContextMenuAction(
    action: 'attack' | 'edit' | 'delete' | 'share',
  ): void {
    if (!contextMenuItem.value) {
      return;
    }

    if (action === 'attack') {
      openRollModal(contextMenuItem.value);
    } else if (action === 'edit') {
      openEditModal(contextMenuItem.value);
    } else if (action === 'delete') {
      removeItem(contextMenuItem.value.id);
    } else if (action === 'share') {
      shareItemToChat(contextMenuItem.value);
    }

    closeContextMenu();
  }

  /**
   * Отправляет карточку предмета в чат.
   * @param item - предмет для публикации
   */
  function shareItemToChat(item: GameItem): void {
    chatStore.sendItemCard({
      cardType: 'equipment',
      title: item.name,
      payload: JSON.stringify(item),
    });
  }

  /**
   * Проверяет, является ли оружие универсальным (versatile)
   * @param item - предмет из инвентаря
   */
  function isVersatile(item: GameItem): boolean {
    return (
      item.type === 'weapon'
      && Boolean(item.weaponProperties?.includes('versatile'))
    );
  }

  /**
   * Вычисляет и форматирует бонус к броску атаки текущим оружием
   */
  function getWeaponAttackBonusLabel(weapon: GameItem): string {
    const mod = calculateWeaponAttackModifier(
      props.actor,
      weapon,
      resolvedStats.value,
    );

    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  /**
   * Формула урона оружия для бейджа — симметрично заклинаниям: кости без
   * инлайн-токенов + вложенный модификатор характеристики/магии (как «4к6+4»).
   *
   * @param weapon - оружие
   * @returns строка вида «4к6+4» / «1к8 + 1к6»
   */
  function weaponDamageFormulaLabel(weapon: GameItem): string {
    const base = formatWeaponDamageFormula(weapon);

    const mod =
      calculateWeaponDamageModifier(props.actor, weapon, resolvedStats.value)
      + (weapon.isMagical && weapon.magicBonus ? weapon.magicBonus : 0);

    if (mod === 0) {
      return base;
    }

    return `${base}${mod > 0 ? '+' : ''}${mod}`;
  }

  /**
   * Подпись вида урона оружия для строки листа: локализованные типы (несколько —
   * через « + ») и «Лечение», если у оружия есть лечащая часть.
   *
   * @param weapon - оружие
   * @returns подпись вида «Гром» / «Рубящий + Огонь» / «Лечение»
   */
  function weaponKindLabel(weapon: GameItem): string {
    const types = new Set<string>();

    let hasHealing = false;

    for (const part of weapon.damageParts ?? []) {
      const info = describeDamagePart(part);

      for (const type of info.types) {
        types.add(type);
      }

      if (info.isHealing) {
        hasHealing = true;
      }
    }

    const labels = [...types].map(
      (type) => damageTypeMap.value.get(type) ?? type,
    );

    if (hasHealing) {
      labels.push('Лечение');
    }

    return labels.join(' + ');
  }

  /**
   * Обновляет количество монет
   */
  function updateCurrency(
    coinKey: 'cp' | 'sp' | 'ep' | 'gp' | 'pp',
    value: string | number,
  ): void {
    const numericValue =
      typeof value === 'string' ? Number.parseInt(value, 10) || 0 : value;

    emit('update:actor', {
      system: {
        ...props.actor.system,
        currency: {
          ...(props.actor.system.currency || {
            cp: 0,
            sp: 0,
            ep: 0,
            gp: 0,
            pp: 0,
          }),
          [coinKey]: numericValue,
        },
      },
    });
  }
</script>

<template>
  <div class="flex min-h-[200px] flex-1 flex-col space-y-1">
    <!-- Деньги / Валюта (Вплотную к табам) -->
    <div class="mb-5 flex flex-col">
      <div class="flex items-center gap-3 rounded-lg bg-accented/30 px-3 py-2">
        <div
          v-for="coin in [
            {
              key: 'cp',
              label: 'ММ',
              full: 'Медные монеты',
              color: 'text-orange-600',
            },
            {
              key: 'sp',
              label: 'СМ',
              full: 'Серебряные монеты',
              color: 'text-muted',
            },
            {
              key: 'ep',
              label: 'ЭМ',
              full: 'Электрумовые монеты',
              color: 'text-indigo-300',
            },
            {
              key: 'gp',
              label: 'ЗМ',
              full: 'Золотые монеты',
              color: 'text-gold',
            },
            {
              key: 'pp',
              label: 'ПМ',
              full: 'Платиновые монеты',
              color: 'text-sky-200',
            },
          ] as const"
          :key="coin.key"
          class="flex flex-1 items-center gap-1.5"
        >
          <input
            :value="actor.system.currency?.[coin.key] ?? 0"
            type="number"
            min="0"
            class="w-0 min-w-0 flex-1 rounded bg-default/40 px-1.5 py-0.5 text-right text-xs font-semibold text-highlighted ring-1 ring-default/50 transition-shadow outline-none focus:ring-primary-500/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            @input="
              updateCurrency(
                coin.key,
                ($event.target as HTMLInputElement).value,
              )
            "
            @blur="triggerSaveIfNotEdit()"
          />

          <UTooltip
            :text="coin.full"
            :popper="{ placement: 'top' }"
          >
            <span :class="['cursor-help text-xs font-bold', coin.color]">
              {{ coin.label }}
            </span>
          </UTooltip>
        </div>
      </div>
    </div>

    <!-- Индикатор пустого списка -->
    <div
      v-if="actor.equipment.length === 0"
      class="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed px-3 py-8 text-xs transition-colors"
      :class="
        isDragOver
          ? 'border-primary-500/50 bg-primary-500/5 text-primary-400'
          : 'border-default/30 text-dimmed'
      "
    >
      Перетащите сюда
    </div>

    <!-- Список предметов с разделителями -->
    <template v-if="actor.equipment.length > 0">
      <div
        v-for="(group, index) in equipmentGroups"
        :key="group.label"
        class="flex flex-col"
      >
        <!-- Разделитель -->
        <h4
          class="mb-1 text-xs font-semibold tracking-wider text-muted uppercase"
          :class="index === 0 ? 'mt-0' : 'mt-5'"
        >
          {{ group.label }}
        </h4>

        <div class="flex flex-col gap-1">
          <UFieldGroup
            v-for="item in group.items"
            :key="item.id"
            size="lg"
            class="flex w-full items-stretch"
          >
            <!-- Кнопка применения оружия — внешний связанный сегмент
                 (иконка оружия, подсветка при экипировке) -->
            <UButton
              v-if="item.type === 'weapon'"
              :color="item.equipped ? 'primary' : 'neutral'"
              variant="soft"
              class="shrink-0"
              title="Атаковать"
              @click.left.exact.prevent.stop="openRollModal(item)"
            >
              <WeaponIcon
                :base-type="item.baseType"
                class="size-5"
              />
            </UButton>

            <!-- Иконка-сегмент для не-оружия (тот же размер для выравнивания) -->
            <UButton
              v-else
              :color="item.equipped ? 'primary' : 'neutral'"
              variant="soft"
              class="shrink-0"
              @click.left.exact.prevent.stop="
                !isEditMode && openDetailModal(item)
              "
            >
              <UIcon
                :name="
                  item.type === 'equipment'
                    ? getEquipmentCategoryIcon(item.equipmentCategory)
                    : (ITEM_TYPE_ICON_MAP[item.type] ?? DEFAULT_ITEM_ICON)
                "
                class="size-5"
              />
            </UButton>

            <!-- Карточка предмета (сетка) -->
            <div
              :draggable="true"
              class="grid flex-1 cursor-grab items-center gap-x-3 rounded-l-none bg-accented/30 px-3 py-2 transition-colors active:cursor-grabbing"
              :class="[
                !isEditMode ? 'hover:bg-accented/50' : '',
                isEditMode ? 'rounded-r-none' : 'rounded-r-lg',
              ]"
              :style="{
                gridTemplateColumns: 'minmax(0, 1fr) 2.75rem 7rem 4.5rem 5rem',
              }"
              @click.left.exact.prevent="!isEditMode && openDetailModal(item)"
              @contextmenu="openContextMenu($event, item)"
              @dragstart="handleItemDragStart($event, item)"
            >
              <!-- Сброс контекста группы, чтобы бейджи сохранили скругление -->
              <FieldGroupReset>
                <!-- col 1: Название + категория (две строки) -->
                <div class="col-start-1 flex min-w-0 flex-col">
                  <span class="truncate text-xs font-medium text-highlighted">
                    {{ item.name }}
                  </span>

                  <span
                    v-if="
                      (item.type === 'weapon' && item.baseType)
                      || (item.type === 'equipment' && item.equipmentCategory)
                      || (item.type === 'tool' && item.toolCategory)
                    "
                    class="truncate text-[10px] leading-tight text-dimmed"
                  >
                    <template v-if="item.type === 'weapon'">
                      {{ getWeaponCategoryLabel(item.baseType) }}
                    </template>

                    <template v-else-if="item.type === 'equipment'">
                      {{
                        armorCategoryMap.get(item.equipmentCategory ?? '')
                        ?? item.equipmentCategory
                      }}
                    </template>

                    <template v-else-if="item.type === 'tool'">
                      {{
                        toolCategoryMap.get(item.toolCategory ?? '')
                        ?? item.toolCategory
                      }}
                    </template>
                  </span>
                </div>

                <!-- Бонус атаки (оружие) -->
                <div
                  v-if="item.type === 'weapon' && item.damageParts?.length"
                  class="col-start-2 flex flex-col items-start"
                >
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="font-mono font-bold"
                  >
                    {{ getWeaponAttackBonusLabel(item) }}
                  </UBadge>

                  <span class="mt-0.5 text-[9px] leading-none text-dimmed">
                    Атака
                  </span>
                </div>

                <!-- Урон (оружие) / КД (доспех) / Бонус (инструмент) -->
                <div
                  v-if="
                    (item.type === 'weapon' && item.damageParts?.length)
                    || (item.type === 'equipment' && item.baseArmorAC)
                    || (item.type === 'tool' && item.toolBonus)
                  "
                  class="col-start-3 flex min-w-0 flex-col items-start"
                >
                  <UBadge
                    v-if="item.type === 'weapon' && item.damageParts?.length"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="font-mono"
                  >
                    {{ weaponDamageFormulaLabel(item) }}
                  </UBadge>

                  <UBadge
                    v-else-if="item.type === 'equipment' && item.baseArmorAC"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="font-mono"
                  >
                    КД {{ (item.baseArmorAC ?? 0) + (item.magicBonus ?? 0) }}
                  </UBadge>

                  <UBadge
                    v-else-if="item.type === 'tool' && item.toolBonus"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="font-mono"
                  >
                    +{{ item.toolBonus }}
                  </UBadge>

                  <span
                    :title="
                      item.type === 'weapon' ? weaponKindLabel(item) : undefined
                    "
                    class="mt-0.5 max-w-full truncate text-left text-[9px] leading-none text-dimmed"
                  >
                    {{
                      (item.type === 'weapon' ? weaponKindLabel(item) : '')
                      || '\u00A0'
                    }}
                  </span>
                </div>

                <!-- Количество -->
                <div
                  class="col-start-4 flex items-center justify-center gap-0.5"
                >
                  <UButton
                    icon="tabler:minus"
                    color="neutral"
                    variant="ghost"
                    size="2xs"
                    :disabled="item.quantity <= 1"
                    @click.left.exact.prevent.stop="
                      updateItemQuantity(item.id, (item.quantity ?? 1) - 1)
                    "
                  />

                  <input
                    type="number"
                    :value="item.quantity ?? 1"
                    min="1"
                    class="w-8 [appearance:textfield] rounded border border-default bg-elevated/60 text-center text-xs text-highlighted focus:border-primary-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    @change="
                      updateItemQuantity(
                        item.id,
                        Number(($event.target as HTMLInputElement).value),
                      )
                    "
                    @click.stop
                  />

                  <UButton
                    icon="tabler:plus"
                    color="neutral"
                    variant="ghost"
                    size="2xs"
                    @click.left.exact.prevent.stop="
                      updateItemQuantity(item.id, (item.quantity ?? 1) + 1)
                    "
                  />
                </div>

                <!-- Кнопки экипировки/хвата/настройки (в конце строки) -->
                <div class="col-start-5 flex items-center justify-end gap-0.5">
                  <!-- Экипировать/Снять -->
                  <UTooltip
                    :text="
                      isEquipDisabled(item)
                        ? 'Уже надето другое снаряжение'
                        : item.equipped
                          ? 'Снять'
                          : 'Экипировать'
                    "
                  >
                    <UButton
                      :icon="
                        item.equipped ? 'tabler:circle-filled' : 'tabler:circle'
                      "
                      :color="item.equipped ? 'primary' : 'neutral'"
                      variant="ghost"
                      size="xs"
                      :disabled="isEquipDisabled(item)"
                      @click.left.exact.prevent.stop="toggleEquipped(item.id)"
                    />
                  </UTooltip>

                  <!-- Хват двумя руками (только versatile) -->
                  <UTooltip
                    v-if="
                      item.type === 'weapon'
                      && isVersatile(item)
                      && item.equipped
                    "
                    :text="
                      item.twoHandedGrip
                        ? 'Взять одной рукой'
                        : 'Взять двумя руками'
                    "
                  >
                    <UButton
                      :icon="
                        item.twoHandedGrip
                          ? 'tabler:circle-filled'
                          : 'tabler:circle'
                      "
                      :color="item.twoHandedGrip ? 'primary' : 'neutral'"
                      variant="ghost"
                      size="xs"
                      @click.left.exact.prevent.stop="
                        toggleTwoHandedGrip(item.id)
                      "
                    />
                  </UTooltip>

                  <!-- Настройка (attunement) -->
                  <UTooltip
                    v-if="
                      item.magicAttunement && item.magicAttunement !== 'none'
                    "
                    :text="item.isAttuned ? 'Снять настройку' : 'Настроить'"
                  >
                    <UButton
                      :icon="item.isAttuned ? 'tabler:link' : 'tabler:unlink'"
                      :color="item.isAttuned ? 'warning' : 'neutral'"
                      variant="ghost"
                      size="xs"
                      @click.left.exact.prevent.stop="toggleAttuned(item.id)"
                    />
                  </UTooltip>
                </div>
              </FieldGroupReset>
            </div>

            <!-- Редактировать / Удалить — сегменты, появляются в режиме
                 редактирования и не занимают место в обычном режиме -->
            <template v-if="isEditMode">
              <UTooltip
                v-if="
                  item.type === 'weapon'
                  || item.type === 'equipment'
                  || item.type === 'spell'
                  || item.type === 'tool'
                "
                text="Редактировать"
              >
                <UButton
                  icon="tabler:edit"
                  color="neutral"
                  variant="soft"
                  @click.left.exact.prevent.stop="openEditModal(item)"
                />
              </UTooltip>

              <UButton
                icon="tabler:trash"
                color="error"
                variant="soft"
                @click.left.exact.prevent.stop="removeItem(item.id)"
              />
            </template>
          </UFieldGroup>
        </div>
      </div>
    </template>
  </div>

  <DiceRollModal
    v-model:open="isRollModalOpen"
    :formula="rollConfig.formula"
    :title="`Атака — ${rollConfig.name}`"
    :roll-label="rollConfig.name"
    :attack-modifier="rollConfig.attackModifier"
    :evaluate-conditional-bonuses="rollConfig.evaluateBonuses"
    :initial-roll-mode="rollConfig.initialRollMode"
    :incoming-attack-type="rollConfig.incomingAttackType"
    :damage-type="rollConfig.damageType"
    :damage-parts="rollConfig.damageParts"
    :evaluate-bonus-damage-parts="rollConfig.evaluateBonusDamageParts"
    :on-roll-parts="rollConfig.onRollParts"
    :on-hit="rollConfig.onHit"
    roll-button-text="Атаковать"
  />

  <!-- Контекстное меню (Teleport для корректного z-index) -->
  <Teleport to="body">
    <div
      v-if="isContextMenuOpen && contextMenuItem"
      class="fixed inset-0 z-10000"
      @click.left.exact.prevent="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    >
      <div
        class="absolute min-w-[180px] rounded-lg border border-default bg-default py-1 shadow-xl"
        :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
        @click.stop
      >
        <!-- Атаковать (только для оружия с формулой урона) -->
        <button
          v-if="
            contextMenuItem.type === 'weapon'
            && contextMenuItem.damageParts?.length
          "
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleContextMenuAction('attack')"
        >
          <UIcon
            name="tabler:sword"
            class="h-4 w-4 text-muted"
          />
          Атаковать
        </button>

        <!-- Разделитель после «Атаковать» -->
        <div
          v-if="
            contextMenuItem.type === 'weapon'
            && contextMenuItem.damageParts?.length
          "
          class="mx-2"
        />

        <!-- Редактировать -->
        <button
          v-if="
            contextMenuItem.type === 'weapon'
            || contextMenuItem.type === 'equipment'
            || contextMenuItem.type === 'spell'
            || contextMenuItem.type === 'tool'
          "
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleContextMenuAction('edit')"
        >
          <UIcon
            name="tabler:edit"
            class="h-4 w-4 text-muted"
          />
          Редактировать
        </button>

        <!-- Разделитель -->
        <div
          v-if="
            contextMenuItem.type === 'weapon'
            || contextMenuItem.type === 'equipment'
            || contextMenuItem.type === 'spell'
            || contextMenuItem.type === 'tool'
          "
          class="mx-2 my-1 border-t border-default/50"
        />

        <!-- Поделиться в чат -->
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleContextMenuAction('share')"
        >
          <UIcon
            name="tabler:message-share"
            class="h-4 w-4 text-muted"
          />
          Поделиться в чат
        </button>

        <!-- Разделитель -->

        <!-- Удалить -->
        <ContextMenuDangerItem
          icon="tabler:trash"
          @click="handleContextMenuAction('delete')"
        >
          Удалить
        </ContextMenuDangerItem>
      </div>
    </div>
  </Teleport>
</template>
