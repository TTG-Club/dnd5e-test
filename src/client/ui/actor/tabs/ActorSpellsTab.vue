<script setup lang="ts">
  import type { SceneEntity } from '@vtt/shared';
  import type {
    Actor,
    AttackRollMode,
    ClassDefinition,
    ClassLevelEntry,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type {
    RolledSpellDamagePart,
    SpellDamagePartInput,
  } from '../../../composables/useSpellResolution';

  import { useToast } from '@nuxt/ui/composables';
  import {
    calculateSpellAttackModifier,
    collectActiveEffects,
    combineEffectsWithAmbient,
    computeSpellSlots,
    damagePartIsHealing,
    getAvailableSpellLevels,
    getPactSlotInfo,
    getSpellAttackType,
    getSpellDamageParts,
    getSpellPrimaryDamageType,
    getSpellProjectileCount,
    getTotalLevel,
    pickCantripTierParts,
    resolveActorStats,
    resolveDamagePartsForCast,
    resolveSpellDamageFormula,
    SPELL_DAMAGE_TEMPLATE_COLORS,
    SPELL_LEVEL_LABELS,
    SPELL_TEMPLATE_DEFAULT_COLOR,
    spellIsHealing,
  } from '@vtt/shared/system/dnd.js';
  import { computed, onMounted, ref } from 'vue';

  import { loadCompendiumKind } from '@/core/compendiumDataClient';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { useActionPromptStore } from '@/stores/actionPromptStore';
  import { useAuraStore } from '@/stores/auraStore';
  import { useChatStore } from '@/stores/chatStore';
  import { useHotbarStore } from '@/stores/hotbarStore';
  import { useSpellTemplateStore } from '@/stores/spellTemplateStore';
  import { useTargetStore } from '@/stores/targetStore';
  import { useWorldStore } from '@/stores/worldStore';

  import {
    getCasterSpellEffects,
    getTargetSpellEffects,
    instantiateSpellEffects,
  } from '../../../composables/spellResolutionShared';
  import { useBonusDamageParts } from '../../../composables/useBonusDamageParts';
  import {
    getSpellMaxRangeOnScene,
    isSpellCastBlockedByRange,
    isSpellTargetBlockedByRange,
  } from '../../../composables/useSceneRangeCheck';
  import { useSpellResolution } from '../../../composables/useSpellResolution';
  import SpellcastingSettingsModal from '../SpellcastingSettingsModal.vue';
  import SpellListItem from '../SpellListItem.vue';

  const props = defineProps<{
    actor: Actor;
    isEditMode: boolean;
    isDragOver?: boolean;
  }>();

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
    'immediate-save': [];
  }>();

  /**
   * Запрашивает у хозяина вкладки немедленное сохранение актёра — только вне
   * режима редактирования. В режиме редактирования изменения копятся в
   * локальной копии до «Сохранить»: немедленный push рассинхронизировал бы
   * снапшот отката (последующая «Отмена» затирала бы уже сохранённое).
   */
  function triggerSaveIfNotEdit() {
    if (!props.isEditMode) {
      emit('immediate-save');
    }
  }

  const { openModal } = useModalManager();
  const worldStore = useWorldStore();
  const chatStore = useChatStore();
  const targetStore = useTargetStore();

  const {
    needsAutoResolution,
    resolveSpellDamage,
    resolveSpellDamageWithParts,
  } = useSpellResolution();

  const { hasSpellBonusDamage, buildSpellBonusEvaluator } =
    useBonusDamageParts();

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

  function getWorldSocket() {
    return chatStore.getSocket();
  }

  /**
   * Накладывает «самобафф»-эффекты заклинания (effectTarget 'self' или без
   * значения) на самого заклинателя. Нужно для заклинаний без урона/цели-врага
   * вроде Щита: эффект добавляется в `activeEffects` актёра тем же partial-
   * апдейтом, что и заклинания/ячейки (родитель сливает по верхним ключам, не
   * затирая параллельные изменения), и анонсируется в чат.
   *
   * @param spell - заклинание
   */
  function applyCasterSpellEffects(spell: Spell): void {
    const casterEffects = getCasterSpellEffects(spell);

    if (casterEffects.length === 0) {
      return;
    }

    emit('update:actor', {
      activeEffects: [
        ...(props.actor.activeEffects ?? []),
        ...instantiateSpellEffects(casterEffects),
      ],
    });

    triggerSaveIfNotEdit();

    chatStore.sendMessage(
      `${spell.name}\n→ ${props.actor.name}: [${casterEffects
        .map((effect) => effect.name)
        .join(', ')}]`,
      'text',
    );
  }

  /**
   * Накладывает эффекты заклинания с `effectTarget: 'target'` на ВЫБРАННУЮ
   * цель. Переиспользует общий `targetStore.applyEffectsToTarget` (тот же путь,
   * что у оружия и существ: клон цели, новые id, origin, разворачивание
   * condition-шаблонов, эмит actor/creature:updated). Для безуронных заклинаний
   * это единственный фидбек, поэтому дополнительно пишем строку в чат.
   *
   * @param spell - заклинание
   */
  function applyTargetSpellEffects(spell: Spell): void {
    const targetEffects = getTargetSpellEffects(spell);

    if (targetEffects.length === 0) {
      return;
    }

    const targetName = targetStore.applyEffectsToTarget(targetEffects, 'spell');

    if (targetName) {
      chatStore.sendMessage(
        `${spell.name}\n→ ${targetName}: [${targetEffects
          .map((effect) => effect.name)
          .join(', ')}]`,
        'text',
      );
    }
  }

  const isSettingsModalOpen = ref(false);

  // --- Поиск и фильтры ---
  const searchQuery = ref('');
  const filterLevels = ref<Set<number>>(new Set());
  const filterHealing = ref(false);
  const filterConcentration = ref(false);
  const filterRitual = ref(false);

  /** Активен ли хотя бы один фильтр */
  const hasAnyFilter = computed(
    () =>
      searchQuery.value.length > 0
      || filterLevels.value.size > 0
      || filterHealing.value
      || filterConcentration.value
      || filterRitual.value,
  );

  /** Сбрасывает все фильтры */
  function resetFilters(): void {
    searchQuery.value = '';
    filterLevels.value = new Set();
    filterHealing.value = false;
    filterConcentration.value = false;
    filterRitual.value = false;
  }

  /**
   * Переключает фильтр по кругу заклинания.
   *
   * @param level - круг заклинания
   */
  function toggleLevelFilter(level: number): void {
    const newSet = new Set(filterLevels.value);

    if (newSet.has(level)) {
      newSet.delete(level);
    } else {
      newSet.add(level);
    }

    filterLevels.value = newSet;
  }

  /** Уникальные круги заклинаний, присутствующие у актора */
  const availableLevelFilters = computed(() => {
    const spells = props.actor.spells ?? [];
    const levels = new Set<number>();

    for (const spell of spells) {
      levels.add(spell.level);
    }

    return [...levels].sort((levelA, levelB) => levelA - levelB);
  });

  /** Отфильтрованные заклинания */
  const filteredSpells = computed(() => {
    const spells = props.actor.spells ?? [];
    const query = searchQuery.value.toLowerCase().trim();

    return spells.filter((spell) => {
      // Поиск по названию
      if (query && !spell.name.toLowerCase().includes(query)) {
        return false;
      }

      // Фильтр по кругу
      if (filterLevels.value.size > 0 && !filterLevels.value.has(spell.level)) {
        return false;
      }

      // Фильтр: лечение (любая часть — лечащая: токен @heal в формуле)
      if (
        filterHealing.value
        && !getSpellDamageParts(spell).some((part) => damagePartIsHealing(part))
      ) {
        return false;
      }

      // Фильтр: концентрация
      if (filterConcentration.value && !spell.concentration) {
        return false;
      }

      // Фильтр: ритуал
      if (filterRitual.value && !spell.ritual) {
        return false;
      }

      return true;
    });
  });

  /** Resolved stats для отображения Spell Save DC и бонуса атаки */
  const resolvedStats = computed(() => resolveActorStats(props.actor));

  /** Базовая характеристика заклинаний актора (с учетом классов) */
  const baseSpellcastingAbility = computed(() => {
    if (props.actor.system?.spellcastingAbility) {
      return props.actor.system.spellcastingAbility;
    }

    const casterClass = props.actor.system?.classes?.find(
      (entry) => entry.spellcastingAbility != null,
    );

    return casterClass?.spellcastingAbility ?? null;
  });

  /** Итоговый бонус атаки заклинаниями для отображения в заголовке */
  const displaySpellAttackBonus = computed(() => {
    const ability = baseSpellcastingAbility.value;

    if (!ability) {
      return null;
    }

    const spellMod = resolvedStats.value.abilityMods[ability] ?? 0;

    return (
      resolvedStats.value.proficiencyBonus
      + spellMod
      + resolvedStats.value.attackBonuses.spell
    );
  });

  /** Карта casterType для computeSpellSlots */
  const casterTypeMap = computed(() => {
    const typeMap = new Map<string, import('@vtt/shared').CasterType>();
    const classes = props.actor.system?.classes ?? [];

    for (const entry of classes) {
      if (entry.casterType) {
        typeMap.set(entry.classKey, entry.casterType);
      }
    }

    return typeMap;
  });

  /** Максимальные ячейки заклинаний */
  const maxSlots = computed(() =>
    computeSpellSlots(props.actor.system?.classes ?? [], casterTypeMap.value),
  );

  function isClassDefinition(value: unknown): value is ClassDefinition {
    return (
      typeof value === 'object'
      && value !== null
      && 'type' in value
      && value.type === 'class'
    );
  }

  /** Определения классов компендиума (все паки), загружены с сервера */
  const classDefinitions = ref<ClassDefinition[]>([]);

  onMounted(async () => {
    const socket = getWorldSocket();

    if (!socket) {
      return;
    }

    const entries = await loadCompendiumKind(socket, 'class');

    classDefinitions.value = entries.filter(isClassDefinition);
  });

  /** Максимальное количество подготовленных заклинаний (из классов) */
  const maxPreparedSpells = computed(() => {
    let total = 0;

    const actorClasses = props.actor.system?.classes ?? [];

    const localClasses = classDefinitions.value;

    for (const entry of actorClasses) {
      let foundInTable = false;

      if (localClasses.length > 0) {
        const clsDef = localClasses.find(
          (classDefinition) => classDefinition.key === entry.classKey,
        );

        if (clsDef) {
          const lvlEntry = clsDef.levelTable.find(
            (levelEntry: ClassLevelEntry) => levelEntry.level === entry.level,
          );

          if (lvlEntry && typeof lvlEntry.preparedSpells === 'number') {
            total += lvlEntry.preparedSpells;
            foundInTable = true;
          }
        }
      }

      if (!foundInTable && entry.casterType && entry.spellcastingAbility) {
        if (entry.casterType === 'full') {
          // PHB 2024 Wizard/Cleric/Druid Fallback
          const fallbackTable: Record<number, number> = {
            1: 4,
            2: 5,
            3: 6,
            4: 7,
            5: 9,
            6: 10,
            7: 11,
            8: 12,
            9: 14,
            10: 15,
            11: 16,
            12: 16,
            13: 17,
            14: 18,
            15: 19,
            16: 21,
            17: 22,
            18: 23,
            19: 24,
            20: 25,
          };

          total += fallbackTable[entry.level] ?? 0;
        } else if (entry.casterType === 'half') {
          // PHB 2024 Paladin/Ranger approximation
          total += Math.max(2, entry.level > 1 ? entry.level - 1 : 2);
        }
      }
    }

    return total;
  });

  /** Текущее количество подготовленных заклинаний */
  const currentPreparedSpellsCount = computed(() => {
    const spells = props.actor.spells ?? [];

    return spells.filter(
      (spell) => spell.prepared && !spell.alwaysPrepared && spell.level > 0,
    ).length;
  });

  /** Использованные ячейки */
  const usedSlots = computed(
    () => props.actor.system?.spellSlotsUsed ?? [0, 0, 0, 0, 0, 0, 0, 0, 0],
  );

  /** Группировка заклинаний по кругам */
  const spellsByLevel = computed(() => {
    const spells = filteredSpells.value;
    const grouped = new Map<number, Spell[]>();

    for (const spell of spells) {
      const existing = grouped.get(spell.level) ?? [];

      existing.push(spell);
      grouped.set(spell.level, existing);
    }

    // Убедимся, что все круги с ячейками отображаются (только если нет активных фильтров)
    if (!hasAnyFilter.value) {
      maxSlots.value.forEach((max, index) => {
        if (max > 0) {
          const lvl = index + 1;

          if (!grouped.has(lvl)) {
            grouped.set(lvl, []);
          }
        }
      });
    }

    // Сортировка по кругу
    const sortedEntries = [...grouped.entries()].sort(
      ([levelA], [levelB]) => levelA - levelB,
    );

    return sortedEntries.map(([level, levelSpells]) => {
      let max = 0;
      let used = 0;

      if (level > 0 && level <= maxSlots.value.length) {
        max = maxSlots.value[level - 1];
        used = usedSlots.value[level - 1] ?? 0;
      }

      return {
        level,
        label: SPELL_LEVEL_LABELS[level] ?? `${level}-й круг`,
        spells: levelSpells,
        max,
        used,
      };
    });
  });

  /** Pact-слот level и count */
  const pactSlotInfo = computed(() =>
    getPactSlotInfo(props.actor.system?.classes ?? []),
  );

  /** Есть ли Pact-слоты (Warlock) */
  const hasPactSlots = computed(() => pactSlotInfo.value.max > 0);

  /**
   * Обновляет использованные ячейки
   *
   * @param slots - новый массив использованных слотов
   */
  function updateUsedSlots(slots: number[]): void {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        spellSlotsUsed: slots,
      },
    } as Partial<Actor>);

    triggerSaveIfNotEdit();
  }

  /**
   * Обновляет использованные Pact-ячейки
   *
   * @param count - количество использованных
   */
  function updatePactUsedSlots(count: number): void {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        pactSlotsUsed: count,
      },
    } as Partial<Actor>);

    triggerSaveIfNotEdit();
  }

  /**
   * Тогл обычного слота
   *
   * @param levelIndex - индекс круга (0-based)
   * @param slotIndex - индекс пузырька
   */
  function toggleSlot(levelIndex: number, slotIndex: number): void {
    const newUsed = [...usedSlots.value];
    const currentUsed = newUsed[levelIndex] ?? 0;

    // Клик по заполненному = восстановить, по пустому = использовать
    if (slotIndex < currentUsed) {
      newUsed[levelIndex] = slotIndex;
    } else {
      newUsed[levelIndex] = slotIndex + 1;
    }

    updateUsedSlots(newUsed);
  }

  /**
   * Тогл Pact-слота
   *
   * @param slotIndex - индекс пузырька
   */
  function togglePactSlot(slotIndex: number): void {
    const currentUsed = props.actor.system?.pactSlotsUsed ?? 0;

    if (slotIndex < currentUsed) {
      updatePactUsedSlots(slotIndex);
    } else {
      updatePactUsedSlots(slotIndex + 1);
    }
  }

  /**
   * Открывает форму редактирования заклинания
   *
   * @param spell - заклинание для редактирования
   */
  function openEditSpell(spell: Spell): void {
    openModal('SpellFormModal', {
      actorId: props.actor.id,
      spell,
      onSave: (updated: Spell) => {
        const currentSpells = props.actor.spells ?? [];

        const newSpells = currentSpells.map((existingSpell) =>
          existingSpell.id === updated.id ? updated : existingSpell,
        );

        emit('update:actor', { spells: newSpells });
        triggerSaveIfNotEdit();
      },
    });
  }

  /**
   * Удаляет заклинание
   *
   * @param spellId - ID заклинания
   */
  function deleteSpell(spellId: string): void {
    const currentSpells = props.actor.spells ?? [];

    const filteredSpells = currentSpells.filter(
      (spell) => spell.id !== spellId,
    );

    emit('update:actor', { spells: filteredSpells });

    const hotbarStore = useHotbarStore();

    hotbarStore.removeByRef(spellId);

    triggerSaveIfNotEdit();
  }

  /**
   * Отправляет карточку заклинания в чат без каста
   *
   * @param spell - заклинание
   */
  function shareSpell(spell: Spell): void {
    const chatStore = useChatStore();

    chatStore.sendItemCard({
      cardType: 'spell',
      title: spell.name,
      payload: JSON.stringify(spell),
    });
  }

  /**
   * Обновляет флаг подготовки заклинания
   *
   * @param spellId - ID заклинания
   * @param prepared - новое значение
   */
  function updatePrepared(spellId: string, prepared: boolean): void {
    const currentSpells = props.actor.spells ?? [];

    if (prepared && maxPreparedSpells.value > 0) {
      const spell = currentSpells.find(
        (existingSpell) => existingSpell.id === spellId,
      );

      if (
        spell
        && !spell.alwaysPrepared
        && currentPreparedSpellsCount.value >= maxPreparedSpells.value
      ) {
        const toast = useToast();

        toast.add({
          title: 'Лимит подготовки',
          description: `Вы не можете подготовить больше заклинаний (${maxPreparedSpells.value}).`,
          color: 'amber',
        });

        return;
      }
    }

    const newSpells = currentSpells.map((spell) =>
      spell.id === spellId ? { ...spell, prepared } : spell,
    );

    emit('update:actor', { spells: newSpells });
    triggerSaveIfNotEdit();
  }

  /** Открыто ли окно детального просмотра (используется для перехвата cast) */
  function openSpellDetail(spell: Spell): void {
    openModal('SpellDetailModal', {
      spell,
      showCastButton: true,
      onCast: () => castSpell(spell),
    });
  }

  /**
   * Доступные круги для каста. У заклинаний с зарядами (врождённые/расовые)
   * круг фиксирован и ячейки не тратятся; у обычных — доступные ячейки
   * (или [0] для заговоров).
   * @param spell - заклинание
   * @returns массив доступных кругов
   */
  function getCastableSpellLevels(spell: Spell): number[] {
    if (spell.uses) {
      return [spell.level];
    }

    if (spell.level > 0) {
      return getAvailableSpellLevels(props.actor, spell.level);
    }

    return [0];
  }

  /**
   * Запускает процесс каста заклинания.
   * Отправляет карточку в чат и открывает DiceRollModal с секцией выбора круга.
   * @param spell - заклинание для каста
   */
  function castSpell(spell: Spell): void {
    // Заклинания с зарядами (врождённые/расовые) не тратят ячейки: проверяем
    // только заряды, без проверки доступных ячеек заклинаний.
    if (
      spell.uses
      && spell.uses.recovery !== 'atWill'
      && spell.uses.current <= 0
    ) {
      const toast = useToast();

      toast.add({
        title: 'Нет зарядов',
        description: `У «${spell.name}» не осталось зарядов — нужен отдых.`,
        color: 'warning',
      });

      return;
    }

    const availableLevels = getCastableSpellLevels(spell);

    if (!spell.uses && spell.level > 0 && availableLevels.length === 0) {
      const toast = useToast();

      toast.add({
        title: 'Недоступно',
        description: `У вас нет доступных ячеек заклинаний ${spell.level} круга или выше.`,
        color: 'rose',
      });

      return;
    }

    // Снарядный режим: число снарядов зависит от контекста каста
    // (заговоры — от уровня персонажа, уровневые — от круга ячейки)
    const casterLevel = getTotalLevel(props.actor.system?.classes);

    const baseProjectileCount = getSpellProjectileCount(spell, {
      slotLevel: availableLevels[0] ?? spell.level,
      casterLevel,
    });

    const hasProjectiles = baseProjectileCount > 1 && !spell.areaOfEffect;

    // Проверка дистанции каста до выбранной цели (только одиночная цель:
    // у AoE и снарядов собственные механики таргетинга)
    if (
      !spell.areaOfEffect
      && !hasProjectiles
      && isSpellCastBlockedByRange(spell, props.actor.id)
    ) {
      return;
    }

    // Ветка 1: Если есть область действия — пропускаем зелёный prompt, сразу начинаем применять (появится шаблон на курсоре)
    if (spell.areaOfEffect) {
      proceedWithCastSpell(spell);

      return;
    }

    if (hasProjectiles) {
      // Запускаем режим выбора целей (снарядов) с отдельным промптом
      import('@/stores/projectileStore').then(({ useProjectileStore }) => {
        const projectileStore = useProjectileStore();

        projectileStore.startTargeting(
          spell.projectiles?.targetDistribution ?? null,
          baseProjectileCount,
          (tokenId) =>
            !isSpellTargetBlockedByRange(spell, props.actor.id, tokenId),
        );

        openModal('ProjectilePromptModal', {
          spell,
          casterLevel,
          availableSpellLevels: availableLevels,
          onConfirm: (selectedLevel: number) => {
            proceedWithCastSpell(spell, selectedLevel);
          },
        });
      });

      return;
    }

    // Ветка 2: Обычные заклинания — сначала спрашиваем подтверждение через зелёный prompt
    const promptStore = useActionPromptStore();
    const promptId = `spell-cast-${spell.id}`;

    promptStore.addPrompt({
      id: promptId,
      icon: 'tabler:wand',
      title: `Применить заклинание: ${spell.name}?`,
      color: 'neutral',
      actions: [
        {
          icon: 'tabler:check',
          color: 'primary',
          onClick: () => {
            promptStore.removePrompt(promptId);
            proceedWithCastSpell(spell);
          },
        },
        {
          icon: 'tabler:x',
          color: 'neutral',
          variant: 'ghost',
          onClick: () => {
            promptStore.removePrompt(promptId);
          },
        },
      ],
    });
  }

  /**
   * Продолжает каст после финального подтверждения в Floating Prompt.
   */
  /**
   * Списывает один заряд заклинания с откатом (recovery !== 'atWill').
   * Заклинания без зарядов и «по желанию» не изменяются.
   * @param spell - заклинание
   */
  function consumeSpellUse(spell: Spell): void {
    if (!spell.uses || spell.uses.recovery === 'atWill') {
      return;
    }

    const newSpells = (props.actor.spells ?? []).map((entry) =>
      entry.id === spell.id && entry.uses
        ? {
            ...entry,
            uses: {
              ...entry.uses,
              current: Math.max(0, entry.uses.current - 1),
            },
          }
        : entry,
    );

    emit('update:actor', { spells: newSpells });
    triggerSaveIfNotEdit();
  }

  function proceedWithCastSpell(spell: Spell, lockedSpellLevel?: number): void {
    // Списываем заряд заклинания с откатом (врождённые/расовые) единожды на каст
    consumeSpellUse(spell);

    // Если есть область действия — сначала размещаем шаблон на сцене
    if (spell.areaOfEffect) {
      const templateStore = useSpellTemplateStore();

      const templateColor =
        SPELL_DAMAGE_TEMPLATE_COLORS[getSpellPrimaryDamageType(spell) ?? '']
        ?? SPELL_TEMPLATE_DEFAULT_COLOR;

      templateStore.requestPlacement(
        spell.areaOfEffect,
        templateColor,
        props.actor.id,
        (templateId) => continueSpellCast(spell, templateId, lockedSpellLevel),
        getSpellMaxRangeOnScene(spell),
      );

      return;
    }

    continueSpellCast(spell, undefined, lockedSpellLevel);
  }

  /**
   * Продолжает каст после размещения шаблона (или сразу, если AoE нет).
   */
  function continueSpellCast(
    spell: Spell,
    templateId?: string,
    lockedSpellLevel?: number,
  ): void {
    // Заклинания с зарядами (врождённые/расовые) не тратят ячейки и не
    // апкастятся: круг фиксирован, коллбэк списания ячейки не передаётся.
    const isInnate = !!spell.uses;
    const slotConsumer = isInnate ? undefined : handleSpellSlotConsume;

    let availableLevels = [0];

    if (lockedSpellLevel !== undefined) {
      availableLevels = [lockedSpellLevel];
    } else if (isInnate) {
      availableLevels = [spell.level];
    } else if (spell.level > 0) {
      availableLevels = getAvailableSpellLevels(props.actor, spell.level);
    }

    // Снарядный режим: число снарядов зависит от контекста каста
    // (заговоры — от уровня персонажа, уровневые — от круга ячейки)
    const casterLevel = getTotalLevel(props.actor.system?.classes);

    const projectileCount = getSpellProjectileCount(spell, {
      slotLevel: lockedSpellLevel ?? spell.level,
      casterLevel,
    });

    const hasProjectiles =
      projectileCount > 1 && !spell.areaOfEffect && templateId === undefined;

    // Состояние HP выбранной цели для токенов @target.full/@target.notFull.
    // Для AoE / без цели — undefined: части раскладываются на гейт-ветки
    // (targetGate), и оркестратор выбирает ветку по HP каждой цели (per-target).
    const targetEntity = spell.areaOfEffect
      ? null
      : targetStore.getTargetActor();

    const targetHp = (
      targetEntity?.system as {
        hitPoints?: { current?: number; max?: number };
      }
    )?.hitPoints;

    const targetIsFull =
      targetHp && targetHp.max !== undefined
        ? (targetHp.current ?? 0) >= targetHp.max
        : undefined;

    // Масштабирование заговора: на пороге уровня тир целиком заменяет базовые
    // части урона (см. cantripScalingTiers). Авто-умножение кубиков отключено.
    const spellDamageParts =
      spell.level === 0
        ? (pickCantripTierParts(spell, casterLevel)
          ?? getSpellDamageParts(spell))
        : getSpellDamageParts(spell);

    // Legacy одиночная формула (снаряды/одночастный путь): первая часть, с
    // разрешёнными @-переменными (@dmg-токены снимаются внутри resolve).
    const resolvedDamageFormula = resolveSpellDamageFormula(
      spell,
      props.actor,
      spellDamageParts[0]?.formula ?? '',
      resolvedStats.value,
      targetIsFull,
    );

    // --- Многочастный путь (несколько частей / нестандартный таргетинг) ---
    // Включая заклинания-атаки: модалка делает бросок попадания, затем части.
    // Исключены только снаряды (своя логика распределения).

    // Кость-формулы бонус-урона заклинаний (damage.spell) в Active Effects
    // катаются отдельными частями — каст идёт многочастным путём даже для
    // одночастного заклинания. Учитываются и ambient-эффекты аур на карте
    // (напр. аура союзника, дающая бонус-урон заклинаниям).
    const spellEffects = combineEffectsWithAmbient(
      collectActiveEffects(props.actor),
      useAuraStore().getAmbientEffectsForActor(props.actor.id),
    );

    const hasBonusDamage = hasSpellBonusDamage(spellEffects);

    // Есть ли у заклинания эффекты на цель (effectTarget 'target') — нужно для
    // резолва заклинаний без урона, чья задача — повесить эффект на цель.
    const hasSpellTargetEffects = getTargetSpellEffects(spell).length > 0;

    const useMultiPart =
      !hasProjectiles
      && (hasBonusDamage
        || spellDamageParts.length > 1
        || spellDamageParts.some(
          (part) =>
            (part.target ?? 'selected') !== 'selected'
            || part.requiresDamage
            || /@dmg\./i.test(part.formula)
            || /@heal/i.test(part.formula)
            || /@target\./i.test(part.formula),
        ));

    const resolvedParts: SpellDamagePartInput[] = useMultiPart
      ? resolveDamagePartsForCast(
          spell,
          props.actor,
          spellDamageParts,
          resolvedStats.value,
          targetIsFull,
        )
      : [];

    // Roll-time сборщик бонус-частей: условия (преимущество/помеха, HP цели)
    // оцениваются в момент броска по фактическому режиму из модалки.
    // Снаряды остаются на одноформульном пути, но бонус-части получают:
    // они катаются один раз на каст и применяются каждой задетой цели
    // (per-target гейты, см. resolveSpellDamage).
    const evaluateSpellBonusParts =
      useMultiPart || (hasProjectiles && hasBonusDamage)
        ? buildSpellBonusEvaluator({
            spell,
            actor: props.actor,
            effects: spellEffects,
            resolvedStats: resolvedStats.value,
            multiTarget:
              spell.areaOfEffect !== undefined
              || templateId !== undefined
              || hasProjectiles,
          })
        : undefined;

    let isApplied = false;

    const handleUnload = () => {
      if (!isApplied && templateId) {
        const templateStore = useSpellTemplateStore();

        templateStore.deleteTemplate(templateId);
      }

      if (!isApplied && hasProjectiles) {
        import('@/stores/projectileStore').then(({ useProjectileStore }) => {
          const projectileStore = useProjectileStore();

          if (projectileStore.isActive) {
            projectileStore.stopTargeting();
          }
        });
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    const handleModalClose = (isOpen: boolean) => {
      if (!isOpen) {
        window.removeEventListener('beforeunload', handleUnload);

        if (!isApplied && templateId) {
          const templateStore = useSpellTemplateStore();

          templateStore.deleteTemplate(templateId);
        }

        if (!isApplied && hasProjectiles) {
          import('@/stores/projectileStore').then(({ useProjectileStore }) => {
            const projectileStore = useProjectileStore();

            if (projectileStore.isActive) {
              projectileStore.stopTargeting();
            }
          });
        }
      }
    };

    /**
     * Общий обработчик подтверждения броска.
     * Транслирует шаблон на сервер и запускает обработку целей.
     */
    function handleRollConfirm(
      damageTotal: number,
      chosenDamageType?: string,
    ): void {
      isApplied = true;
      window.removeEventListener('beforeunload', handleUnload);

      let cachedTemplate = null;

      if (templateId) {
        const templateStore = useSpellTemplateStore();

        cachedTemplate = templateStore.getPlacedTemplate(templateId);
        // Очищаем кэш (данные уже сохранены в cachedTemplate)
        templateStore.removePlacedTemplate(templateId);
      }

      // Автоматическая обработка целей (спасброски, авто-попадание). Эффекты
      // на цель без урона тоже требуют резолва: у save-заклинаний нужно кинуть
      // спасбросок и наложить эффект при провале — поэтому пускаем резолв и при
      // наличии target-эффектов, даже когда урона нет.
      if (
        needsAutoResolution(spell, hasProjectiles)
        && (damageTotal > 0 || hasSpellTargetEffects)
      ) {
        const scene = worldStore.currentScene;
        const actors = getCurrentWorldEntities();
        const socket = getWorldSocket();

        if (actors.length > 0 && socket) {
          const context = {
            spell,
            damageTotal,
            spellSaveDC: resolvedStats.value.spellSaveDC,
            actors,
            socket,
            overrideDamageType: chosenDamageType,
          };

          // Бонус-части для снарядов собираются здесь (в момент подтверждения
          // броска): снаряды autoHit — броска атаки нет, поэтому преимущество/
          // помеха не определены (false); HP-условия отложены в per-target гейты.
          const projectileBonusParts =
            hasProjectiles && evaluateSpellBonusParts
              ? evaluateSpellBonusParts({
                  hasAdvantage: false,
                  hasDisadvantage: false,
                })
              : undefined;

          resolveSpellDamage(context, {
            hasProjectiles,
            resolvedDamageFormula,
            scene,
            cachedTemplate,
            bonusDamageParts: projectileBonusParts,
          });
        }
      }

      // Самобафф: эффекты с effectTarget 'self' ложатся на заклинателя (напр.
      // Щит). Безопасно и для уронных заклинаний — без таких эффектов это no-op.
      applyCasterSpellEffects(spell);

      // Эффекты на цель (effectTarget 'target') без броска атаки и без
      // спасброска — автоприменение (напр. бафф союзника касанием): вешаем
      // сразу. Атакующие заклинания вешают их по попаданию (onHit модалки),
      // save-заклинания — внутри resolveSpellDamage выше.
      if (
        hasSpellTargetEffects
        && spell.saveType === 'none'
        && !getSpellAttackType(spell)
      ) {
        applyTargetSpellEffects(spell);
      }

      // Удаляем визуальный шаблон с карты (всегда, вне зависимости от результата)
      if (templateId) {
        const templateStore = useSpellTemplateStore();

        templateStore.deleteTemplate(templateId);
      }
    }

    /**
     * Обработчик многочастного броска: применяет части через оркестратор.
     */
    function handleRollPartsConfirm(parts: RolledSpellDamagePart[]): void {
      isApplied = true;
      window.removeEventListener('beforeunload', handleUnload);

      let cachedTemplate = null;

      if (templateId) {
        const templateStore = useSpellTemplateStore();

        cachedTemplate = templateStore.getPlacedTemplate(templateId);
        templateStore.removePlacedTemplate(templateId);
      }

      const scene = worldStore.currentScene;
      const actors = getCurrentWorldEntities();
      const socket = getWorldSocket();

      if (actors.length > 0 && socket) {
        void resolveSpellDamageWithParts(
          {
            spell,
            damageTotal: 0,
            spellSaveDC: resolvedStats.value.spellSaveDC,
            actors,
            socket,
            casterId: props.actor.id,
          },
          parts,
          { scene, cachedTemplate },
        );
      }

      if (templateId) {
        const templateStore = useSpellTemplateStore();

        templateStore.deleteTemplate(templateId);
      }
    }

    /**
     * Обработчик серии атак снарядов (Мистический заряд, Палящий луч):
     * модалка отдаёт контекст броска, по броску попадания на каждый снаряд
     * выполняет resolveSpellDamage. Бонус-части эффектов собираются с
     * фактическим режимом преимущества/помехи и катаются на каждое попадание.
     */
    function handleProjectileAttackRoll(rollContext: {
      attackModifier: number;
      rollMode: AttackRollMode;
    }): void {
      const projectileAttackType = getSpellAttackType(spell);

      if (!projectileAttackType) {
        return;
      }

      isApplied = true;
      window.removeEventListener('beforeunload', handleUnload);

      const scene = worldStore.currentScene;
      const actors = getCurrentWorldEntities();
      const socket = getWorldSocket();

      if (actors.length === 0 || !socket) {
        return;
      }

      const projectileBonusParts = evaluateSpellBonusParts
        ? evaluateSpellBonusParts({
            hasAdvantage: rollContext.rollMode === 'advantage',
            hasDisadvantage: rollContext.rollMode === 'disadvantage',
          })
        : undefined;

      resolveSpellDamage(
        {
          spell,
          damageTotal: 0,
          spellSaveDC: resolvedStats.value.spellSaveDC,
          actors,
          socket,
        },
        {
          hasProjectiles: true,
          resolvedDamageFormula,
          scene,
          projectileAttack: {
            attackModifier: rollContext.attackModifier,
            rollMode: rollContext.rollMode,
            attackType: projectileAttackType,
          },
          bonusDamageParts: projectileBonusParts,
        },
      );
    }

    /** Нужно ли пропустить автоприменение урона в модалке */
    const shouldSkipAutoApply = needsAutoResolution(spell, hasProjectiles);

    // Для заговоров и заклинаний без урона и без РЕАЛЬНОГО броска атаки — только
    // карточка (выбор круга + применение эффектов). getSpellAttackType === undefined
    // при автопопадании/лечении/не-атакующей доставке: тогда бросок не нужен, даже
    // если тип атаки melee/ranged (автопопадание = попадаем без броска).
    if (spellDamageParts.length === 0 && !getSpellAttackType(spell)) {
      // Для не-заговоров всё равно нужно списать ячейку (врождённые — заряд уже
      // списан в proceedWithCastSpell, ячейка не тратится)
      if (spell.level > 0 && !isInnate) {
        openModal('DiceRollModal', {
          'title': `Заклинание — ${spell.name}`,
          'rollLabel': spell.name,
          'rollButtonText': 'Применить',
          'skipRoll': true,
          'spellLevel': lockedSpellLevel ?? spell.level,
          'availableSpellLevels': availableLevels,
          'pactSlotLevel': pactSlotInfo.value.level,
          'onSpellSlotConsume': slotConsumer,
          'onRoll': handleRollConfirm,
          'onUpdate:open': handleModalClose,
        });
      } else {
        // Заговоры/врождённые без выбора ячейки (модалка не открывается):
        // эффекты применяем сразу при касте — на себя и/или на выбранную цель.
        applyCasterSpellEffects(spell);
        applyTargetSpellEffects(spell);
      }

      return;
    }

    // Атака / урон / лечение. Тип атаки — общий хелпер getSpellAttackType
    // (melee/ranged без autoHit); будет ли реально бросок попадания, решает
    // DiceRollModal по наличию выбранной цели в момент броска.
    const incomingAttackType = getSpellAttackType(spell);

    const baseMod = incomingAttackType
      ? calculateSpellAttackModifier(props.actor, spell, resolvedStats.value)
      : 0;

    let rollButtonText = 'Бросить урон';

    if (incomingAttackType) {
      rollButtonText = 'Бросить атаку';
    } else if (spellDamageParts.some((part) => damagePartIsHealing(part))) {
      rollButtonText = 'Лечение';
    }

    openModal('DiceRollModal', {
      'title': `Заклинание — ${spell.name}`,
      'rollLabel': spell.name,
      rollButtonText,
      'formula': resolvedDamageFormula,
      'attackModifier': incomingAttackType ? baseMod : undefined,
      incomingAttackType,
      'isHealing': spellIsHealing(spell),
      'damageType': getSpellPrimaryDamageType(spell),
      'skipDamageApplication': shouldSkipAutoApply,
      'skipChatMessage': hasProjectiles,

      // Атакующие снаряды: модалка отдаёт контекст, серию бросков выполняет
      // resolveSpellDamage (бросок попадания на каждый снаряд)
      'onProjectileAttack':
        hasProjectiles && incomingAttackType
          ? handleProjectileAttackRoll
          : undefined,

      // Атакующее заклинание-эффект (без многочастного пути): эффекты на цель
      // вешаем по ПОПАДАНИЮ. Многочастные уронные заклинания накладывают их
      // сами в resolveSpellDamageWithParts, поэтому onHit для них не нужен.
      'onHit':
        incomingAttackType && hasSpellTargetEffects && !useMultiPart
          ? () => applyTargetSpellEffects(spell)
          : undefined,

      // Многочастный путь (если активен) — модалка катает части и зовёт onRollParts
      'damageParts': useMultiPart ? resolvedParts : undefined,
      'onRollParts': useMultiPart ? handleRollPartsConfirm : undefined,
      // Снарядам бонус-части катает resolveSpellDamage, а не модалка
      'evaluateBonusDamageParts': useMultiPart
        ? evaluateSpellBonusParts
        : undefined,

      // Секция круга заклинания
      'spellLevel':
        lockedSpellLevel ?? (spell.level > 0 ? spell.level : undefined),
      'availableSpellLevels': availableLevels,
      'spellScalingDice': spell.scaling?.additionalDice,
      'pactSlotLevel': hasPactSlots.value ? pactSlotInfo.value.level : 0,
      'onSpellSlotConsume': slotConsumer,
      'onRoll': handleRollConfirm,
      'onUpdate:open': handleModalClose,
    });
  }

  /**
   * Коллбэк списания ячейки заклинания.
   * Вызывается из DiceRollModal при подтверждении броска.
   *
   * @param castLevel - выбранный круг
   * @param consumeSlot - тратить ли ячейку
   * @param isPactSlot - использовать Pact-ячейку
   */
  function handleSpellSlotConsume(
    castLevel: number,
    consumeSlot: boolean,
    isPactSlot: boolean,
  ): void {
    if (!consumeSlot || castLevel <= 0) {
      return;
    }

    if (isPactSlot) {
      updatePactUsedSlots((props.actor.system?.pactSlotsUsed ?? 0) + 1);
    } else {
      const index = castLevel - 1;
      const newUsed = [...usedSlots.value];

      newUsed[index] = (newUsed[index] ?? 0) + 1;
      updateUsedSlots(newUsed);
    }
  }
</script>

<template>
  <div class="relative flex min-h-[200px] flex-col space-y-4">
    <!-- Заголовок: Spell Save DC + Бонус атаки + Настройки -->
    <div
      class="flex items-center justify-between rounded-lg bg-accented/30 px-3 py-2"
    >
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted">DC спасброска</span>

          <span class="text-lg font-bold text-gold">
            {{ resolvedStats.spellSaveDC || '—' }}
          </span>
        </div>

        <div class="h-6 w-px bg-accented" />

        <div class="flex items-center gap-2">
          <span class="text-xs text-muted">Бонус атаки</span>

          <span class="text-lg font-bold text-healing">
            {{
              displaySpellAttackBonus != null && displaySpellAttackBonus >= 0
                ? '+'
                : ''
            }}{{ displaySpellAttackBonus ?? '—' }}
          </span>
        </div>

        <template v-if="maxPreparedSpells > 0">
          <div class="h-6 w-px bg-accented" />

          <div
            class="flex items-center gap-2"
            title="Подготовлено заклинаний"
          >
            <span class="text-xs tracking-wider text-muted">Подготовлено</span>

            <span
              class="text-lg font-bold"
              :class="
                currentPreparedSpellsCount > maxPreparedSpells
                  ? 'text-danger'
                  : currentPreparedSpellsCount === maxPreparedSpells
                    ? 'text-info'
                    : 'text-toned'
              "
            >
              {{ currentPreparedSpellsCount }}/{{ maxPreparedSpells }}
            </span>
          </div>
        </template>
      </div>

      <UButton
        v-if="isEditMode"
        icon="tabler:settings"
        variant="ghost"
        color="neutral"
        size="xs"
        @click.left.exact.prevent="isSettingsModalOpen = true"
      />
    </div>

    <!-- Поиск и фильтры -->
    <div
      v-if="actor.spells && actor.spells.length > 0"
      class="space-y-2"
    >
      <!-- Поле поиска -->
      <UInput
        v-model="searchQuery"
        icon="tabler:search"
        placeholder="Поиск по названию..."
        size="sm"
        :ui="{ root: 'w-full' }"
      />

      <!-- Фильтры -->
      <div class="flex flex-wrap items-center gap-1.5">
        <!-- Круги заклинаний -->
        <UBadge
          v-for="level in availableLevelFilters"
          :key="`lvl-${level}`"
          :color="filterLevels.has(level) ? 'primary' : 'neutral'"
          :variant="filterLevels.has(level) ? 'solid' : 'subtle'"
          size="sm"
          class="cursor-pointer transition-all select-none"
          @click.left.exact.prevent="toggleLevelFilter(level)"
        >
          {{ level === 0 ? 'Заговор' : `${level} круг` }}
        </UBadge>

        <div class="mx-0.5 h-4 w-px bg-accented/50" />

        <!-- Лечение -->
        <UBadge
          color="success"
          :variant="filterHealing ? 'solid' : 'subtle'"
          size="sm"
          class="cursor-pointer transition-all select-none"
          @click.left.exact.prevent="filterHealing = !filterHealing"
        >
          <UIcon
            name="tabler:heart-filled"
            class="mr-0.5 h-3 w-3"
          />
          Лечение
        </UBadge>

        <!-- Концентрация -->
        <UBadge
          color="warning"
          :variant="filterConcentration ? 'solid' : 'subtle'"
          size="sm"
          class="cursor-pointer transition-all select-none"
          @click.left.exact.prevent="filterConcentration = !filterConcentration"
        >
          К
        </UBadge>

        <!-- Ритуал -->
        <UBadge
          color="info"
          :variant="filterRitual ? 'solid' : 'subtle'"
          size="sm"
          class="cursor-pointer transition-all select-none"
          @click.left.exact.prevent="filterRitual = !filterRitual"
        >
          Р
        </UBadge>

        <!-- Сброс -->
        <UBadge
          v-if="hasAnyFilter"
          color="error"
          variant="subtle"
          size="sm"
          class="cursor-pointer transition-all select-none"
          @click.left.exact.prevent="resetFilters"
        >
          <UIcon
            name="tabler:x"
            class="mr-0.5 h-3 w-3"
          />
          Сброс
        </UBadge>
      </div>
    </div>

    <!-- Ячейки Pact Magic -->
    <div
      v-if="hasPactSlots"
      class="space-y-1"
    >
      <div class="flex items-center gap-2 px-1 pt-2 pb-1">
        <span
          class="shrink-0 text-xs font-semibold tracking-wider text-magic uppercase"
        >
          Пакт
          <template v-if="pactSlotInfo.level"
            >({{ pactSlotInfo.level }})</template
          >
        </span>

        <div class="h-px flex-1 bg-accented/50" />

        <div class="flex items-center gap-2">
          <!-- Пузырьки Pact Magic -->
          <div class="flex items-center gap-1">
            <button
              v-for="slotIndex in pactSlotInfo.max"
              :key="slotIndex"
              class="h-4 w-4 shrink-0 cursor-pointer rounded-full border-2 transition-colors"
              :class="
                slotIndex <= (actor.system?.pactSlotsUsed ?? 0)
                  ? 'border-magic bg-magic/30'
                  : 'border-accented bg-transparent hover:border-accented'
              "
              :title="`Пакт: ${slotIndex <= (actor.system?.pactSlotsUsed ?? 0) ? 'Использована' : 'Доступна'}`"
              @click.left.exact.prevent="togglePactSlot(slotIndex - 1)"
            />
          </div>

          <!-- Счётчик Pact Magic -->
          <span class="w-6 shrink-0 text-right text-xs text-dimmed">
            {{ pactSlotInfo.max - (actor.system?.pactSlotsUsed ?? 0) }}/{{
              pactSlotInfo.max
            }}
          </span>
        </div>
      </div>
    </div>

    <!-- Заклинания по кругам -->
    <div
      v-for="group in spellsByLevel"
      :key="group.level"
      class="space-y-1"
    >
      <!-- Заголовок круга -->
      <div class="flex items-center gap-2 px-1 pt-2 pb-1">
        <span
          class="shrink-0 text-xs font-semibold tracking-wider text-muted uppercase"
        >
          {{ group.label }}
        </span>

        <div class="h-px flex-1 bg-accented/50" />

        <!-- Ячейки заклинаний (выводим справа от заголовка) -->
        <div
          v-if="group.level > 0 && group.max > 0"
          class="flex items-center gap-2"
        >
          <!-- Пузырьки -->
          <div class="flex items-center gap-1">
            <button
              v-for="slotIndex in group.max"
              :key="slotIndex"
              class="h-4 w-4 shrink-0 cursor-pointer rounded-full border-2 transition-colors"
              :class="
                slotIndex <= group.used
                  ? 'border-success bg-success/30'
                  : 'border-accented bg-transparent hover:border-accented'
              "
              :title="`${group.label}: ${slotIndex <= group.used ? 'Использована' : 'Доступна'}`"
              @click.left.exact.prevent="
                toggleSlot(group.level - 1, slotIndex - 1)
              "
            />
          </div>

          <!-- Счётчик -->
          <span class="w-6 shrink-0 text-right text-xs text-dimmed">
            {{ group.max - group.used }}/{{ group.max }}
          </span>
        </div>
      </div>

      <!-- Список заклинаний в круге -->
      <SpellListItem
        v-for="spell in group.spells"
        :key="spell.id"
        :item="spell"
        :actor-id="actor.id"
        :actor="actor"
        :is-edit-mode="isEditMode"
        show-edit
        show-delete
        show-cast
        show-prepare
        @click="openSpellDetail(spell)"
        @edit="openEditSpell(spell)"
        @delete="deleteSpell(spell.id)"
        @cast="castSpell(spell)"
        @share="shareSpell(spell)"
        @update:prepared="updatePrepared(spell.id, $event)"
      />
    </div>

    <!-- Пусто -->
    <div
      v-if="!actor.spells || actor.spells.length === 0"
      class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors"
      :class="
        isDragOver
          ? 'border-primary-500/50 bg-primary-500/5 text-primary-400'
          : 'border-transparent text-dimmed'
      "
    >
      <UIcon
        name="tabler:wand"
        class="mb-2 h-8 w-8 opacity-50"
      />

      <p>У данного персонажа пока нет заклинаний.</p>
    </div>

    <!-- Модальное окно настроек -->
    <SpellcastingSettingsModal
      v-if="isEditMode"
      v-model:open="isSettingsModalOpen"
      :actor="actor"
      @update:actor="emit('update:actor', $event)"
    />
  </div>
</template>
