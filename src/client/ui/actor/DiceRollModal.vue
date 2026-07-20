<script setup lang="ts">
  import type { DamageType } from '@vtt/shared';
  import type {
    AttackRollMode,
    IncomingAttackContext,
  } from '@vtt/shared/system/dnd.js';

  import type {
    RolledSpellDamagePart,
    SpellDamagePartInput,
  } from '../../composables/useSpellResolution';

  import {
    buildAttackFormula,
    doubleDiceInFormula,
    formatDamageDefenseSuffix,
    getShortDamageTypeLabel,
    performTwoStageAttack,
    scaleDamageFormula,
  } from '@vtt/shared/system/dnd.js';
  import { promiseTimeout } from '@vueuse/core';
  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';
  import { useChatStore } from '@/stores/chatStore';
  import { useDiceRollerStore } from '@/stores/diceRollerStore';
  import { useTargetStore } from '@/stores/targetStore';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  type RollVisibility = 'public' | 'gm' | 'private';

  interface Props {
    open: boolean;
    /** Заголовок модалки (напр. "Бросок инициативы", "Атака — Длинный меч") */
    title: string;
    /** Контекст/label для чата (напр. "Инициатива", "Атака — Длинный меч") */
    rollLabel: string;
    /** Текст кнопки броска (напр. "Бросить инициативу") */
    rollButtonText?: string;
    /**
     * Произвольная формула для броска (напр. "1к8 + 3").
     * Если указана — используется вместо стандартной "1к20 + modifier".
     */
    formula?: string;
    /**
     * Необязательное переопределение формулы ТОЛЬКО для отображения в блоке
     * «Формула». Нужно для условных веток @target (показ «2к8 или 2к12», когда
     * состояние цели неизвестно). На сам бросок не влияет — там используется
     * `formula` / `damageParts`.
     */
    formulaDisplay?: string;
    /**
     * Модификатор для стандартной формулы 1к20.
     * Используется только если formula не передана.
     */
    modifier?: number;
    /** Является ли это лечением (прибавить HP вместо вычитания) */
    isHealing?: boolean;
    /**
     * Бонус атаки (мод. характеристики + мастерство + доп. бонус).
     * Передаётся всегда, когда действие — атака; будет ли реально бросок
     * попадания, модалка решает сама по наличию выбранной цели.
     */
    attackModifier?: number;
    /** Функция для вычисления условных бонусов в момент броска */
    // eslint-disable-next-line vue/require-default-prop
    evaluateConditionalBonuses?: (context: {
      hasAdvantage: boolean;
      hasDisadvantage: boolean;
    }) => { attackBonus: number; damageBonus: number };
    initialRollMode?: AttackRollMode;
    /** Тип входящей атаки для расчёта условных бонусов к AC цели (melee/ranged/spell) */
    incomingAttackType?: IncomingAttackContext['attackType'];
    autoFail?: boolean;
    /** Тип урона для расчета сопротивлений */
    damageType?: string;
    /** Сложность проверки/спасброска для вывода успеха или провала */
    targetDc?: number;

    // --- Секция каста заклинания (опционально) ---
    /** Базовый круг заклинания (0 = заговор). Если задан — показываем секцию «Круг» */
    spellLevel?: number;
    /** Массив Доступных уровней заклинаний. Если передан, селект предложит только их. */
    availableSpellLevels?: number[];
    /** Данные для масштабирования урона при усилении */
    spellScalingDice?: string;
    /** Уровень Pact-слота (warlock). Если > 0, показываем чекбокс */
    pactSlotLevel?: number;
    onSpellSlotConsume?: (
      castLevel: number,
      consumeSlot: boolean,
      isPactSlot: boolean,
    ) => void;
    /** Коллбэк при любом успешном применении / броске. Передаёт итоговый урон и выбранный тип урона. */
    onRoll?: (damageTotal: number, resolvedDamageType?: string) => void;
    /**
     * Части урона/лечения (многочастный путь). Если заданы — модалка катает
     * каждую часть, объединяет в один бросок и вызывает `onRollParts` с разбивкой
     * вместо `onRoll`. Применение делегируется наружу (resolveSpellDamageWithParts).
     */
    damageParts?: SpellDamagePartInput[];
    /** Коллбэк многочастного пути: получает брошенные части. */
    onRollParts?: (parts: RolledSpellDamagePart[]) => void;
    /**
     * Roll-time сборщик бонус-частей урона от Active Effects (кость-формулы в
     * `damage.*`, в т.ч. условные «+2к6 при преимуществе»). Вызывается в момент
     * броска с фактическим режимом (преимущество/помеха); результат добавляется
     * к `damageParts`. Работает только в многочастном пути.
     */
    evaluateBonusDamageParts?: (context: {
      hasAdvantage: boolean;
      hasDisadvantage: boolean;
    }) => SpellDamagePartInput[];
    /** Коллбэк при попадании атаки (вызывается даже если нет формулы урона). */
    onHit?: () => void;
    /**
     * Коллбэк при совершении броска атаки (попадание ИЛИ промах). Вызывается
     * ДО самого броска — режим (преим./помеха) к этому моменту уже зафиксирован
     * в `attackRollMode`, а расход одноразовых эффектов «следующей атаки»
     * (consumeOn) должен опередить эмит урона по цели. НЕ вызывается при отмене
     * окна и при бросках без атаки (чистый урон / лечение / спасбросок).
     */
    onAttackRolled?: () => void;
    /**
     * Серия атак снарядов (Мистический заряд, Палящий луч): по кнопке модалка
     * НЕ катает ни атаку, ни урон сама, а отдаёт контекст броска (итоговый
     * модификатор атаки с учётом доп. бонуса и режим преимущества/помехи)
     * вызывающему — тот выполняет бросок попадания для каждого снаряда и урон
     * за попадания (useSpellResolution.resolveSpellDamage → projectileAttack).
     */
    onProjectileAttack?: (context: {
      attackModifier: number;
      rollMode: AttackRollMode;
    }) => void;
    /** Если true — модалка НЕ применяет урон к цели (обработка делегирована вызывающему) */
    skipDamageApplication?: boolean;
    /** Если true — модалка НЕ отправляет результат в чат (вызывающий сам формирует сообщение) */
    skipChatMessage?: boolean;
    /**
     * Если true — модалка вообще НЕ кидает кубик (нет броска 1к20/урона и
     * сообщения о броске). Нужно для заклинаний-самобаффов без урона (напр.
     * Щит): окно служит только выбором круга и подтверждением — списывает
     * ячейку (`onSpellSlotConsume`) и зовёт `onRoll(0)`.
     */
    skipRoll?: boolean;
  }

  const props = withDefaults(defineProps<Props>(), {
    rollButtonText: 'Бросить',
    formula: undefined,
    formulaDisplay: undefined,
    modifier: 0,
    isHealing: false,
    attackModifier: undefined,
    initialRollMode: 'normal',
    incomingAttackType: undefined,
    damageType: undefined,
    spellLevel: undefined,
    availableSpellLevels: () => [],
    spellScalingDice: undefined,
    pactSlotLevel: 0,
    onSpellSlotConsume: undefined,
    onRoll: undefined,
    damageParts: undefined,
    onRollParts: undefined,
    evaluateBonusDamageParts: undefined,
    onHit: undefined,
    onAttackRolled: undefined,
    onProjectileAttack: undefined,
    skipDamageApplication: false,
    skipChatMessage: false,
    skipRoll: false,
    targetDc: undefined,
  });

  const emit = defineEmits<{
    'update:open': [value: boolean];
  }>();

  const diceRollerStore = useDiceRollerStore();
  const chatStore = useChatStore();
  const targetStore = useTargetStore();
  const systemDataStore = useSystemDataStore();

  /** Пауза перед показом броска урона, когда 3D-кубики выключены (мс) */
  const ATTACK_RESULT_DELAY_MS = 800;

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const bonusValue = ref(0);
  const rollType = ref<RollVisibility>('public');

  // --- Стейт каста заклинания ---
  const selectedSpellLevel = ref(0);
  const consumeSpellSlot = ref(true);
  const usePactSlot = ref(false);

  // --- Стейт выбора типа урона ---
  const selectedChoiceDamageType = ref<DamageType>('fire');

  /** Нужен ли выбор типа урона (заклинания с damageType: 'choice') */
  const isDamageTypeChoice = computed(() => props.damageType === 'choice');

  /** Итоговый тип урона: выбранный игроком или из пропа */
  const resolvedDamageType = computed(() => {
    if (isDamageTypeChoice.value) {
      return selectedChoiceDamageType.value;
    }

    return props.damageType;
  });

  /** Опции для селекта типа урона */
  const damageTypeOptions = computed(() =>
    systemDataStore.damageTypes
      .filter((dt) => dt.key !== 'choice')
      .map((dt) => ({
        label: dt.name,
        value: dt.key as DamageType,
      })),
  );

  /** Показывать ли секцию каста заклинания */
  const hasSpellCast = computed(
    () => props.spellLevel !== undefined && props.spellLevel > 0,
  );

  /** Доступные круги для усиления */
  const spellLevelItems = computed(() => {
    if (!hasSpellCast.value || props.spellLevel === undefined) {
      return [];
    }

    if (props.availableSpellLevels.length > 0) {
      return props.availableSpellLevels.map((lvl) => ({
        label: `${lvl}-й круг`,
        value: lvl,
      }));
    }

    const items = [];
    const baseLevel = props.spellLevel;

    for (let idx = baseLevel; idx <= 9; idx++) {
      items.push({ label: `${idx}-й круг`, value: idx });
    }

    return items;
  });

  /** Можно ли выбрать Pact-слот */
  const canUsePactSlot = computed(() => {
    if (!props.pactSlotLevel || props.spellLevel === undefined) {
      return false;
    }

    return (
      props.pactSlotLevel > 0
      && props.pactSlotLevel >= props.spellLevel
      && selectedSpellLevel.value === props.pactSlotLevel
    );
  });

  /** Режим броска атаки (обычный / преимущество / помеха) */
  const attackRollMode = ref<AttackRollMode>('normal');

  /** AC цели с учётом типа входящей атаки. Реактивен к смене цели, пока модалка открыта */
  const targetAc = computed(() => {
    const attackContext: IncomingAttackContext | undefined =
      props.incomingAttackType
        ? { attackType: props.incomingAttackType }
        : undefined;

    return targetStore.getTargetAc(attackContext);
  });

  /**
   * Будет ли бросок попадания. Единая точка решения для UI и самого броска:
   * вызывающий передаёт attackModifier, если действие — атака, а наличие
   * выбранной цели проверяется здесь (без цели катится только урон).
   */
  const hasAttackRoll = computed(
    () =>
      props.attackModifier !== undefined
      && !props.isHealing
      && targetAc.value !== null,
  );

  /**
   * Показывать ли секцию «Режим броска» (обычный/преимущество/помеха). Только
   * при реальном броске: атака по цели, серия атак снарядов или стандартная
   * d20-проверка (без `formula`). При `skipRoll` (самобафф без броска) скрыта.
   */
  const showRollModeSection = computed(
    () =>
      !props.skipRoll
      && (hasAttackRoll.value
        || !props.formula
        || props.onProjectileAttack !== undefined),
  );

  /** Текст кнопки: атака без выбранной цели откатывается к броску урона */
  const effectiveRollButtonText = computed(() => {
    if (
      props.attackModifier !== undefined
      && !props.isHealing
      && targetAc.value === null
      && props.onProjectileAttack === undefined
    ) {
      return 'Бросить урон';
    }

    return props.rollButtonText;
  });

  /** Динамически вычисляемые условные бонусы (срабатывают, если условия соблюдены) */
  const currentConditionalBonuses = computed(() => {
    if (!props.evaluateConditionalBonuses) {
      return { attackBonus: 0, damageBonus: 0 };
    }

    return props.evaluateConditionalBonuses({
      hasAdvantage: attackRollMode.value === 'advantage',
      hasDisadvantage: attackRollMode.value === 'disadvantage',
    });
  });

  /** Итоговая формула урона с учётом усиления на высших кругах */
  const effectiveFormula = computed(() => {
    if (
      !hasSpellCast.value
      || !props.formula
      || !props.spellScalingDice
      || props.spellLevel === undefined
    ) {
      return props.formula;
    }

    const levelDiff = selectedSpellLevel.value - props.spellLevel;

    if (levelDiff <= 0) {
      return props.formula;
    }

    // Используем утилиту из shared
    return scaleDamageFormula(
      props.formula,
      props.spellScalingDice,
      props.spellLevel,
      selectedSpellLevel.value,
    );
  });

  /** Базовая формула для отображения (без бонуса пользователя, но с учётом условных атак) */
  const displayFormula = computed(() => {
    // formulaDisplay переопределяет показ (условные ветки @target → «или»),
    // не затрагивая формулу броска. Масштабирование на высших кругах в этом
    // режиме не визуализируем — условные заклинания показываем как есть.
    const baseFormula =
      props.formulaDisplay ?? effectiveFormula.value ?? props.formula;

    if (baseFormula && !hasAttackRoll.value) {
      // Это чистый бросок урона или кастомный бросок формулы,
      // возможно мы захотим добавить currentConditionalBonuses.damageBonus сюда.
      // Но DiceRollModal используется как для атаки, так и отдельно
      const dmgBonus = currentConditionalBonuses.value.damageBonus;

      if (dmgBonus === 0) {
        return baseFormula;
      }

      return `${baseFormula}${dmgBonus > 0 ? '+' : ''}${dmgBonus}`;
    }

    // Для атак показываем бонус атаки (мод. характеристики + мастерство + …);
    // для прочих d20-бросков (спасы/проверки) — `modifier`.
    const baseMod = props.attackModifier ?? props.modifier;

    const mod = baseMod + currentConditionalBonuses.value.attackBonus;

    return buildAttackFormula(mod, attackRollMode.value);
  });

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        bonusValue.value = 0;
        rollType.value = 'public';
        attackRollMode.value = props.initialRollMode;

        // Сброс стейта заклинания
        if (props.spellLevel !== undefined) {
          selectedSpellLevel.value =
            props.availableSpellLevels.length > 0
              ? props.availableSpellLevels[0]
              : props.spellLevel;

          consumeSpellSlot.value = props.spellLevel > 0;
          usePactSlot.value = false;
        }
      }
    },
    { immediate: true },
  );

  /**
   * Выполняет бросок и отправляет результат в чат.
   * Если задан attackModifier и есть цель — выполняет двухэтапную атаку D&D 5e.
   */
  function performRoll() {
    // Сохраняем текущие значения и устанавливаем нужные
    const prevPrivate = chatStore.isPrivateRoll;
    const prevGmOnly = chatStore.isGmOnlyRoll;

    chatStore.isPrivateRoll = rollType.value === 'private';
    chatStore.isGmOnlyRoll = rollType.value === 'gm';

    try {
      // --- Списание ячейки заклинания ---
      if (hasSpellCast.value && props.onSpellSlotConsume) {
        props.onSpellSlotConsume(
          selectedSpellLevel.value,
          consumeSpellSlot.value,
          usePactSlot.value && consumeSpellSlot.value,
        );
      }

      // --- Самобафф без броска: только списание ячейки + onRoll(0) ---
      // (Щит и пр.: окно нужно лишь для выбора круга и подтверждения).
      if (props.skipRoll) {
        if (props.onRoll) {
          props.onRoll(0, resolvedDamageType.value);
        }

        return;
      }

      // --- Серия атак снарядов: модалка только собирает контекст броска ---
      // Цели уже распределены (projectileStore); броски попадания и урон
      // выполняет вызывающий — по броску на каждый снаряд против AC его цели.
      if (props.onProjectileAttack) {
        // Расход одноразовых эффектов ДО броска: режим (преим./помеха) уже
        // зафиксирован в attackRollMode, а снятие эффекта должно опередить эмит
        // урона по цели — иначе два полных снапшота сущности гонятся.
        props.onAttackRolled?.();

        props.onProjectileAttack({
          attackModifier:
            (props.attackModifier ?? 0)
            + bonusValue.value
            + currentConditionalBonuses.value.attackBonus,
          rollMode: attackRollMode.value,
        });

        return;
      }

      // AC цели, если будет бросок попадания (null — катим только урон)
      const attackTargetAc = hasAttackRoll.value ? targetAc.value : null;

      // --- Многочастный путь: один общий бросок всех частей ---
      if (props.damageParts && props.damageParts.length > 0) {
        // Бонус-части урона от Active Effects собираются в момент броска:
        // условия (преимущество/помеха, HP цели) оцениваются по фактическому
        // режиму, выбранному в модалке.
        const bonusParts = props.evaluateBonusDamageParts
          ? props.evaluateBonusDamageParts({
              hasAdvantage: attackRollMode.value === 'advantage',
              hasDisadvantage: attackRollMode.value === 'disadvantage',
            })
          : [];

        const effectiveParts = [...props.damageParts, ...bonusParts];

        // Плоский условный бонус урона (evaluateConditionalBonuses) в
        // одночастном пути дописывается к формуле урона — сохраняем паритет,
        // дописывая его к первой урон-части. Прокидывается только оружейными
        // путями (заклинания этот проп не передают — их поведение не меняется).
        const flatDamageBonus = currentConditionalBonuses.value.damageBonus;

        if (flatDamageBonus !== 0) {
          const firstDamageIndex = effectiveParts.findIndex(
            (part) => !part.isHealing,
          );

          if (firstDamageIndex !== -1) {
            const sign = flatDamageBonus > 0 ? '+' : '';

            effectiveParts[firstDamageIndex] = {
              ...effectiveParts[firstDamageIndex],
              formula: `${effectiveParts[firstDamageIndex].formula}${sign}${flatDamageBonus}`,
            };
          }
        }

        if (attackTargetAc !== null) {
          // Расход одноразовых эффектов ДО броска (режим уже зафиксирован):
          // снятие должно опередить эмит урона по цели, без гонки снапшотов.
          props.onAttackRolled?.();
          // Атака: бросок попадания → части на попадании
          performPartsAttackRoll(attackTargetAc, effectiveParts);
        } else {
          performPartsRoll(effectiveParts);
        }

        return;
      }

      // --- Двухэтапная атака (D&D 5e) ---
      let damageTotal = 0;

      if (attackTargetAc !== null) {
        // Расход одноразовых эффектов ДО броска (режим уже зафиксирован):
        // снятие должно опередить эмит урона по цели, без гонки снапшотов.
        props.onAttackRolled?.();
        damageTotal = performAttackRoll(attackTargetAc);
      } else {
        // Обычный бросок (лечение или без цели)
        damageTotal = performSimpleRoll();
      }

      if (props.onRoll) {
        props.onRoll(damageTotal, resolvedDamageType.value);
      }
    } catch (err) {
      console.error('[DiceRollModal] Ошибка броска:', err);
    } finally {
      isOpen.value = false;

      // Восстанавливаем
      chatStore.isPrivateRoll = prevPrivate;
      chatStore.isGmOnlyRoll = prevGmOnly;
    }
  }

  /**
   * Двухэтапная атака: бросок попадания → бросок урона.
   * Делегирует всю логику в performTwoStageAttack из attackUtils.
   *
   * @param targetAc - класс доспеха цели
   */
  function performAttackRoll(targetAc: number): number {
    const attackMod =
      (props.attackModifier ?? 0)
      + bonusValue.value
      + currentConditionalBonuses.value.attackBonus;

    const attackFormula = buildAttackFormula(attackMod, attackRollMode.value);
    const targetName = targetStore.targetName ?? 'Цель';

    // Прикрепляем условный бонус урона к формуле урона (props.formula), если он есть
    const damageBonus = currentConditionalBonuses.value.damageBonus;

    let finalDamageFormula = effectiveFormula.value ?? '';

    if (damageBonus !== 0 && finalDamageFormula) {
      finalDamageFormula += `${damageBonus > 0 ? '+' : ''}${damageBonus}`;
    }

    const attackOutput = performTwoStageAttack(
      {
        attackFormula,
        attackModifier: attackMod,
        targetAc,
        weaponName: props.rollLabel,
        targetName,
        damageFormula: finalDamageFormula,
        targetActorId: targetStore.targetActorId,
        targetFlags: targetStore.getTargetFlags(),
        damageType: resolvedDamageType.value,
      },
      (formula) => diceRollerStore.parseAndRoll(formula),
      (damage, isHealing) =>
        targetStore.applyToTarget(damage, isHealing, resolvedDamageType.value),
    );

    chatStore.sendMessage(attackFormula, 'roll', attackOutput.attackRoll);

    if (attackOutput.attackResult.isHit && props.onHit) {
      props.onHit();
    }

    // Бросок урона показываем только ПОСЛЕ отображения броска атаки:
    // при включённых 3D-кубиках ждём окончания их анимации, иначе — короткую
    // паузу, чтобы результат d20 успел прочитаться. На промахе урона нет.
    if (attackOutput.damageRoll && finalDamageFormula) {
      const resultingDamageFormula = attackOutput.attackResult.isCriticalHit
        ? doubleDiceInFormula(finalDamageFormula)
        : finalDamageFormula;

      const damageRoll = attackOutput.damageRoll;

      // Сохраняем видимость броска (она будет сброшена в performRoll до того,
      // как сработает отложенная отправка урона).
      const wasPrivate = chatStore.isPrivateRoll;
      const wasGmOnly = chatStore.isGmOnlyRoll;

      void waitForAttackDisplay().then(() => {
        const prevPrivate = chatStore.isPrivateRoll;
        const prevGmOnly = chatStore.isGmOnlyRoll;

        chatStore.isPrivateRoll = wasPrivate;
        chatStore.isGmOnlyRoll = wasGmOnly;

        chatStore.sendMessage(resultingDamageFormula, 'roll', damageRoll);

        chatStore.isPrivateRoll = prevPrivate;
        chatStore.isGmOnlyRoll = prevGmOnly;
      });
    }

    return attackOutput.damageRoll?.total ?? 0;
  }

  /**
   * Ждёт, пока бросок атаки будет показан игроку, прежде чем кидать урон.
   * При включённых 3D-кубиках — до конца анимации, иначе — фиксированную паузу.
   */
  function waitForAttackDisplay(): Promise<void> {
    if (diceRollerStore.enable3dDice && diceRollerStore.isDiceBoxReady) {
      return diceRollerStore.waitForNextAnimation();
    }

    return promiseTimeout(ATTACK_RESULT_DELAY_MS);
  }

  /**
   * Обычный бросок (лечение или без цели)
   */
  function performSimpleRoll(): number {
    let formula: string;

    if (props.formula) {
      // Суммируем введённый бонус пользователя + условный бонус на урон (если это бросок урона)
      // Если это просто "бросок формулы" не связанный с атакой (проверка хар-ки с кастомной формулой),
      // damageBonus будет 0 (т.к. targetKey будет attack.melee, а условия не выполнятся).
      const finalBonus =
        bonusValue.value + currentConditionalBonuses.value.damageBonus;

      if (finalBonus !== 0) {
        const sign = finalBonus >= 0 ? '+' : '-';

        formula = `${effectiveFormula.value ?? ''}${sign}${Math.abs(finalBonus)}`;
      } else {
        formula = effectiveFormula.value ?? '';
      }
    } else {
      const totalModifier =
        props.modifier
        + bonusValue.value
        + currentConditionalBonuses.value.attackBonus;

      formula = buildAttackFormula(totalModifier, attackRollMode.value);
    }

    const rollData = diceRollerStore.parseAndRoll(formula);

    if (!props.isHealing && resolvedDamageType.value) {
      rollData.damageType = resolvedDamageType.value;
    }

    let rollLabel = props.rollLabel;

    if (!props.isHealing && resolvedDamageType.value) {
      const typeLabel = getShortDamageTypeLabel(resolvedDamageType.value);

      if (typeLabel) {
        rollLabel += ` (${typeLabel})`;
      }
    }

    // Автоприменение урона/лечения к цели (если не делегировано наружу)
    if (
      effectiveFormula.value
      && targetStore.targetActorId
      && !props.skipDamageApplication
    ) {
      const result = targetStore.applyToTarget(
        rollData.total,
        props.isHealing,
        resolvedDamageType.value,
      );

      if (result && !props.isHealing) {
        const tempAbsorbed = result.tempAbsorbed ?? 0;

        const totalDamage = result.hpBefore - result.hpAfter + tempAbsorbed;

        rollLabel += ` → Урон: ${result.actorName} -${totalDamage} HP`;

        if (tempAbsorbed > 0) {
          rollLabel += ` (врем. -${tempAbsorbed})`;
        }

        rollLabel += formatDamageDefenseSuffix(result.defenseOutcome);
      }
    }

    if (props.autoFail) {
      rollLabel += ' ✗ Провал (Автоматический)';
    } else if (props.targetDc !== undefined) {
      if (rollData.total >= props.targetDc) {
        rollLabel += ' ✓ Успех';
      } else {
        rollLabel += ' ✗ Провал';
      }
    }

    rollData.label = rollLabel;

    if (!props.skipChatMessage) {
      chatStore.sendMessage(formula, 'roll', rollData);
    }

    return rollData.total;
  }

  /**
   * Катает части ПО ОЧЕРЕДИ (каждая — отдельная 3D-анимация фоном), собирает
   * разбивку и отдаёт её в `onRollParts`. Сам урон в чат не пишет — итоговое
   * сообщение формирует оркестратор (одно сообщение со всеми частями).
   *
   * @param parts - части урона/лечения
   * @param isCrit - крит (удваивает кубики урон-частей)
   */
  async function rollPartsSequentially(
    parts: SpellDamagePartInput[],
    isCrit: boolean,
  ): Promise<void> {
    const rolled: RolledSpellDamagePart[] = [];

    const use3d =
      diceRollerStore.enable3dDice && diceRollerStore.isDiceBoxReady;

    for (const part of parts) {
      let formula = part.formula;

      // Усиление высших кругов (ячейка) — к частям, помеченным applySlotScaling
      // (первая урон-часть; у per-target гейт-веток помечена каждая ветка,
      // к цели применяется только одна — двойного усиления нет).
      if (
        part.applySlotScaling
        && hasSpellCast.value
        && props.spellScalingDice
        && props.spellLevel !== undefined
        && selectedSpellLevel.value > props.spellLevel
      ) {
        formula = scaleDamageFormula(
          formula,
          props.spellScalingDice,
          props.spellLevel,
          selectedSpellLevel.value,
        );
      }

      // Крит удваивает кубики (кроме лечащих частей)
      if (isCrit && !part.isHealing) {
        formula = doubleDiceInFormula(formula);
      }

      const rollData = diceRollerStore.parseAndRoll(formula);

      // Анимируем эту часть и ждём её завершения — следующая полетит после
      if (use3d) {
        diceRollerStore.animateRoll({
          formula,
          total: rollData.total,
          dice: rollData.dice,
          details: '',
          label: props.rollLabel,
        });

        await diceRollerStore.waitForNextAnimation();
      }

      rolled.push({
        amount: rollData.total,
        formula,
        values: rollData.dice.flatMap((group) => group.values),
        type: part.type,
        types: part.types,
        isHealing: part.isHealing,
        healTemp: part.healTemp,
        target: part.target,
        requiresDamage: part.requiresDamage,
        targetGate: part.targetGate,
      });
    }

    if (props.onRollParts) {
      props.onRollParts(rolled);
    }
  }

  /**
   * Многочастный бросок без атаки (спасбросок / автопопадание / лечение):
   * части катаются по очереди, применение — через `onRollParts`.
   *
   * @param parts - части урона/лечения (включая бонус-части эффектов)
   */
  function performPartsRoll(parts: SpellDamagePartInput[]): void {
    void rollPartsSequentially(parts, false);
  }

  /**
   * Многочастная атака (заклинание или оружие): бросок попадания → на попадании
   * части катаются ПО ОЧЕРЕДИ (фоном, с удвоением кубиков на крите). На промахе —
   * урона нет. Итоговое сообщение со всеми частями формирует оркестратор.
   *
   * @param targetAc - класс доспеха цели
   * @param parts - части урона/лечения (включая бонус-части эффектов)
   */
  function performPartsAttackRoll(
    targetAc: number,
    parts: SpellDamagePartInput[],
  ): void {
    const attackMod =
      (props.attackModifier ?? 0)
      + bonusValue.value
      + currentConditionalBonuses.value.attackBonus;

    const attackFormula = buildAttackFormula(attackMod, attackRollMode.value);
    const targetName = targetStore.targetName ?? 'Цель';

    // Только бросок попадания (без урона) — получаем hit/crit
    const attackOutput = performTwoStageAttack(
      {
        attackFormula,
        attackModifier: attackMod,
        targetAc,
        weaponName: props.rollLabel,
        targetName,
        targetActorId: targetStore.targetActorId,
        targetFlags: targetStore.getTargetFlags(),
      },
      (formula) => diceRollerStore.parseAndRoll(formula),
    );

    chatStore.sendMessage(attackFormula, 'roll', attackOutput.attackRoll);

    if (attackOutput.attackResult.isHit && props.onHit) {
      props.onHit();
    }

    // На промахе урона нет
    if (!attackOutput.attackResult.isHit) {
      return;
    }

    const isCrit = attackOutput.attackResult.isCriticalHit;

    // Сначала показываем бросок атаки, затем по очереди — части урона
    void waitForAttackDisplay().then(() =>
      rollPartsSequentially(parts, isCrit),
    );
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="380"
    :min-height="280"
    :title="title"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Индикатор автопровала -->
        <UAlert
          v-if="autoFail"
          color="red"
          variant="soft"
          icon="tabler:skull"
          title="Автоматический провал"
          description="Из-за наложенных состояний (например, Парализованный) этот спасбросок будет автоматически провален."
        />

        <!-- Секция каста заклинания -->
        <div
          v-if="hasSpellCast"
          class="space-y-2"
        >
          <span class="text-xs tracking-wider text-muted uppercase"
            >Круг заклинания</span
          >

          <USelect
            v-model.number="selectedSpellLevel"
            :items="spellLevelItems"
            value-key="value"
            class="w-full"
            @change="usePactSlot = false"
          />

          <UCheckbox
            v-model="consumeSpellSlot"
            label="Тратить ячейку заклинаний"
          />

          <UCheckbox
            v-if="canUsePactSlot && consumeSpellSlot"
            v-model="usePactSlot"
            label="Использовать ячейку Пакта (Warlock)"
          />

          <div
            v-if="
              spellScalingDice
              && spellLevel !== undefined
              && selectedSpellLevel > spellLevel
            "
            class="rounded border border-gold/20 bg-gold/10 p-2 text-xs text-gold"
          >
            <strong>Усиление:</strong> +{{ spellScalingDice }} за каждый
            дополнительный круг
          </div>
        </div>

        <!-- Выбор типа урона (для заклинаний с damageType: 'choice') -->
        <div
          v-if="isDamageTypeChoice && damageTypeOptions.length > 0"
          class="space-y-2"
        >
          <span class="text-xs tracking-wider text-muted uppercase"
            >Тип урона</span
          >

          <USelect
            v-model="selectedChoiceDamageType"
            :items="damageTypeOptions"
            value-key="value"
            class="w-full"
          />
        </div>

        <!-- Формула (скрыта при skipRoll — самобафф без броска) -->
        <div
          v-if="!skipRoll"
          class="rounded-lg bg-elevated/50 p-3 text-center"
        >
          <span class="text-xs tracking-wider text-muted uppercase"
            >Формула</span
          >

          <div class="mt-1 font-mono text-lg font-bold text-white">
            {{ displayFormula }}
            <span
              v-if="bonusValue !== 0"
              class="text-gold"
            >
              {{
                bonusValue >= 0
                  ? `+ ${bonusValue}`
                  : `− ${Math.abs(bonusValue)}`
              }}
            </span>
          </div>
        </div>

        <!-- Бонус (скрыт при skipRoll — самобафф без броска) -->
        <div
          v-if="!skipRoll"
          class="space-y-2"
        >
          <span class="text-sm text-toned">Доп. бонус</span>

          <UInput
            :model-value="bonusValue"
            type="number"
            size="sm"
            class="w-full"
            placeholder="0"
            @update:model-value="bonusValue = Number($event)"
          />
        </div>

        <!-- Режим броска (атаки с целью, серия атак снарядов, стандартные d20
             проверки); при skipRoll броска нет — секцию скрываем -->
        <div
          v-if="showRollModeSection"
          class="space-y-2"
        >
          <span class="text-xs tracking-wider text-muted uppercase"
            >Режим броска</span
          >

          <div class="grid grid-cols-3 gap-2">
            <UButton
              variant="soft"
              :color="attackRollMode === 'normal' ? 'primary' : 'neutral'"
              size="sm"
              block
              @click.left.exact.prevent="attackRollMode = 'normal'"
            >
              Обычный
            </UButton>

            <UButton
              variant="soft"
              :color="attackRollMode === 'advantage' ? 'success' : 'neutral'"
              size="sm"
              block
              @click.left.exact.prevent="attackRollMode = 'advantage'"
            >
              <UIcon
                name="tabler:arrow-big-up-filled"
                class="mr-1 h-4 w-4"
              />
              Преим.
            </UButton>

            <UButton
              variant="soft"
              :color="attackRollMode === 'disadvantage' ? 'error' : 'neutral'"
              size="sm"
              block
              @click.left.exact.prevent="attackRollMode = 'disadvantage'"
            >
              <UIcon
                name="tabler:arrow-big-down-filled"
                class="mr-1 h-4 w-4"
              />
              Помеха
            </UButton>
          </div>
        </div>

        <!-- Разделитель -->
        <div
          v-if="!skipRoll"
          class="border-t border-muted"
        />

        <!-- Кто увидит (нет броска при skipRoll — секция не нужна) -->
        <div
          v-if="!skipRoll"
          class="space-y-2"
        >
          <span class="text-xs tracking-wider text-muted uppercase"
            >Кто увидит</span
          >

          <div class="grid grid-cols-3 gap-2">
            <UButton
              variant="soft"
              :color="rollType === 'public' ? 'primary' : 'neutral'"
              size="sm"
              block
              @click.left.exact.prevent="rollType = 'public'"
            >
              <UIcon
                name="tabler:users"
                class="mr-1 h-4 w-4"
              />
              Все
            </UButton>

            <UButton
              variant="soft"
              :color="rollType === 'gm' ? 'primary' : 'neutral'"
              size="sm"
              block
              @click.left.exact.prevent="rollType = 'gm'"
            >
              <UIcon
                name="tabler:shield"
                class="mr-1 h-4 w-4"
              />
              ГМ
            </UButton>

            <UButton
              variant="soft"
              :color="rollType === 'private' ? 'warning' : 'neutral'"
              size="sm"
              block
              @click.left.exact.prevent="rollType = 'private'"
            >
              <UIcon
                name="tabler:eye-off"
                class="mr-1 h-4 w-4"
              />
              Скрытый
            </UButton>
          </div>
        </div>

        <!-- Кнопка броска -->
        <UButton
          color="primary"
          size="lg"
          block
          @click.left.exact.prevent="performRoll"
        >
          <UIcon
            name="tabler:dice-filled"
            class="mr-2 h-5 w-5"
          />
          {{ effectiveRollButtonText }}
        </UButton>
      </div>
    </template>
  </UDraggableModal>
</template>
