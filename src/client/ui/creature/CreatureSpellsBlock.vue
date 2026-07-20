<script setup lang="ts">
  import type { MeasurementTemplate, SceneEntity } from '@vtt/shared';
  import type {
    AttackRollMode,
    Creature,
    CreatureSpellcasting,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type {
    RolledSpellDamagePart,
    SpellDamagePartInput,
  } from '../../composables/useSpellResolution';

  import { useToast } from '@nuxt/ui/composables';
  import {
    ABILITY_LABELS,
    ABILITY_OPTIONS,
    collectActiveEffects,
    describeDamagePart,
    getCreatureSpellAttackBonus,
    getCreatureSpellRollButtonText,
    getCreatureSpellSaveDC,
    getSpellAttackType,
    SPELL_DAMAGE_TEMPLATE_COLORS,
    SPELL_TEMPLATE_DEFAULT_COLOR,
    spellIsHealing,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { useChatStore } from '@/stores/chatStore';
  import { useSpellTemplateStore } from '@/stores/spellTemplateStore';
  import { useTargetStore } from '@/stores/targetStore';
  import { useWorldStore } from '@/stores/worldStore';

  import { useBonusDamageParts } from '../../composables/useBonusDamageParts';
  import { useSpellResolution } from '../../composables/useSpellResolution';
  import DiceRollModal from '../actor/DiceRollModal.vue';
  import SpellListItem from '../actor/SpellListItem.vue';

  interface Props {
    /** Существо-источник (для авто-вывода DC/бонуса из характеристики) */
    creature?: Creature;
    /** Заклинания существа (верхний уровень `Creature.spells`) */
    spells?: Spell[];
    /** Параметры заклинательства (плоский DC/бонус атаки, характеристика) */
    spellcasting?: CreatureSpellcasting;
    /** Режим редактирования */
    isEditMode: boolean;
    /** Режим только просмотр (компендиум) */
    isReadOnly?: boolean;
    /** ID существа-источника */
    creatureId: string;
    /** Имя существа (для подписей в хотбаре) */
    creatureName: string;
  }

  const props = withDefaults(defineProps<Props>(), {
    creature: undefined,
    spells: () => [],
    spellcasting: undefined,
    isReadOnly: false,
  });

  const emit = defineEmits<{
    'update:spells': [value: Spell[]];
    'update:spellcasting': [value: CreatureSpellcasting];
  }>();

  const { openModal } = useModalManager();
  const toast = useToast();
  const chatStore = useChatStore();
  const targetStore = useTargetStore();
  const worldStore = useWorldStore();
  const spellTemplateStore = useSpellTemplateStore();

  const { buildCreatureSpellRollSetup, buildTargetHpContext } =
    useBonusDamageParts();

  const { resolveSpellDamageWithParts } = useSpellResolution();

  /** Параметры заклинательства с дефолтом */
  const block = computed<CreatureSpellcasting>(() => props.spellcasting ?? {});

  /**
   * Эффективная сложность спасброска: ручное значение либо авто-вывод из
   * характеристики (`8 + бонус мастерства + мод.`), если выбрана.
   */
  const effectiveSaveDC = computed(() =>
    props.creature
      ? getCreatureSpellSaveDC(props.creature)
      : block.value.saveDC,
  );

  /**
   * Эффективный бонус к атаке: ручное значение либо авто-вывод из
   * характеристики (`бонус мастерства + мод.`), если выбрана.
   */
  const effectiveAttackBonus = computed(() =>
    props.creature
      ? getCreatureSpellAttackBonus(props.creature)
      : block.value.attackBonus,
  );

  /** Подпись бонуса атаки заклинаниями (со знаком) */
  const attackBonusLabel = computed(() => {
    const bonus = effectiveAttackBonus.value ?? 0;

    return `${bonus >= 0 ? '+' : ''}${bonus}`;
  });

  /** Подпись заклинательной характеристики */
  const abilityLabel = computed(() =>
    block.value.ability ? ABILITY_LABELS[block.value.ability] : '—',
  );

  /** Группы заклинаний по способу отката (в порядке отображения) */
  const RECOVERY_GROUPS = [
    { recovery: 'atWill', label: 'По желанию' },
    { recovery: 'shortRest', label: 'Короткий отдых' },
    { recovery: 'longRest', label: 'Продолжительный отдых' },
  ] as const;

  /** Заклинания, сгруппированные по способу отката (только непустые группы) */
  const spellsByRecovery = computed(() =>
    RECOVERY_GROUPS.map((group) => ({
      label: group.label,
      spells: props.spells.filter(
        (spell) => (spell.uses?.recovery ?? 'atWill') === group.recovery,
      ),
    })).filter((group) => group.spells.length > 0),
  );

  /**
   * Обновляет параметры заклинательства частичным патчем (иммутабельно).
   * @param patch - изменяемые поля
   */
  function updateSpellcasting(patch: Partial<CreatureSpellcasting>): void {
    emit('update:spellcasting', { ...block.value, ...patch });
  }

  /**
   * Эмитит обновлённый список заклинаний существа.
   * @param spells - новый список заклинаний
   */
  function updateSpells(spells: Spell[]): void {
    emit('update:spells', spells);
  }

  /**
   * Обработчик изменения сложности спасброска.
   * @param event - событие ввода
   */
  function handleSaveDcInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);

    updateSpellcasting({ saveDC: Number.isFinite(value) ? value : undefined });
  }

  /**
   * Обработчик изменения бонуса атаки заклинаниями.
   * @param event - событие ввода
   */
  function handleAttackBonusInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);

    updateSpellcasting({
      attackBonus: Number.isFinite(value) ? value : undefined,
    });
  }

  /**
   * Обработчик выбора заклинательной характеристики.
   * @param ability - выбранная характеристика
   */
  function handleAbilityChange(ability: CreatureSpellcasting['ability']): void {
    updateSpellcasting({ ability });
  }

  // ── Редактирование / удаление ─────────────────────────────────────────────

  /**
   * Открывает форму редактирования заклинания.
   * @param spell - редактируемое заклинание
   */
  function openEditForm(spell: Spell): void {
    openModal('SpellFormModal', {
      spell,
      onSave: (updated: Spell) => {
        updateSpells(
          props.spells.map((entry) =>
            entry.id === updated.id ? updated : entry,
          ),
        );
      },
    });
  }

  /**
   * Удаляет заклинание существа.
   * @param spellId - id заклинания
   */
  function deleteSpell(spellId: string): void {
    updateSpells(props.spells.filter((entry) => entry.id !== spellId));
  }

  /**
   * Открывает детальную карточку заклинания (просмотр + кнопка применения).
   * @param spell - заклинание
   */
  function openDetail(spell: Spell): void {
    openModal('SpellDetailModal', {
      spell,
      showCastButton: !props.isReadOnly,
      onCast: () => castSpell(spell),
    });
  }

  /**
   * Делится заклинанием в чат.
   * @param spell - заклинание
   */
  function shareSpell(spell: Spell): void {
    chatStore.sendItemCard({
      cardType: 'spell',
      title: spell.name,
      payload: JSON.stringify(spell),
    });
  }

  // ── Списание зарядов ──────────────────────────────────────────────────────

  /**
   * Списывает один заряд заклинания (для заклинаний с откатом, не «по желанию»).
   * @param spell - заклинание
   */
  function consumeSpellUse(spell: Spell): void {
    if (!spell.uses || spell.uses.recovery === 'atWill') {
      return;
    }

    updateSpells(
      props.spells.map((entry) =>
        entry.id === spell.id && entry.uses
          ? {
              ...entry,
              uses: {
                ...entry.uses,
                current: Math.max(0, entry.uses.current - 1),
              },
            }
          : entry,
      ),
    );
  }

  // ── Каст заклинания ───────────────────────────────────────────────────────

  const isRollModalOpen = ref(false);

  const rollConfig = ref({
    title: '',
    name: '',
    formula: '',
    rollButtonText: 'Бросить урон',
    attackModifier: undefined as number | undefined,
    initialRollMode: 'normal' as AttackRollMode,
    incomingAttackType: undefined as 'melee' | 'ranged' | 'spell' | undefined,
    damageType: undefined as string | undefined,
    isHealing: false,
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

  /** Существо-источник (для casterId, эффектов, @-переменных) */
  function getCreatureEntity(): Creature | null {
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

  /** Основной тип урона заклинания (для цвета шаблона и подписи броска) */
  function spellPrimaryType(spell: Spell): string | undefined {
    const first = spell.damageParts?.[0];

    return first ? describeDamagePart(first).types[0] : undefined;
  }

  /**
   * Запускает каст заклинания существа. Списывает заряд (если есть), для области
   * сначала размещает шаблон у токена существа, затем открывает бросок.
   *
   * @param spell - заклинание существа
   */
  function castSpell(spell: Spell): void {
    if (props.isReadOnly) {
      return;
    }

    const creature = getCreatureEntity();

    if (!creature) {
      return;
    }

    if (
      spell.uses
      && spell.uses.recovery !== 'atWill'
      && spell.uses.current <= 0
    ) {
      toast.add({
        title: 'Нет зарядов',
        description: `У «${spell.name}» не осталось зарядов — нужен отдых.`,
        color: 'warning',
      });

      return;
    }

    consumeSpellUse(spell);

    // Область: размещаем шаблон у токена существа, затем кидаем урон
    if (spell.areaOfEffect) {
      const color =
        SPELL_DAMAGE_TEMPLATE_COLORS[spellPrimaryType(spell) ?? '']
        ?? SPELL_TEMPLATE_DEFAULT_COLOR;

      spellTemplateStore.requestPlacement(
        spell.areaOfEffect,
        color,
        props.creatureId,
        (templateId) => startSpellRoll(spell, creature, templateId),
        null,
      );

      return;
    }

    startSpellRoll(spell, creature, undefined);
  }

  /**
   * Готовит и открывает DiceRollModal для заклинания существа (многочастный
   * путь). Атакующие заклинания идут с броском попадания (плоский бонус из
   * блока заклинательства); спасброски/область — без него.
   *
   * @param spell - заклинание существа
   * @param creature - существо-источник
   * @param templateId - id размещённого AoE-шаблона (если область)
   */
  function startSpellRoll(
    spell: Spell,
    creature: Creature,
    templateId: string | undefined,
  ): void {
    const attackType = getSpellAttackType(spell);

    const usesSaveOrArea =
      (!!spell.saveType && spell.saveType !== 'none') || !!spell.areaOfEffect;

    const usesAttack = attackType !== undefined && !usesSaveOrArea;

    const effects = collectActiveEffects(creature);

    const targetHp = spell.areaOfEffect ? undefined : buildTargetHpContext();

    const targetIsFull = targetHp
      ? targetHp.currentHp >= targetHp.maxHp
      : undefined;

    const setup = buildCreatureSpellRollSetup({
      spell,
      creature,
      effects,
      targetIsFull,
    });

    // Эффекты заклинания: у атак — на цель при попадании; у спаса/области —
    // через оркестратор по каждой задетой цели в зависимости от спаса.
    const enabledEffects = spell.activeEffects?.filter(
      (effect) => !effect.disabled,
    );

    let onHit: (() => void) | undefined;

    if (!usesAttack) {
      setup.pseudoSpell.activeEffects = enabledEffects?.length
        ? enabledEffects
        : undefined;
    } else if (enabledEffects?.length) {
      onHit = () => {
        targetStore.applyEffectsToTarget(enabledEffects, 'feature');
      };
    }

    const isHealing = spellIsHealing(spell);

    rollConfig.value = {
      title: usesAttack ? `Атака — ${spell.name}` : spell.name,
      name: spell.name,
      formula: setup.baseParts[0]?.formula ?? '',
      rollButtonText: getCreatureSpellRollButtonText(usesAttack, isHealing),
      attackModifier: usesAttack
        ? getCreatureSpellAttackBonus(creature)
        : undefined,
      initialRollMode: 'normal',
      incomingAttackType: usesAttack ? attackType : undefined,
      damageType: spellPrimaryType(spell),
      isHealing,
      damageParts: setup.baseParts,
      evaluateBonusDamageParts: setup.evaluateBonusDamageParts,
      onRollParts: (parts: RolledSpellDamagePart[]) =>
        applySpellParts(spell, creature, setup.pseudoSpell, parts, templateId),
      onHit,
    };

    isRollModalOpen.value = true;
  }

  /**
   * Применяет брошенные части урона/лечения заклинания существа через
   * многочастный оркестратор (спасброски целей, защиты по типу, AoE-шаблон,
   * единый HP-апдейт). DC спасброска — плоский из блока заклинательства.
   *
   * @param spell - заклинание (источник saveType/saveEffect)
   * @param creature - существо-источник (casterId для self-частей)
   * @param pseudoSpell - псевдо-заклинание (клон с activeEffects для спас/области)
   * @param parts - брошенные части урона
   * @param templateId - id размещённого AoE-шаблона (если был)
   */
  function applySpellParts(
    spell: Spell,
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
          spellSaveDC: getCreatureSpellSaveDC(creature) ?? 10,
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
</script>

<template>
  <div class="space-y-3">
    <!-- Параметры заклинательства: DC / бонус атаки / характеристика.
         Фиксированная высота — чтобы панель не прыгала при переключении
         в режим редактирования (поля ввода чуть выше текстовых значений). -->
    <div
      class="flex min-h-12 items-center justify-between gap-3 rounded-lg bg-accented/30 px-3"
    >
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <!-- DC спасброска -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted">DC спасброска</span>

          <UInput
            v-if="isEditMode && !isReadOnly"
            :model-value="block.saveDC"
            :placeholder="
              effectiveSaveDC !== undefined ? String(effectiveSaveDC) : 'авто'
            "
            type="number"
            size="xs"
            class="w-14"
            @input="handleSaveDcInput"
          />

          <span
            v-else
            class="text-lg font-bold text-gold"
          >
            {{ effectiveSaveDC ?? '—' }}
          </span>
        </div>

        <div class="h-6 w-px bg-accented" />

        <!-- Бонус атаки -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted">Бонус атаки</span>

          <UInput
            v-if="isEditMode && !isReadOnly"
            :model-value="block.attackBonus"
            :placeholder="
              effectiveAttackBonus !== undefined
                ? String(effectiveAttackBonus)
                : 'авто'
            "
            type="number"
            size="xs"
            class="w-14"
            @input="handleAttackBonusInput"
          />

          <span
            v-else
            class="text-lg font-bold text-healing"
          >
            {{ attackBonusLabel }}
          </span>
        </div>

        <div class="h-6 w-px bg-accented" />

        <!-- Заклинательная характеристика -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted">Характеристика</span>

          <USelect
            v-if="isEditMode && !isReadOnly"
            :model-value="block.ability"
            :items="[...ABILITY_OPTIONS]"
            value-key="value"
            size="xs"
            class="w-32"
            @update:model-value="handleAbilityChange"
          />

          <span
            v-else
            class="text-sm font-semibold text-highlighted"
          >
            {{ abilityLabel }}
          </span>
        </div>
      </div>
    </div>

    <!-- Список заклинаний по способу отката -->
    <div
      v-for="group in spellsByRecovery"
      :key="group.label"
      class="space-y-1"
    >
      <h4 class="text-xs font-bold tracking-wider text-muted uppercase">
        {{ group.label }}
      </h4>

      <SpellListItem
        v-for="spell in group.spells"
        :key="spell.id"
        :item="spell"
        :creature-id="creatureId"
        :is-edit-mode="isEditMode && !isReadOnly"
        :show-cast="!isReadOnly"
        :show-edit="!isReadOnly"
        :show-delete="!isReadOnly"
        @click="openDetail(spell)"
        @cast="castSpell(spell)"
        @edit="openEditForm(spell)"
        @delete="deleteSpell(spell.id)"
        @share="shareSpell(spell)"
      />
    </div>

    <!-- Пусто -->
    <p
      v-if="spellsByRecovery.length === 0"
      class="text-sm text-dimmed"
    >
      Заклинаний нет. Перетащите заклинание из компендиума или раздела
      предметов.
    </p>

    <DiceRollModal
      v-model:open="isRollModalOpen"
      :formula="rollConfig.formula"
      :title="rollConfig.title"
      :roll-label="rollConfig.name"
      :attack-modifier="rollConfig.attackModifier"
      :initial-roll-mode="rollConfig.initialRollMode"
      :incoming-attack-type="rollConfig.incomingAttackType"
      :damage-type="rollConfig.damageType"
      :is-healing="rollConfig.isHealing"
      :roll-button-text="rollConfig.rollButtonText"
      :damage-parts="rollConfig.damageParts"
      :evaluate-bonus-damage-parts="rollConfig.evaluateBonusDamageParts"
      :on-roll-parts="rollConfig.onRollParts"
      :on-hit="rollConfig.onHit"
    />
  </div>
</template>
