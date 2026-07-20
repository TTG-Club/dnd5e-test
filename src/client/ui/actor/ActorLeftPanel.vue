<script setup lang="ts">
  import type { AbilityType, ActorArmorClass } from '@vtt/shared';
  import type { Actor, AttackRollMode } from '@vtt/shared/system/dnd.js';

  import {
    BASE_UNARMORED_AC,
    calculateAbilityModifier,
    TOOLS_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, toRef } from 'vue';

  import FieldsetLabel from '@/shared_ui/components/FieldsetLabel.vue';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import { useResolvedStats } from '../../composables/useResolvedStats';
  import ArmorClassModal from './ArmorClassModal.vue';
  import ArmorProficiencyModal from './ArmorProficiencyModal.vue';
  import DiceRollModal from './DiceRollModal.vue';
  import HitPointsModal from './HitPointsModal.vue';
  import LanguageProficiencyModal from './LanguageProficiencyModal.vue';
  import ToolProficiencyModal from './ToolProficiencyModal.vue';
  import WeaponProficiencyModal from './WeaponProficiencyModal.vue';

  defineOptions({ inheritAttrs: false });

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
  }>();

  interface Props {
    actor: Actor;
    isEditMode: boolean;
  }

  // Константы
  const abilities: Array<{
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

  const systemDataStore = useSystemDataStore();

  /**
   * Карта ключ → русское имя для отображения бэйджей владения бронёй
   */
  const armorProfNameMap = computed(() => {
    const map = new Map<string, string>();

    for (const cat of systemDataStore.armorCategories) {
      map.set(cat.key, cat.name);
    }

    for (const bt of systemDataStore.armorBaseTypes) {
      map.set(bt.key, bt.name);
    }

    return map;
  });

  /** Категории брони для умных бэйджей */
  const ARMOR_BADGE_CATEGORIES = [
    { key: 'light', label: 'Вся лёгкая' },
    { key: 'medium', label: 'Вся средняя' },
    { key: 'heavy', label: 'Вся тяжёлая' },
    { key: 'shield', label: 'Все щиты' },
  ];

  /**
   * Умные бэйджи владения бронёй:
   * если вся категория выбрана → один бэйдж, иначе — перечисление
   */
  const armorProfBadges = computed(() => {
    const selected = new Set(props.actor.system.proficiencies.armor);
    const badges: string[] = [];

    for (const cat of ARMOR_BADGE_CATEGORIES) {
      const catKeys = systemDataStore.armorBaseTypes
        .filter((bt) => bt.category === cat.key)
        .map((bt) => bt.key);

      const allSelected =
        catKeys.length > 0
        && catKeys.every((armorKey) => selected.has(armorKey));

      if (allSelected) {
        badges.push(cat.label);
      } else {
        for (const key of catKeys) {
          if (selected.has(key)) {
            badges.push(armorProfNameMap.value.get(key) ?? key);
          }
        }
      }
    }

    // Неизвестные ключи (устаревшие, из старого формата) игнорируются

    return badges;
  });

  /**
   * Карта ключ → русское имя для отображения бэйджей владения оружием
   */
  const weaponProfNameMap = computed(() => {
    const map = new Map<string, string>();

    for (const cat of systemDataStore.weaponCategories) {
      map.set(cat.key, cat.name);
    }

    for (const bt of systemDataStore.weaponBaseTypes) {
      map.set(bt.key, bt.name);
    }

    return map;
  });

  const toolProfBadges = computed(() => {
    return props.actor.system.proficiencies.tools.map((key) => {
      return TOOLS_LABELS[key] ?? key;
    });
  });

  /**
   * Умные бэйджи владения оружием:
   * - все simple/martial выбраны + все мастерства → «Все простые 🏅»
   * - все simple/martial выбраны + часть мастерств → «Все простые» + конкретные с 🏅
   * - частичный выбор → перечисление индивидуальных с пометкой мастерства
   */
  const weaponProfBadges = computed(() => {
    const selected = new Set(props.actor.system.proficiencies.weapons);

    const masteries = new Set(
      props.actor.system.proficiencies.weaponMasteries ?? [],
    );

    const badges: Array<{ label: string; hasMastery: boolean }> = [];

    const simpleKeys = systemDataStore.weaponBaseTypes
      .filter((bt) => bt.category === 'simple')
      .map((bt) => bt.key);

    const martialKeys = systemDataStore.weaponBaseTypes
      .filter((bt) => bt.category === 'martial')
      .map((bt) => bt.key);

    const allSimple =
      simpleKeys.length > 0
      && simpleKeys.every((weaponKey) => selected.has(weaponKey));

    const allMartial =
      martialKeys.length > 0
      && martialKeys.every((weaponKey) => selected.has(weaponKey));

    if (allSimple) {
      const simpleMasteries = simpleKeys.filter((weaponKey) =>
        masteries.has(weaponKey),
      );

      const allSimpleMastery = simpleMasteries.length === simpleKeys.length;

      badges.push({ label: 'Все простые', hasMastery: allSimpleMastery });

      // Если мастерство есть, но не на все — добавляем конкретные
      if (!allSimpleMastery && simpleMasteries.length > 0) {
        for (const key of simpleMasteries) {
          badges.push({
            label: weaponProfNameMap.value.get(key) ?? key,
            hasMastery: true,
          });
        }
      }
    } else {
      for (const key of simpleKeys) {
        if (selected.has(key)) {
          badges.push({
            label: weaponProfNameMap.value.get(key) ?? key,
            hasMastery: masteries.has(key),
          });
        }
      }
    }

    if (allMartial) {
      const martialMasteries = martialKeys.filter((weaponKey) =>
        masteries.has(weaponKey),
      );

      const allMartialMastery = martialMasteries.length === martialKeys.length;

      badges.push({ label: 'Все воинские', hasMastery: allMartialMastery });

      if (!allMartialMastery && martialMasteries.length > 0) {
        for (const key of martialMasteries) {
          badges.push({
            label: weaponProfNameMap.value.get(key) ?? key,
            hasMastery: true,
          });
        }
      }
    } else {
      for (const key of martialKeys) {
        if (selected.has(key)) {
          badges.push({
            label: weaponProfNameMap.value.get(key) ?? key,
            hasMastery: masteries.has(key),
          });
        }
      }
    }

    // Неизвестные ключи (устаревшие, из старого формата) игнорируются

    return badges;
  });

  const { resolvedStats } = useResolvedStats(toRef(() => props.actor));

  // Вычисляемые свойства
  const proficiencyBonus = computed(() => {
    return resolvedStats.value?.proficiencyBonus ?? 0;
  });

  const ARMOR_CALCULATION_LABELS: Record<string, string> = {
    default: 'По умолчанию',
    natural: 'Природная броня',
    flat: 'Фиксированный',
  };

  /** Сводка по костям хитов (Hit Dice) для текущего актора */
  const hitDiceSummary = computed(() => {
    const classes = props.actor.system.classes;

    const manualDice = props.actor.system.manualHitDice;

    // Группируем по кости (d10, d8 и т.д.)
    const diceMap = new Map<number, { total: number; used: number }>();

    if (classes) {
      for (const cls of classes) {
        if (!cls.hitDie) {
          continue;
        }

        const entry = diceMap.get(cls.hitDie) ?? { total: 0, used: 0 };

        entry.total += cls.level;
        entry.used += cls.hitDiceUsed ?? 0;
        diceMap.set(cls.hitDie, entry);
      }
    }

    if (manualDice) {
      for (const group of manualDice) {
        const entry = diceMap.get(group.die) ?? { total: 0, used: 0 };

        entry.total += group.total;
        entry.used += group.used;
        diceMap.set(group.die, entry);
      }
    }

    if (diceMap.size === 0) {
      return { totalCount: 0, availableCount: 0, tooltip: 'Нет костей хитов' };
    }

    let totalCount = 0;
    let availableCount = 0;

    const tooltipParts: string[] = [];

    // Сортируем от большей кости к меньшей (d12 -> d10 -> d8 -> d6)
    for (const [die, stats] of Array.from(diceMap.entries()).sort(
      (entryA, entryB) => entryB[0] - entryA[0],
    )) {
      totalCount += stats.total;
      availableCount += stats.total - stats.used;

      tooltipParts.push(
        `${stats.total - stats.used}к${die} / ${stats.total}к${die}`,
      );
    }

    return {
      totalCount,
      availableCount,
      tooltip: tooltipParts.join('\n'),
    };
  });

  const effectiveAC = computed(() => {
    return (
      resolvedStats.value?.armorClass ?? props.actor.system.armorClass.value
    );
  });

  /** Модификатор ловкости для превью AC в модалке */
  const dexModifier = computed(() => {
    return (
      resolvedStats.value?.abilityMods.dexterity
      ?? calculateAbilityModifier(props.actor.system.abilities.dexterity ?? 10)
    );
  });

  const armorClassTooltip = computed(() => {
    const calculation = props.actor.system.armorClass.calculation;

    const label = ARMOR_CALCULATION_LABELS[calculation] ?? 'По умолчанию';

    const effective = effectiveAC.value;
    const dexMod = dexModifier.value;

    switch (calculation) {
      case 'default': {
        // Ищем экипированную броню и щит для информативного тултипа
        const equipped = (props.actor.equipment ?? []).filter(
          (item) =>
            item.equipped
            && item.baseArmorAC
            && item.equipmentCategory !== 'shield',
        );

        const shield = (props.actor.equipment ?? []).find(
          (item) =>
            item.equipped
            && item.equipmentCategory === 'shield'
            && item.baseArmorAC,
        );

        const armor =
          equipped.length > 0
            ? equipped.reduce((best, item) =>
                (item.baseArmorAC ?? 0) > (best.baseArmorAC ?? 0) ? item : best,
              )
            : undefined;

        if (armor) {
          const maxDex = armor.maxDexBonus;

          const effectiveDex =
            maxDex === null || maxDex === undefined
              ? dexMod
              : Math.min(dexMod, maxDex);

          const magicBonus = armor.magicBonus ?? 0;

          const shieldVal = shield
            ? (shield.baseArmorAC ?? 0) + (shield.magicBonus ?? 0)
            : 0;

          let text = `КД ${effective} = ${armor.baseArmorAC} (${armor.name})`;

          if (effectiveDex !== 0) {
            text += ` + ${effectiveDex} Ловк.`;
          }

          if (magicBonus > 0) {
            text += ` + ${magicBonus} маг.`;
          }

          if (shieldVal > 0) {
            text += ` + ${shieldVal} щит`;
          }

          return text;
        }

        return `КД ${effective} = ${BASE_UNARMORED_AC} + ${dexMod} Ловк. (${label})`;
      }
      case 'natural': {
        const baseNatural = props.actor.system.armorClass.value;

        return `КД ${effective} = ${baseNatural} + ${dexMod} Ловк. (${label})`;
      }
      case 'flat':
        return `КД ${effective} (${label})`;
      default:
        return `КД ${effective} (${label})`;
    }
  });

  // Модалки
  const isArmorClassOpen = ref(false);
  const isHitPointsOpen = ref(false);
  const isDiceRollOpen = ref(false);
  const isArmorProfOpen = ref(false);
  const isWeaponProfOpen = ref(false);
  const isToolsProfOpen = ref(false);
  const isLanguagesProfOpen = ref(false);

  const diceRollConfig = ref({
    modifier: 0,
    title: '',
    rollLabel: '',
    rollButtonText: 'Бросить',
    initialRollMode: 'normal' as AttackRollMode,
    autoFail: false,
  });

  function openArmorClass() {
    isArmorClassOpen.value = true;
  }

  function openHitPoints() {
    isHitPointsOpen.value = true;
  }

  /**
   * Открывает универсальную модалку броска кубиков
   * @param config - конфигурация броска
   * @param config.modifier - модификатор броска
   * @param config.title - заголовок модалки
   * @param config.rollLabel - подпись броска
   * @param config.rollButtonText - текст кнопки броска
   */
  function openDiceRoll(config: {
    modifier: number;
    title: string;
    rollLabel: string;
    rollButtonText?: string;
    initialRollMode?: AttackRollMode;
    autoFail?: boolean;
  }) {
    diceRollConfig.value = {
      ...config,
      rollButtonText: config.rollButtonText ?? 'Бросить',
      initialRollMode: config.initialRollMode ?? 'normal',
      autoFail: config.autoFail ?? false,
    };

    isDiceRollOpen.value = true;
  }

  function handleSavingThrowClick(ability: {
    key: AbilityType;
    label: string;
  }) {
    if (props.isEditMode) {
      return;
    }

    let initialRollMode: AttackRollMode = 'normal';
    let autoFail = false;

    const flags = resolvedStats.value?.activeFlags ?? new Set();

    const hasAdvantage =
      flags.has(`save.advantage.${ability.key}`) || flags.has('save.advantage');

    const hasDisadvantage =
      flags.has(`save.disadvantage.${ability.key}`)
      || flags.has('save.disadvantage');

    if (flags.has(`save.autoFail.${ability.key}`)) {
      autoFail = true;
    }

    if (hasAdvantage && !hasDisadvantage) {
      initialRollMode = 'advantage';
    }

    if (!hasAdvantage && hasDisadvantage) {
      initialRollMode = 'disadvantage';
    }

    openDiceRoll({
      modifier: calculateSavingThrow(ability.key),
      title: `Спасбросок: ${ability.label}`,
      rollLabel: `Спасбросок ${ability.label}`,
      rollButtonText: 'Бросить спасбросок',
      initialRollMode,
      autoFail,
    });
  }

  function onArmorClassApply(armorClass: ActorArmorClass) {
    emit('update:actor', {
      system: { ...props.actor.system, armorClass },
    });
  }

  function onHitPointsApply(data: {
    current: number;
    max: number;
    temp: number;
    classes?: typeof props.actor.system.classes;
    manualHitDice?: Array<{
      die: import('@vtt/shared').HitDie;
      total: number;
      used: number;
    }>;
  }) {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        hitPoints: {
          current: data.current,
          max: data.max,
          temp: data.temp,
        },
        ...(data.classes ? { classes: data.classes } : {}),
        ...(data.manualHitDice ? { manualHitDice: data.manualHitDice } : {}),
      },
    });
  }

  // Методы
  function calculateSavingThrow(abilityKey: AbilityType): number {
    return resolvedStats.value?.saves[abilityKey] ?? 0;
  }

  function formatModifier(value: number): string {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  function toggleSavingThrow(ability: AbilityType) {
    if (!props.isEditMode) {
      return;
    }

    const savingThrows = [...props.actor.system.proficiencies.savingThrows];
    const index = savingThrows.indexOf(ability);

    if (index > -1) {
      savingThrows.splice(index, 1);
    } else {
      savingThrows.push(ability);
    }

    emit('update:actor', {
      system: {
        ...props.actor.system,
        proficiencies: {
          ...props.actor.system.proficiencies,
          savingThrows,
        },
      },
    });
  }

  /**
   * Применяет выбор владения бронёй из модалки
   */
  function onArmorProfApply(selected: string[]) {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        proficiencies: {
          ...props.actor.system.proficiencies,
          armor: selected,
        },
      },
    });
  }

  /**
   * Применяет выбор владения и мастерства оружием из модалки
   */
  function onWeaponProfApply(weapons: string[], masteries: string[]) {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        proficiencies: {
          ...props.actor.system.proficiencies,
          weapons,
          weaponMasteries: masteries,
        },
      },
    });
  }

  /**
   * Применяет выбор владения инструментами из модалки
   */
  function onToolsProfApply(selected: string[]) {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        proficiencies: {
          ...props.actor.system.proficiencies,
          tools: selected,
        },
      },
    });
  }

  /**
   * Применяет выбор языков из модалки
   */
  function onLanguagesProfApply(selected: string[]) {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        proficiencies: {
          ...props.actor.system.proficiencies,
          languages: selected,
        },
      },
    });
  }
</script>

<template>
  <div
    v-bind="$attrs"
    class="flex flex-col gap-3 text-toned"
  >
    <!-- Top Stats Grid -->
    <div class="mb-0 grid grid-cols-2 gap-x-3 gap-y-3">
      <!-- Mastery -->
      <FieldsetLabel
        label="Мастерство"
        center
        class="h-12 border-muted bg-default/20"
      >
        <div class="flex items-center justify-center px-2 pb-2">
          <div class="text-xl font-bold text-highlighted">
            +{{ proficiencyBonus }}
          </div>
        </div>
      </FieldsetLabel>

      <!-- AC -->
      <UTooltip
        :delay-duration="300"
        :ui="{ content: 'h-auto' }"
      >
        <FieldsetLabel
          label="Класс доспеха"
          center
          class="h-12 bg-default/20 transition-colors"
          :class="[
            isEditMode
              ? 'cursor-pointer border-gold/30 hover:border-gold/50'
              : 'border-muted',
          ]"
          @click.left.exact.prevent="isEditMode && openArmorClass()"
        >
          <div class="flex items-center justify-center px-2 pb-2">
            <span class="text-xl font-bold text-highlighted">{{
              effectiveAC
            }}</span>
          </div>
        </FieldsetLabel>

        <template #content>
          <span>{{ armorClassTooltip }}</span>
        </template>
      </UTooltip>
    </div>

    <!-- Здоровье + Кости хитов -->
    <FieldsetLabel
      label="Здоровье"
      class="group cursor-pointer bg-default/20 transition-colors"
      :class="
        isEditMode
          ? 'border-gold/30 hover:border-gold/50'
          : 'border-muted hover:border-primary/50'
      "
      @click.left.exact.prevent="openHitPoints()"
    >
      <!-- ХП: цифры + подписи -->
      <div class="p-3 pt-1">
        <div class="flex items-center">
          <span
            class="flex-1 text-center text-xl font-bold text-white tabular-nums"
            >{{ actor.system.hitPoints?.current ?? 0 }}</span
          >

          <span class="w-3 text-center font-light text-dimmed">/</span>

          <span
            class="flex-1 text-center text-xl font-bold text-muted tabular-nums"
            >{{ actor.system.hitPoints?.max ?? 0 }}</span
          >

          <div class="mx-2 h-6 w-px bg-elevated" />

          <span
            class="flex-1 text-center text-xl font-bold tabular-nums"
            :class="
              (actor.system.hitPoints?.temp ?? 0) > 0
                ? 'text-gold/80'
                : 'text-dimmed'
            "
            >{{ actor.system.hitPoints?.temp ?? 0 }}</span
          >
        </div>

        <div class="mt-0.5 flex items-center">
          <span
            class="flex-1 text-center text-[9px] font-medium tracking-wider text-dimmed uppercase"
            >Сейчас</span
          >

          <span class="w-3" />

          <span
            class="flex-1 text-center text-[9px] font-medium tracking-wider text-dimmed uppercase"
            >Всего</span
          >

          <div class="mx-2 w-px" />

          <span
            class="flex-1 text-center text-[9px] font-medium tracking-wider text-dimmed uppercase"
            >Врем.</span
          >
        </div>
      </div>

      <!-- Разделитель -->
      <div class="border-t border-muted" />

      <!-- Кости хитов -->
      <UTooltip :delay-duration="300">
        <div class="flex items-center justify-between px-3 py-1.5">
          <span
            class="text-[10px] font-bold tracking-wider text-dimmed uppercase"
          >
            Кости хитов
          </span>

          <span class="text-sm font-bold text-toned tabular-nums">
            {{ hitDiceSummary.availableCount }}
            <span class="font-light text-dimmed"
              >/ {{ hitDiceSummary.totalCount }}</span
            >
          </span>
        </div>

        <template #content>
          <div class="flex flex-col gap-0.5">
            <div
              v-for="line in hitDiceSummary.tooltip.split('\n')"
              :key="line"
            >
              {{ line }}
            </div>
          </div>
        </template>
      </UTooltip>
    </FieldsetLabel>

    <!-- Спасброски -->
    <FieldsetLabel
      label="Спасброски"
      class="border-muted bg-default/20"
    >
      <div class="px-2 pb-1">
        <div class="grid grid-cols-2 gap-x-2 gap-y-1">
          <div
            v-for="ability in abilities"
            :key="ability.key"
            class="flex cursor-pointer items-center gap-2 rounded p-1.5 transition-colors hover:bg-elevated"
            @click.left.exact.prevent="handleSavingThrowClick(ability)"
          >
            <button
              class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-accented"
              :class="
                actor.system.proficiencies.savingThrows.includes(ability.key)
                  ? 'bg-inverted'
                  : 'bg-transparent'
              "
              @click.left.exact.prevent="
                isEditMode && toggleSavingThrow(ability.key)
              "
            >
              <div
                v-if="
                  actor.system.proficiencies.savingThrows.includes(ability.key)
                "
                class="h-1.5 w-1.5 rounded-full bg-inverted"
              />
            </button>

            <span class="flex-1 truncate text-sm font-medium text-toned">{{
              ability.shortLabel
            }}</span>

            <span
              class="rounded border border-default bg-elevated px-2 py-0.5 text-sm font-bold text-white shadow-sm"
            >
              {{ formatModifier(calculateSavingThrow(ability.key)) }}
            </span>
          </div>
        </div>
      </div>
    </FieldsetLabel>

    <!-- Владения & Прочее (Броня, Оружие, Инструменты, Языки) -->
    <div class="space-y-5 rounded-lg border border-muted bg-default/20 p-2">
      <!-- Броня -->
      <div>
        <div
          class="mb-2 flex items-center justify-between rounded-lg bg-elevated/40 px-3 py-2"
        >
          <h4 class="text-xs font-bold tracking-wider text-white uppercase">
            Снаряжение
          </h4>

          <UIcon
            v-if="isEditMode"
            name="tabler:settings-filled"
            class="h-4 w-4 cursor-pointer text-dimmed transition-colors hover:text-white"
            @click.left.exact.prevent="isArmorProfOpen = true"
          />
        </div>

        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="badge in armorProfBadges"
            :key="badge"
            :label="badge"
            color="neutral"
            variant="subtle"
          />

          <span
            v-if="armorProfBadges.length === 0"
            class="text-xs text-dimmed italic"
            >Нет</span
          >
        </div>
      </div>

      <!-- Оружие -->
      <div>
        <div
          class="mb-2 flex items-center justify-between rounded-lg bg-elevated/40 px-3 py-2"
        >
          <h4 class="text-xs font-bold tracking-wider text-white uppercase">
            Оружие
          </h4>

          <UIcon
            v-if="isEditMode"
            name="tabler:settings-filled"
            class="h-4 w-4 cursor-pointer text-dimmed transition-colors hover:text-white"
            @click.left.exact.prevent="isWeaponProfOpen = true"
          />
        </div>

        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="badge in weaponProfBadges"
            :key="badge.label"
            :label="badge.label"
            color="neutral"
            variant="subtle"
          >
            <template
              v-if="badge.hasMastery"
              #trailing
            >
              <UIcon
                name="tabler:medal"
                class="h-3.5 w-3.5 text-healing"
              />
            </template>
          </UBadge>

          <span
            v-if="weaponProfBadges.length === 0"
            class="text-xs text-dimmed italic"
            >Нет</span
          >
        </div>
      </div>

      <!-- Инструменты -->
      <div>
        <div
          class="mb-2 flex items-center justify-between rounded-lg bg-elevated/40 px-3 py-2"
        >
          <h4 class="text-xs font-bold tracking-wider text-white uppercase">
            Инструменты
          </h4>

          <UIcon
            v-if="isEditMode"
            name="tabler:settings-filled"
            class="h-4 w-4 cursor-pointer text-dimmed transition-colors hover:text-white"
            @click.left.exact.prevent="isToolsProfOpen = true"
          />
        </div>

        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="tool in toolProfBadges"
            :key="tool"
            :label="tool"
            color="neutral"
            variant="subtle"
          />

          <span
            v-if="actor.system.proficiencies.tools.length === 0"
            class="text-xs text-dimmed italic"
            >Нет</span
          >
        </div>
      </div>

      <!-- Языки -->
      <div>
        <div
          class="mb-2 flex items-center justify-between rounded-lg bg-elevated/40 px-3 py-2"
        >
          <h4 class="text-xs font-bold tracking-wider text-white uppercase">
            Языки
          </h4>

          <UIcon
            v-if="isEditMode"
            name="tabler:settings-filled"
            class="h-4 w-4 cursor-pointer text-dimmed transition-colors hover:text-white"
            @click.left.exact.prevent="isLanguagesProfOpen = true"
          />
        </div>

        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="language in actor.system.proficiencies.languages"
            :key="language"
            :label="language"
            color="neutral"
            variant="subtle"
          />

          <span
            v-if="actor.system.proficiencies.languages.length === 0"
            class="text-xs text-dimmed italic"
            >Нет</span
          >
        </div>
      </div>
    </div>
  </div>

  <!-- Модалка класса доспеха -->
  <ArmorClassModal
    v-model:open="isArmorClassOpen"
    :armor-class="actor.system.armorClass"
    :dex-modifier="dexModifier"
    @apply="onArmorClassApply"
  />

  <!-- Модалка очков здоровья -->
  <HitPointsModal
    v-model:open="isHitPointsOpen"
    :current-hit-points="actor.system.hitPoints?.current ?? 0"
    :max-hit-points="actor.system.hitPoints?.max ?? 0"
    :temp-hit-points="actor.system.hitPoints?.temp ?? 0"
    :classes="actor.system.classes ?? []"
    :manual-hit-dice="actor.system.manualHitDice ?? []"
    @apply="onHitPointsApply"
  />

  <!-- Универсальная модалка броска -->
  <DiceRollModal
    v-model:open="isDiceRollOpen"
    :modifier="diceRollConfig.modifier"
    :title="diceRollConfig.title"
    :roll-label="diceRollConfig.rollLabel"
    :roll-button-text="diceRollConfig.rollButtonText"
    :initial-roll-mode="diceRollConfig.initialRollMode"
    :auto-fail="diceRollConfig.autoFail"
  />

  <!-- Модалка владения бронёй -->
  <ArmorProficiencyModal
    v-model:open="isArmorProfOpen"
    :selected="actor.system.proficiencies.armor"
    @apply="onArmorProfApply"
  />

  <!-- Модалка владения и мастерства оружием -->
  <WeaponProficiencyModal
    v-model:open="isWeaponProfOpen"
    :selected-weapons="actor.system.proficiencies.weapons"
    :selected-masteries="actor.system.proficiencies.weaponMasteries ?? []"
    @apply="onWeaponProfApply"
  />

  <!-- Модалка владения инструментами -->
  <ToolProficiencyModal
    v-model:open="isToolsProfOpen"
    :selected="actor.system.proficiencies.tools"
    @apply="onToolsProfApply"
  />

  <!-- Модалка владения языками -->
  <LanguageProficiencyModal
    v-model:open="isLanguagesProfOpen"
    :selected="actor.system.proficiencies.languages"
    @apply="onLanguagesProfApply"
  />
</template>
