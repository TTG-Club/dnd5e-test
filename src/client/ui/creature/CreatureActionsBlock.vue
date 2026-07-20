<script setup lang="ts">
  import type { MeasurementTemplate, SceneEntity } from '@vtt/shared';
  import type {
    AttackRollMode,
    Creature,
    CreatureAction,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type {
    RolledSpellDamagePart,
    SpellDamagePartInput,
  } from '../../composables/useSpellResolution';

  import {
    collectActiveEffects,
    describeDamagePart,
    getActionDescriptionMarkdown,
    SPELL_DAMAGE_TEMPLATE_COLORS,
    SPELL_TEMPLATE_DEFAULT_COLOR,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import { startHotbarDrag } from '@/core/utils/hotbarDrag';
  import { ContextMenuDangerItem } from '@/shared_ui/components';
  import FieldGroupReset from '@/shared_ui/components/FieldGroupReset.vue';
  import { useChatStore } from '@/stores/chatStore';
  import { useSpellTemplateStore } from '@/stores/spellTemplateStore';
  import { useTargetStore } from '@/stores/targetStore';
  import { useWorldStore } from '@/stores/worldStore';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import { useBonusDamageParts } from '../../composables/useBonusDamageParts';
  import { useSpellResolution } from '../../composables/useSpellResolution';
  import DiceRollModal from '../actor/DiceRollModal.vue';
  import { checkCreatureActionRangeOnScene } from './composables/useCreatureRangeCheck';
  import CreatureActionDetailModal from './CreatureActionDetailModal.vue';
  import CreatureActionFormModal from './CreatureActionFormModal.vue';

  type ActionMode = 'trait' | 'action';

  interface Props {
    title?: string;
    actions: CreatureAction[];
    isEditMode: boolean;
    legendaryCount?: number;
    /** Режим: черта или действие (влияет на отображение боевых полей) */
    mode?: ActionMode;
    /** Режим только просмотр (компендиум) */
    isReadOnly?: boolean;
    /** ID существа для поддержки drag-and-drop на hotbar */
    creatureId?: string;
    /** Имя существа для подписи в hotbar */
    creatureName?: string;
  }

  const props = withDefaults(defineProps<Props>(), {
    title: undefined,
    legendaryCount: undefined,
    mode: 'action',
    isReadOnly: false,
    creatureId: undefined,
    creatureName: undefined,
  });

  const emit = defineEmits<{
    'update': [actions: CreatureAction[]];
    'update:legendaryCount': [count: number];
  }>();

  const systemDataStore = useSystemDataStore();
  const chatStore = useChatStore();
  const targetStore = useTargetStore();
  const worldStore = useWorldStore();
  const spellTemplateStore = useSpellTemplateStore();

  const { buildCreatureRollSetup, buildTargetHpContext } =
    useBonusDamageParts();

  const { resolveSpellDamageWithParts } = useSpellResolution();

  // ── Просмотр действия (модалка) ──────────────────────────────────────────

  const isDetailOpen = ref(false);
  const detailAction = ref<CreatureAction | undefined>(undefined);

  /**
   * Открывает модалку просмотра действия (как у заклинаний/снаряжения).
   * @param action - действие существа
   */
  function openDetailModal(action: CreatureAction): void {
    detailAction.value = action;
    isDetailOpen.value = true;
  }

  /** «Атаковать» из модалки просмотра: закрывает её и запускает бросок */
  function handleDetailAttack(): void {
    const action = detailAction.value;

    isDetailOpen.value = false;

    if (action) {
      openRollModal(action);
    }
  }

  // ── Модалка создания/редактирования ─────────────────────────────────────

  const isFormOpen = ref(false);
  const editingAction = ref<CreatureAction | undefined>(undefined);
  const editingIndex = ref(-1);

  /**
   * Открывает модалку для создания нового действия
   */
  function openCreateForm(): void {
    editingAction.value = undefined;
    editingIndex.value = -1;
    isFormOpen.value = true;
  }

  /**
   * Открывает модалку для редактирования существующего действия
   * @param index - индекс действия в массиве
   */
  function openEditForm(index: number): void {
    editingAction.value = props.actions[index];
    editingIndex.value = index;
    isFormOpen.value = true;
  }

  /**
   * Обработчик сохранения из модалки
   * @param action - сохранённое действие
   * @param index - индекс (-1 = создание)
   */
  function handleActionSave(action: CreatureAction, index: number): void {
    if (index >= 0 && index < props.actions.length) {
      const updated = props.actions.map((existingAction, actionIndex) =>
        actionIndex === index ? action : existingAction,
      );

      emit('update', updated);
    } else {
      emit('update', [...props.actions, action]);
    }
  }

  /**
   * Удаляет действие по индексу
   * @param index - индекс действия
   */
  function removeAction(index: number): void {
    const updated = props.actions.filter(
      (_, actionIndex) => actionIndex !== index,
    );

    emit('update', updated);
  }

  /**
   * Возвращает локализованное название типа урона
   * @param damageTypeKey - ключ типа урона
   */
  function getDamageTypeLabel(damageTypeKey: string): string {
    const found = systemDataStore.damageTypes.find(
      (entry) => entry.key === damageTypeKey,
    );

    return found?.name ?? damageTypeKey;
  }

  /**
   * Сводка урона/лечения действия для inline-отображения: формула (без токенов)
   * и локализованные типы. Единая со заклинаниями/оружием система damageParts.
   *
   * @param action - действие существа
   * @returns формула и подпись типов или null (нет частей урона)
   */
  function actionDamageSummary(
    action: CreatureAction,
  ): { formula: string; typeLabel: string } | null {
    const parts = action.damageParts ?? [];

    if (parts.length === 0) {
      return null;
    }

    const infos = parts.map((part) => describeDamagePart(part));

    const typeKeys = [...new Set(infos.flatMap((info) => info.types))];

    return {
      formula: infos.map((info) => info.formula).join(' + '),
      typeLabel: typeKeys.map((key) => getDamageTypeLabel(key)).join(', '),
    };
  }

  /** Основной тип урона действия (для цвета шаблона и подписи броска) */
  function actionPrimaryType(action: CreatureAction): string | undefined {
    const first = action.damageParts?.[0];

    return first ? describeDamagePart(first).types[0] : undefined;
  }

  /** Есть ли у действия спасбросок (заменяет бросок попадания) */
  function actionHasSave(action: CreatureAction): boolean {
    return !!action.saveType && action.saveType !== 'none';
  }

  /**
   * Проверяет, есть ли у действия боевые параметры (атака, урон или спасбросок)
   * @param action - действие
   */
  function hasAttackParams(action: CreatureAction): boolean {
    return !!(
      action.attackBonus !== undefined
      || (action.damageParts && action.damageParts.length > 0)
      || actionHasSave(action)
    );
  }

  /**
   * Проверяет, есть ли у действия эффекты
   * @param action - действие
   */
  function hasEffects(action: CreatureAction): boolean {
    return !!(action.activeEffects && action.activeEffects.length > 0);
  }

  // ── Контекстное меню (ПКМ) ──────────────────────────────────────────────

  const isContextMenuOpen = ref(false);
  const contextMenuX = ref(0);
  const contextMenuY = ref(0);
  const contextMenuIndex = ref(-1);

  /**
   * Открывает контекстное меню по ПКМ
   * @param event - событие contextmenu
   * @param index - индекс действия
   */
  function openContextMenu(event: MouseEvent, index: number): void {
    if (props.isReadOnly) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    contextMenuX.value = event.clientX;
    contextMenuY.value = event.clientY;
    contextMenuIndex.value = index;
    isContextMenuOpen.value = true;
  }

  /** Закрывает контекстное меню */
  function closeContextMenu(): void {
    isContextMenuOpen.value = false;
    contextMenuIndex.value = -1;
  }

  /**
   * Обработчик «Атаковать» из контекстного меню
   */
  function handleContextAttack(): void {
    const action = props.actions[contextMenuIndex.value];

    closeContextMenu();

    if (action) {
      openRollModal(action);
    }
  }

  /**
   * Обработчик «Редактировать» из контекстного меню
   */
  function handleContextEdit(): void {
    const index = contextMenuIndex.value;

    closeContextMenu();
    openEditForm(index);
  }

  /**
   * Обработчик «Поделиться в чат» из контекстного меню
   */
  function handleContextShare(): void {
    const action = props.actions[contextMenuIndex.value];

    closeContextMenu();

    if (!action) {
      return;
    }

    const featurePayload = {
      name: action.name,
      description: getActionDescriptionMarkdown(action),
      featureType: props.mode === 'trait' ? 'feat' : 'feature',
    };

    chatStore.sendItemCard({
      cardType: 'feature',
      title: action.name,
      payload: JSON.stringify(featurePayload),
    });
  }

  /**
   * Обработчик «Удалить» из контекстного меню
   */
  function handleContextDelete(): void {
    const index = contextMenuIndex.value;

    closeContextMenu();
    removeAction(index);
  }

  // ── Броски урона ────────────────────────────────────────────────────────

  const isRollModalOpen = ref(false);

  const rollConfig = ref({
    title: '',
    name: '',
    formula: '',
    rollButtonText: 'Атаковать',
    attackModifier: undefined as number | undefined,
    initialRollMode: 'normal' as AttackRollMode,
    incomingAttackType: undefined as 'melee' | 'ranged' | 'spell' | undefined,
    damageType: undefined as string | undefined,
    damageParts: [] as SpellDamagePartInput[],
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

  /** Существо-источник действий (для casterId, эффектов, @-переменных) */
  function getCreatureEntity(): Creature | null {
    if (!props.creatureId) {
      return null;
    }

    const worldId = worldStore.connectionState.currentWorldId;
    const world = worldStore.worlds.find((entry) => entry.id === worldId);

    return (
      world?.creatures?.find((entry) => entry.id === props.creatureId) ?? null
    );
  }

  /** Сущности текущего мира (акторы + существа) — цели применения */
  function getCurrentWorldEntities(): SceneEntity[] {
    const worldId = worldStore.connectionState.currentWorldId;
    const world = worldStore.worlds.find((entry) => entry.id === worldId);

    if (!world) {
      return [];
    }

    return [...(world.actors ?? []), ...(world.creatures ?? [])];
  }

  /**
   * Открывает модалку броска для действия. Атаки идут с броском попадания,
   * действия со спасброском/областью — без него (цель кидает спас). Перед
   * прямой атакой проверяется дистанция; для области сначала размещается шаблон.
   *
   * @param action - действие существа
   */
  function openRollModal(action: CreatureAction): void {
    if (!hasAttackParams(action)) {
      return;
    }

    const creature = getCreatureEntity();

    if (!creature) {
      return;
    }

    // Проверка дистанции — только для прямых атак (область таргетится шаблоном)
    let isDisadvantage = false;

    if (!action.areaOfEffect && targetStore.targetTokenId && props.creatureId) {
      const rangeCheck = checkCreatureActionRangeOnScene(
        action,
        props.creatureId,
        targetStore.targetTokenId,
      );

      if (rangeCheck && !rangeCheck.allowed) {
        chatStore.sendMessage(
          `⛔ ${action.name}: цель вне досягаемости (${rangeCheck.distance} ${rangeCheck.unitLabel})`,
          'text',
        );

        return;
      }

      if (rangeCheck?.disadvantage) {
        isDisadvantage = true;
      }
    }

    // Область: сначала размещаем шаблон у токена существа, затем кидаем урон
    if (action.areaOfEffect) {
      const color =
        SPELL_DAMAGE_TEMPLATE_COLORS[actionPrimaryType(action) ?? '']
        ?? SPELL_TEMPLATE_DEFAULT_COLOR;

      spellTemplateStore.requestPlacement(
        action.areaOfEffect,
        color,
        props.creatureId,
        (templateId) =>
          startActionRoll(action, creature, isDisadvantage, templateId),
        null,
      );

      return;
    }

    startActionRoll(action, creature, isDisadvantage, undefined);
  }

  /**
   * Готовит и открывает DiceRollModal для действия (многочастный путь).
   *
   * @param action - действие существа
   * @param creature - существо-источник
   * @param isDisadvantage - стартовать с помехой (проверка дистанции)
   * @param templateId - id размещённого AoE-шаблона (если действие с областью)
   */
  function startActionRoll(
    action: CreatureAction,
    creature: Creature,
    isDisadvantage: boolean,
    templateId: string | undefined,
  ): void {
    const usesSaveOrArea = actionHasSave(action) || !!action.areaOfEffect;

    const effects = collectActiveEffects(creature);

    // Состояние HP цели для @target.* — только у одиночной цели (не у области)
    const targetHp = action.areaOfEffect ? undefined : buildTargetHpContext();

    const targetIsFull = targetHp
      ? targetHp.currentHp >= targetHp.maxHp
      : undefined;

    const setup = buildCreatureRollSetup({
      action,
      creature,
      effects,
      targetIsFull,
    });

    // Эффекты действия (статус/урон со своим applySave) обрабатывает
    // оркестратор per-target через `pseudoSpell.activeEffects` (выставлено в
    // buildCreatureRollSetup) — единый путь со заклинаниями и оружием.
    rollConfig.value = {
      title: usesSaveOrArea ? action.name : `Атака — ${action.name}`,
      name: action.name,
      formula: setup.baseParts[0]?.formula ?? '',
      rollButtonText: usesSaveOrArea ? 'Бросить урон' : 'Атаковать',
      attackModifier: usesSaveOrArea ? undefined : action.attackBonus,
      initialRollMode: isDisadvantage ? 'disadvantage' : 'normal',
      incomingAttackType: action.rangeType === 'ranged' ? 'ranged' : 'melee',
      damageType: actionPrimaryType(action),
      damageParts: setup.baseParts,
      evaluateBonusDamageParts: setup.evaluateBonusDamageParts,
      onRollParts: (parts: RolledSpellDamagePart[]) =>
        applyActionParts(
          action,
          creature,
          setup.pseudoSpell,
          parts,
          templateId,
        ),
    };

    isRollModalOpen.value = true;
  }

  /**
   * Применяет брошенные части урона действия через многочастный оркестратор:
   * спасброски целей (одиночная цель или AoE-шаблон), защиты по типу, единый
   * HP-апдейт и одно сообщение в чат.
   *
   * @param action - действие существа (источник DC спасброска)
   * @param creature - существо-источник (casterId для self-частей)
   * @param pseudoSpell - псевдо-заклинание действия (saveType/saveEffect/эффекты)
   * @param parts - брошенные части урона
   * @param templateId - id размещённого AoE-шаблона (если был)
   */
  function applyActionParts(
    action: CreatureAction,
    creature: Creature,
    pseudoSpell: Spell,
    parts: RolledSpellDamagePart[],
    templateId: string | undefined,
  ): void {
    const actors = getCurrentWorldEntities();
    const socket = chatStore.getSocket();

    let cachedTemplate: MeasurementTemplate | null = null;

    if (templateId) {
      cachedTemplate = spellTemplateStore.getPlacedTemplate(templateId) ?? null;
      spellTemplateStore.removePlacedTemplate(templateId);
    }

    if (actors.length > 0 && socket) {
      void resolveSpellDamageWithParts(
        {
          spell: pseudoSpell,
          damageTotal: 0,
          spellSaveDC: action.saveDC ?? 10,
          actors,
          socket,
          casterId: creature.id,
        },
        parts,
        { scene: worldStore.currentScene, cachedTemplate },
      );
    }

    if (templateId) {
      spellTemplateStore.deleteTemplate(templateId);
    }
  }

  /**
   * Обрабатывает клик по строке действия:
   * - В режиме редактирования — открывает форму
   * - В остальных случаях — открывает модалку просмотра (бросок запускается
   *   отдельной кнопкой в начале строки)
   *
   * @param action - действие существа
   * @param index - индекс действия
   */
  function handleActionClick(action: CreatureAction, index: number): void {
    if (props.isEditMode && !props.isReadOnly) {
      openEditForm(index);
    } else {
      openDetailModal(action);
    }
  }

  /**
   * Можно ли запустить бросок действия прямо из строки (есть боевые параметры,
   * не компендиум, известно существо-источник).
   * @param action - действие существа
   */
  function canUseAction(action: CreatureAction): boolean {
    return !props.isReadOnly && !!props.creatureId && hasAttackParams(action);
  }

  /** Показывать ли кнопку «Атаковать» в модалке просмотра действия */
  const canAttackFromDetail = computed(
    () => !!detailAction.value && canUseAction(detailAction.value),
  );

  /**
   * Обрабатывает ввод количества легендарных действий
   * @param event - событие ввода
   */
  function handleLegendaryCountInput(event: Event): void {
    emit(
      'update:legendaryCount',
      Number((event.target as HTMLInputElement).value),
    );
  }

  /**
   * Обработчик dragstart для перетаскивания действия на hotbar
   */
  function handleDragStart(event: DragEvent, action: CreatureAction): void {
    if (!props.creatureId) {
      return;
    }

    const label = props.creatureName
      ? `${props.creatureName} — ${action.name}`
      : action.name;

    startHotbarDrag(event, {
      id: `${props.creatureId}-${action.name.replace(/\\s+/g, '-')}`,
      type: 'creature-action',
      label,
      icon: 'tabler:alien',
      ref: action.name,
      actorId: props.creatureId,
    });
  }
</script>

<template>
  <div
    v-if="isEditMode || actions.length > 0"
    class="space-y-2"
  >
    <!-- Заголовок секции -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <h3
          v-if="title"
          class="text-sm font-bold tracking-wider text-highlighted uppercase"
        >
          {{ title }}
        </h3>

        <!-- Счётчик легендарных действий -->
        <template v-if="legendaryCount !== undefined">
          <span class="text-xs text-muted">({{ legendaryCount }}/раунд)</span>

          <input
            v-if="isEditMode"
            :value="legendaryCount"
            type="number"
            min="0"
            max="5"
            class="ml-1 w-10 border-b border-muted bg-transparent text-center text-xs text-highlighted outline-none focus:border-primary"
            @input="handleLegendaryCountInput"
          />
        </template>
      </div>

      <button
        v-if="isEditMode"
        type="button"
        class="flex items-center gap-1 rounded-full border border-dashed border-muted px-2 py-0.5 text-muted transition-colors hover:border-primary hover:text-primary"
        @click.left.exact.prevent="openCreateForm"
      >
        <UIcon
          name="tabler:plus"
          class="size-3.5"
        />

        <span class="text-xs">Добавить</span>
      </button>
    </div>

    <!-- Список действий -->
    <div class="space-y-1">
      <UFieldGroup
        v-for="(action, index) in actions"
        :key="index"
        size="lg"
        class="group flex w-full"
      >
        <!-- Использовать действие (бросок) -->
        <UTooltip
          v-if="canUseAction(action)"
          text="Использовать"
        >
          <UButton
            icon="tabler:current-location"
            color="primary"
            variant="soft"
            @click.left.exact.prevent.stop="openRollModal(action)"
          />
        </UTooltip>

        <!-- Основная часть: имя + параметры (клик = просмотр/редактирование) -->
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-0 flex-1 justify-start gap-3"
          :draggable="!isEditMode && !!creatureId"
          @click.left.exact.prevent="handleActionClick(action, index)"
          @contextmenu="openContextMenu($event, index)"
          @dragstart="handleDragStart($event, action)"
        >
          <!-- Сброс контекста группы: бейджи внутри кнопки-члена UFieldGroup
               иначе наследуют «склейку» и теряют скругление -->
          <FieldGroupReset>
            <!-- Сетка с фиксированными колонками: боевые параметры
                 выравниваются по столбцам между строками (как в снаряжении) -->
            <div
              class="grid w-full min-w-0 items-center gap-x-3"
              :style="{
                gridTemplateColumns:
                  'minmax(0, 1fr) 3.5rem 4.5rem 7rem 5.5rem 2.75rem',
              }"
            >
              <!-- col 1: Название -->
              <span
                class="col-start-1 min-w-0 truncate text-left text-sm font-medium text-highlighted"
              >
                {{ action.name }}
              </span>

              <!-- Боевые параметры -->
              <template v-if="hasAttackParams(action)">
                <!-- col 2: Тип дальности -->
                <span
                  v-if="action.rangeType"
                  class="col-start-2 text-xs text-dimmed"
                >
                  {{ action.rangeType === 'ranged' ? 'Дальн.' : 'Ближн.' }}
                </span>

                <!-- col 3: Бонус к попаданию / Спасбросок -->
                <div class="col-start-3 flex">
                  <UBadge
                    v-if="
                      action.attackBonus !== undefined && !actionHasSave(action)
                    "
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="font-mono"
                  >
                    {{ action.attackBonus >= 0 ? '+' : ''
                    }}{{ action.attackBonus }}
                  </UBadge>

                  <UBadge
                    v-else-if="actionHasSave(action)"
                    color="error"
                    variant="subtle"
                    size="sm"
                    class="font-mono"
                  >
                    Спас {{ action.saveDC ?? '?' }}
                  </UBadge>
                </div>

                <!-- col 4: Урон / лечение (формула) -->
                <div
                  v-if="actionDamageSummary(action)"
                  class="col-start-4 flex min-w-0"
                >
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="font-mono"
                  >
                    {{ actionDamageSummary(action)!.formula }}
                  </UBadge>
                </div>

                <!-- col 5: Тип урона -->
                <span
                  v-if="actionDamageSummary(action)?.typeLabel"
                  :title="actionDamageSummary(action)!.typeLabel"
                  class="col-start-5 truncate text-xs text-dimmed"
                >
                  {{ actionDamageSummary(action)!.typeLabel }}
                </span>
              </template>

              <!-- col 6: Эффекты -->
              <div class="col-start-6 flex justify-end">
                <UBadge
                  v-if="hasEffects(action)"
                  color="warning"
                  variant="subtle"
                  size="sm"
                >
                  <UIcon
                    name="tabler:sparkles"
                    class="mr-0.5 size-3"
                  />
                  {{ action.activeEffects!.length }}
                </UBadge>
              </div>
            </div>
          </FieldGroupReset>
        </UButton>

        <!-- Редактировать (режим редактирования) -->
        <UButton
          v-if="isEditMode && !isReadOnly"
          icon="tabler:pencil"
          color="neutral"
          variant="soft"
          title="Редактировать"
          @click.left.exact.prevent.stop="openEditForm(index)"
        />

        <!-- Удалить (режим редактирования) -->
        <UButton
          v-if="isEditMode && !isReadOnly"
          icon="tabler:trash"
          color="error"
          variant="soft"
          title="Удалить"
          @click.left.exact.prevent.stop="removeAction(index)"
        />
      </UFieldGroup>
    </div>

    <!-- Контекстное меню (ПКМ) -->
    <Teleport to="body">
      <div
        v-if="isContextMenuOpen"
        class="fixed inset-0 z-10000"
        @click.left.exact.prevent="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      >
        <div
          class="absolute min-w-[180px] rounded-lg border border-default bg-default py-1 shadow-xl"
          :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
          @click.stop
        >
          <!-- Атаковать -->
          <button
            v-if="
              contextMenuIndex >= 0
              && hasAttackParams(actions[contextMenuIndex])
            "
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
            @click.left.exact.prevent="handleContextAttack"
          >
            <UIcon
              name="tabler:swords"
              class="h-4 w-4 text-muted"
            />
            Атаковать
          </button>

          <!-- Редактировать -->
          <button
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
            @click.left.exact.prevent="handleContextEdit"
          >
            <UIcon
              name="tabler:edit"
              class="h-4 w-4 text-muted"
            />
            Редактировать
          </button>

          <!-- Поделиться в чат -->
          <button
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
            @click.left.exact.prevent="handleContextShare"
          >
            <UIcon
              name="tabler:message-share"
              class="h-4 w-4 text-muted"
            />
            Поделиться в чат
          </button>

          <!-- Разделитель -->
          <div class="mx-2 my-1 border-t border-default/50" />

          <!-- Удалить -->
          <ContextMenuDangerItem
            icon="tabler:trash"
            @click="handleContextDelete"
          >
            Удалить
          </ContextMenuDangerItem>
        </div>
      </div>
    </Teleport>

    <!-- Модалка создания/редактирования -->
    <CreatureActionFormModal
      v-model:open="isFormOpen"
      :action="editingAction"
      :mode="mode"
      :index="editingIndex"
      @save="handleActionSave"
    />

    <DiceRollModal
      v-model:open="isRollModalOpen"
      :formula="rollConfig.formula"
      :title="rollConfig.title"
      :roll-label="rollConfig.name"
      :attack-modifier="rollConfig.attackModifier"
      :initial-roll-mode="rollConfig.initialRollMode"
      :incoming-attack-type="rollConfig.incomingAttackType"
      :damage-type="rollConfig.damageType"
      :roll-button-text="rollConfig.rollButtonText"
      :damage-parts="rollConfig.damageParts"
      :evaluate-bonus-damage-parts="rollConfig.evaluateBonusDamageParts"
      :on-roll-parts="rollConfig.onRollParts"
      :on-hit="rollConfig.onHit"
    />

    <!-- Модалка просмотра действия -->
    <CreatureActionDetailModal
      v-model:open="isDetailOpen"
      :action="detailAction ?? null"
      :mode="mode"
      :show-attack-button="canAttackFromDetail"
      @attack="handleDetailAttack"
    />
  </div>
</template>
