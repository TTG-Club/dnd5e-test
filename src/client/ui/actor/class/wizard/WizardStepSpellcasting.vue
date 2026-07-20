<script setup lang="ts">
  /**
   * Шаг мастера: Заклинания.
   *
   * Показывает количество заговоров, подготовленных заклинаний
   * и таблицу ячеек для текущего уровня.
   * Позволяет открыть компендиум заклинаний с предустановленными фильтрами
   * по классу и доступным кругам, а также выбрать нужное количество заклинаний.
   */
  import type { TypedWebSocketClient } from '@vtt/shared';
  import type {
    Actor,
    CasterType,
    ClassDefinition,
    GrantedSpellSource,
    ResolvedGrantedSpell,
    Spell,
    SubclassDefinition,
  } from '@vtt/shared/system/dnd.js';

  import {
    computeSpellSlots,
    getPactSlotInfo,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import CompendiumDataModal from '@/systems/dnd5e/ui/compendium/CompendiumDataModal.vue';

  import { ABILITY_LABELS } from './constants';

  const props = defineProps<{
    classDefinition: ClassDefinition;
    nextLevel: number;
    /** Сокет для загрузки данных компендиума */
    socket: TypedWebSocketClient | null;
    /** Уже выбранные заклинания (из состояния мастера) */
    selectedSpells: Spell[];
    /** Активный подкласс (для подклассов-заклинателей: Мистический рыцарь и т.д.) */
    activeSubclass: SubclassDefinition | null;
    /** Лимит заговоров на текущем уровне */
    cantripsLimit: number;
    /** Лимит заклинаний 1+ круга на текущем уровне */
    spellsLimit: number;
    /** Покруговые лимиты на текущем уровне (если заданы) */
    spellsByLevel: Record<string, number> | null;
    /**
     * Заклинания, автоматически предоставляемые умениями текущего уровня.
     * Отображаются заблокированными и не тратят лимит ручного выбора.
     */
    grantedSpells: ResolvedGrantedSpell[];
    /** Персонаж */
    actor: Actor;
  }>();

  const emit = defineEmits<{
    /** Обновление списка выбранных заклинаний */
    'update:selected-spells': [spells: Spell[]];
  }>();

  const isSpellBrowserOpen = ref(false);
  const spellBrowserKey = ref(0);

  /**
   * Строка таблицы уровней для текущего уровня.
   *
   * Для подклассов-заклинателей (Мистический рыцарь, Таинственный стрелок)
   * используется их собственная таблица прогрессии, если она задана.
   */
  const levelEntry = computed(() => {
    const subclassTable = props.activeSubclass?.levelTable;

    const table = subclassTable ?? props.classDefinition.levelTable;

    return table.find((row) => row.level === props.nextLevel) ?? null;
  });

  /** Количество заговоров (если обозначено в levelTable) */
  const cantripsKnown = computed(() => {
    const entry = levelEntry.value;

    if (!entry) {
      return null;
    }

    // Поддерживаем оба варианта имени поля в SRD-данных
    const value = entry.cantripsKnown ?? entry.knownCantrips;

    return typeof value === 'number' ? value : null;
  });

  /** Количество подготовленных заклинаний */
  const preparedSpells = computed(() => {
    const entry = levelEntry.value;

    if (!entry) {
      return null;
    }

    const value = entry.preparedSpells;

    return typeof value === 'number' ? value : null;
  });

  /** Временный массив классов с учетом текущего повышения уровня */
  const temporaryClasses = computed(() => {
    const classes = [...(props.actor.system.classes || [])];

    const existingIndex = classes.findIndex(
      (entry) => entry.classKey === props.classDefinition.key,
    );

    const effectiveSpellcasting =
      props.classDefinition.spellcasting
      ?? props.activeSubclass?.spellcasting
      ?? null;

    const classEntry = {
      classKey: props.classDefinition.key,
      className: props.classDefinition.name,
      level: props.nextLevel,
      subclassKey: props.activeSubclass?.key ?? null,
      hitDie: props.classDefinition.hitDie,
      hitDiceUsed: 0,
      hitPointsGained: [],
      chosenSkills: [],
      featureChoices: {},
      ...(effectiveSpellcasting
        ? {
            spellcastingAbility: effectiveSpellcasting.ability,
            casterType: effectiveSpellcasting.type,
          }
        : {}),
    };

    if (existingIndex !== -1) {
      classes[existingIndex] = {
        ...classes[existingIndex],
        level: props.nextLevel,
        subclassKey:
          props.activeSubclass?.key ?? classes[existingIndex].subclassKey,
        ...(effectiveSpellcasting && !classes[existingIndex].spellcastingAbility
          ? {
              spellcastingAbility: effectiveSpellcasting.ability,
              casterType: effectiveSpellcasting.type,
            }
          : {}),
      };
    } else {
      classes.push(classEntry);
    }

    return classes;
  });

  const casterTypeMap = computed(() => {
    const typeMap = new Map<string, CasterType>();

    for (const entry of temporaryClasses.value) {
      if (entry.casterType) {
        typeMap.set(entry.classKey, entry.casterType as CasterType);
      }
    }

    return typeMap;
  });

  /** Ячейки заклинаний по кругам для отображения */
  const spellSlots = computed(() => {
    const slots: Array<{ level: number; count: number; isPact?: boolean }> = [];

    // 1. Проверяем Pact Magic (Warlock)
    const pactInfo = getPactSlotInfo(temporaryClasses.value);

    if (pactInfo.max > 0) {
      slots.push({ level: pactInfo.level, count: pactInfo.max, isPact: true });
    }

    // 2. Проверяем обычные ячейки заклинаний
    if (temporaryClasses.value.length > 1) {
      // Мультикласс — считаем ячейки по общему caster level
      const maxSlots = computeSpellSlots(
        temporaryClasses.value,
        casterTypeMap.value,
      );

      maxSlots.forEach((count, index) => {
        if (count > 0) {
          slots.push({ level: index + 1, count });
        }
      });
    } else {
      // Одноклассовый — берем ячейки из levelTable прокачиваемого класса (или подкласса)
      const entry = levelEntry.value;

      if (entry) {
        for (let circle = 1; circle <= 9; circle++) {
          const slotKey = `spellSlots${circle}`;
          const count = entry[slotKey];

          if (typeof count === 'number' && count > 0) {
            slots.push({ level: circle, count });
          }
        }
      }
    }

    return slots;
  });

  /**
   * Эффективная заклинательная конфигурация.
   * Берётся из класса, а если нет — из подкласса.
   */
  const effectiveSpellcasting = computed(() => {
    return (
      props.classDefinition.spellcasting
      ?? props.activeSubclass?.spellcasting
      ?? null
    );
  });

  /** Название заклинательной характеристики */
  const spellcastingAbilityLabel = computed(() => {
    const ability = effectiveSpellcasting.value?.ability;

    if (!ability) {
      return '';
    }

    return ABILITY_LABELS[ability] ?? ability;
  });

  /**
   * Ключ класса для фильтра компендиума.
   *
   * Для подклассов-заклинателей (Мистический рыцарь, Таинственный стрелок)
   * фильтр не устанавливается, т.к. их списки заклинаний специфичны
   * и не привязаны к ключу базового класса в компендиуме.
   */
  const classKeyFilter = computed((): string | undefined => {
    // Если магия от класса — фильтруем по ключу класса
    if (props.classDefinition.spellcasting) {
      return props.classDefinition.key;
    }

    // Для подклассов-заклинателей не устанавливаем фильтр по классу
    return undefined;
  });

  /**
   * Доступные круги заклинаний для выбора.
   * Ограничены тем, какие круги ячеек доступны ИМЕННО прокачиваемому классу на новом уровне.
   * Включает 0 (заговоры), если cantripsLimit > 0.
   */
  const availableLevelFilter = computed((): number[] => {
    const levels: number[] = [];

    if (props.cantripsLimit > 0) {
      levels.push(0);
    }

    if (props.spellsByLevel) {
      for (const levelStr of Object.keys(props.spellsByLevel)) {
        levels.push(Number(levelStr));
      }
    } else if (props.spellsLimit > 0) {
      const entry = levelEntry.value;

      if (entry) {
        if (
          typeof entry.pactSlots === 'number'
          && entry.pactSlots > 0
          && typeof entry.pactSlotLevel === 'number'
        ) {
          for (
            let spellLevel = 1;
            spellLevel <= entry.pactSlotLevel;
            spellLevel++
          ) {
            levels.push(spellLevel);
          }
        }

        for (let circle = 1; circle <= 9; circle++) {
          const slotKey = `spellSlots${circle}`;
          const count = entry[slotKey];

          if (typeof count === 'number' && count > 0) {
            levels.push(circle);
          }
        }
      }
    }

    return Array.from(new Set(levels)).sort(
      (levelA, levelB) => levelA - levelB,
    );
  });

  /** Доступные круги заклинаний >= 1 для отображения */
  const availableSpellCircles = computed((): number[] => {
    return availableLevelFilter.value.filter((level) => level >= 1);
  });

  /** Текстовое представление диапазона кругов заклинаний */
  const availableSpellCirclesText = computed((): string => {
    const circles = availableSpellCircles.value;

    if (circles.length === 0) {
      return '1+';
    }

    if (circles.length === 1) {
      return String(circles[0]);
    }

    const minLevel = circles[0];
    const maxLevel = circles[circles.length - 1];

    return `${minLevel}-${maxLevel}`;
  });

  /** Лимит для передачи в selection-limit компендиума */
  const compendiumSelectionLimit = computed(() => {
    if (props.spellsByLevel) {
      return Object.values(props.spellsByLevel).reduce(
        (sum, count) => sum + count,
        0,
      );
    }

    return props.spellsLimit > 0 ? props.spellsLimit : undefined;
  });

  /** Идентификаторы уже выбранных заклинаний — для предзаполнения компендиума */
  const selectedSpellIds = computed(() =>
    props.selectedSpells.map((spell) => spell.id),
  );

  /**
   * Названия заклинаний, которые уже есть у персонажа.
   * Компендиум помечает их «Изучено» и не даёт выбрать повторно.
   */
  const knownSpellNames = computed(() =>
    (props.actor.spells ?? []).map((spell) => spell.name),
  );

  /**
   * Связи «ID заклинания → умение» для компендиума.
   * Компендиум помечает такие заклинания авто-выбранными и заблокированными.
   */
  const grantedSpellSourcesForCompendium = computed((): GrantedSpellSource[] =>
    props.grantedSpells.map((granted) => ({
      spellId: granted.spell.id,
      featureName: granted.featureName,
    })),
  );

  /**
   * Обрабатывает выбор заклинаний из компендиума.
   *
   * Компендиум получает уже выбранные заклинания через `preselectedSpellIds`,
   * поэтому возвращает полный итоговый список (с учётом снятых галочек).
   * Заменяем список целиком, а не дописываем — иначе снятие выбора не учтётся.
   *
   * @param newSpells - полный набор заклинаний, отмеченных в компендиуме
   */
  function handleSpellsSelected(newSpells: Spell[]): void {
    emit('update:selected-spells', newSpells);
  }

  /**
   * Удаляет заклинание из списка выбранных.
   *
   * @param spellId - идентификатор заклинания
   */
  function removeSpell(spellId: string): void {
    emit(
      'update:selected-spells',
      props.selectedSpells.filter((spell) => spell.id !== spellId),
    );
  }

  /**
   * Открывает компендиум заклинаний.
   * При повторном нажатии перемонтирует модалку, чтобы она поднялась поверх остальных.
   */
  function openSpellBrowser(): void {
    if (isSpellBrowserOpen.value) {
      // Модалка уже открыта — перемонтируем для получения нового z-index
      spellBrowserKey.value++;

      return;
    }

    isSpellBrowserOpen.value = true;
  }

  defineExpose({ openSpellBrowser });
</script>

<template>
  <div class="space-y-3">
    <span class="mb-2 block text-sm font-medium text-toned"> Заклинания </span>

    <!-- Заклинания, автоматически предоставленные умениями -->
    <div
      v-if="grantedSpells.length > 0"
      class="space-y-1"
    >
      <span
        class="block text-xs font-semibold tracking-wider text-muted uppercase"
      >
        Заклинания от умений ({{ grantedSpells.length }})
      </span>

      <div class="flex flex-wrap gap-1.5">
        <UBadge
          v-for="granted in grantedSpells"
          :key="granted.spell.id"
          color="primary"
          variant="subtle"
          size="md"
          class="gap-1.5"
        >
          <UIcon
            name="tabler:lock"
            class="size-3.5 opacity-60"
          />
          {{ granted.spell.name }}

          <span class="text-[10px] opacity-60">
            Умение: {{ granted.featureName }}
          </span>
        </UBadge>
      </div>
    </div>

    <div
      v-if="classDefinition.spellcasting"
      class="space-y-3"
    >
      <!-- Заклинательная характеристика -->
      <div
        class="rounded-lg border border-magic-border/40 bg-magic-subtle/10 px-3 py-2"
      >
        <span class="text-sm text-magic/80"
          >Заклинательная характеристика:</span
        >

        <span class="ml-1 text-sm font-semibold text-magic-muted">{{
          spellcastingAbilityLabel
        }}</span>
      </div>

      <!-- Заговоры, подготовленные и ячейки — в одну строку -->
      <div class="flex flex-wrap gap-2">
        <div
          v-if="cantripsKnown !== null"
          class="flex flex-col items-center rounded-md border border-default/50 bg-elevated/30 px-2.5 py-1.5"
        >
          <span class="text-[10px] font-medium text-dimmed">Заговоры</span>

          <span class="text-sm font-bold text-highlighted">{{
            cantripsKnown
          }}</span>
        </div>

        <div
          v-if="preparedSpells !== null"
          class="flex flex-col items-center rounded-md border border-default/50 bg-elevated/30 px-2.5 py-1.5"
        >
          <span class="text-[10px] font-medium text-dimmed">Подгот.</span>

          <span class="text-sm font-bold text-highlighted">{{
            preparedSpells
          }}</span>
        </div>

        <div
          v-for="slot in spellSlots"
          :key="slot.level"
          class="flex flex-col items-center rounded-md border border-default/50 bg-elevated/30 px-2.5 py-1.5"
        >
          <span class="text-[10px] font-medium text-dimmed"
            >{{ slot.level }} кр.{{ slot.isPact ? ' (Пакт)' : '' }}</span
          >

          <span class="text-sm font-bold text-highlighted">{{
            slot.count
          }}</span>
        </div>
      </div>

      <!-- Кнопка открытия компендиума заклинаний -->
      <div
        v-if="spellsLimit > 0 || cantripsLimit > 0 || spellsByLevel !== null"
        class="flex flex-col gap-2"
      >
        <p class="text-sm text-muted">
          <span v-if="cantripsLimit > 0">
            Выберите <strong>{{ cantripsLimit }}</strong> новых заговоров.
          </span>

          <span v-if="spellsLimit > 0">
            Выберите <strong>{{ spellsLimit }}</strong> новых заклинаний
            {{ availableSpellCirclesText }}
            круга.
          </span>

          <span v-if="spellsByLevel">
            Выберите новые заклинания:
            <span
              v-for="(count, levelStr) in spellsByLevel"
              :key="levelStr"
              class="mr-2"
            >
              <strong>{{ count }}</strong> заклинаний {{ levelStr }} кр.
            </span>
          </span>
        </p>

        <UButton
          variant="soft"
          color="primary"
          size="lg"
          icon="tabler:book-2"
          block
          @click.left.exact.prevent="openSpellBrowser"
        >
          Посмотреть заклинания
        </UButton>
      </div>

      <!-- Список выбранных заклинаний (заговоры + заклинания в одну строку) -->
      <div
        v-if="selectedSpells.length > 0"
        class="space-y-1"
      >
        <span
          class="block text-xs font-semibold tracking-wider text-muted uppercase"
        >
          Выбранные заклинания ({{ selectedSpells.length }})
        </span>

        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="spell in selectedSpells"
            :key="spell.id"
            color="neutral"
            variant="subtle"
            size="md"
            class="gap-1.5"
          >
            {{ spell.name }}
            <span class="text-[10px] opacity-60">{{
              spell.level === 0 ? 'заговор' : `${spell.level} кр.`
            }}</span>

            <UIcon
              name="tabler:x"
              class="size-3.5 cursor-pointer opacity-50 transition-opacity hover:opacity-100"
              @click.left.exact.prevent="removeSpell(spell.id)"
            />
          </UBadge>
        </div>
      </div>

      <!-- Нет заклинаний для выбора — информационное сообщение -->
      <p
        v-if="
          spellsLimit === 0 && cantripsLimit === 0 && spellsByLevel === null
        "
        class="text-sm text-dimmed italic"
      >
        Выбор конкретных заклинаний доступен в разделе заклинаний персонажа.
      </p>
    </div>

    <!-- Компендиум заклинаний -->
    <CompendiumDataModal
      v-if="isSpellBrowserOpen"
      :key="spellBrowserKey"
      :open="isSpellBrowserOpen"
      :socket="socket"
      data-file="spells"
      title="Заклинания"
      :initial-class-filter="classKeyFilter"
      :initial-level-filter="availableLevelFilter"
      :selection-limit="compendiumSelectionLimit"
      :cantrips-limit="cantripsLimit > 0 ? cantripsLimit : undefined"
      :preselected-spell-ids="selectedSpellIds"
      :known-spell-names="knownSpellNames"
      :granted-spells="grantedSpellSourcesForCompendium"
      @update:open="isSpellBrowserOpen = $event"
      @select-spells="handleSpellsSelected"
    />
  </div>
</template>
