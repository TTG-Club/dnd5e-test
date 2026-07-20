import type { AbilityType, Feature } from '@vtt/shared';
import type {
  Actor,
  ActorBackgroundEntry,
  BackgroundDefinition,
  DnDActorSystem,
  EffectTargetKey,
  ResolvedGrantedSpell,
} from '@vtt/shared/system/dnd.js';
import type { Ref } from 'vue';

import {
  generateId,
  pushUnique,
  removeItems,
  typedObjectEntries,
} from '@vtt/shared';
import {
  appendGrantedSpells,
  BACKGROUND_ORIGIN_PREFIX,
  buildFeatGrantEffect,
  prepareTransferredFeatEffects,
  removeGrantedSpellsByFeatureNames,
} from '@vtt/shared/system/dnd.js';
import { computed, ref, watch } from 'vue';

export type BackgroundWizardStep =
  | 'overview'
  | 'tools'
  | 'abilities'
  | 'equipment';

/**
 * Имя-источник заклинаний, выданных СОБСТВЕННЫМ `featData` предыстории —
 * отличное от имени черты-происхождения, чтобы откат снимал их раздельно. Тот же
 * формат используется при резолве источников в `BackgroundSetupWizard`.
 *
 * @param backgroundName - название предыстории
 */
export function backgroundSpellSource(backgroundName: string): string {
  return `Предыстория: ${backgroundName}`;
}

/**
 * Поднимает тёмное зрение токена до `darkvision` (не понижает — у тёмного зрения
 * может быть другой источник). Возвращает обновлённый токен или `undefined`,
 * если поднимать нечего. По образцу `featApply.applyFeatDarkvision`.
 *
 * @param token - текущие настройки токена
 * @param darkvision - тёмное зрение предыстории (футы)
 */
function applyBackgroundDarkvision(
  token: Actor['token'],
  darkvision: number,
): Actor['token'] | undefined {
  if (darkvision <= 0) {
    return undefined;
  }

  const next: NonNullable<Actor['token']> = JSON.parse(
    JSON.stringify(token ?? {}),
  );

  if (!next.vision) {
    next.vision = { enabled: true, range: 60, darkvision: 0, angle: 360 };
  }

  if (darkvision <= next.vision.darkvision) {
    return undefined;
  }

  next.vision.darkvision = darkvision;

  return next;
}

export function useBackgroundWizard(
  backgroundDefinitionRef: Ref<BackgroundDefinition | null>,
  actorRef: Ref<Actor>,
  isOpenRef: Ref<boolean>,
) {
  // --- Состояние ---
  const currentStepInfo = ref<{
    stepGroup: BackgroundWizardStep;
    index: number;
    total: number;
  }>({
    stepGroup: 'overview',
    index: 1,
    total: 3,
  });

  const selectedScheme = ref<'+2/+1' | '+1/+1/+1'>('+2/+1');
  const abilityAllocation = ref<Partial<Record<AbilityType, number>>>({});
  const toolSelections = ref<string[]>([]);
  const selectedFeatId = ref<string>('');

  const wizardSteps = computed<BackgroundWizardStep[]>(() => {
    const def = backgroundDefinitionRef.value;

    if (!def) {
      return ['overview', 'abilities', 'equipment'];
    }

    const steps: BackgroundWizardStep[] = ['overview'];

    if (def.toolGrant.choices && def.toolGrant.choices.count > 0) {
      steps.push('tools');
    }

    steps.push('abilities', 'equipment');

    return steps;
  });

  function resetState() {
    selectedScheme.value = '+2/+1';
    abilityAllocation.value = {};
    toolSelections.value = [];
    selectedFeatId.value = '';

    const def = backgroundDefinitionRef.value;

    if (def) {
      if (def.toolGrant.items.length) {
        toolSelections.value = [...def.toolGrant.items];
      }

      if (def.featGrant.featId) {
        selectedFeatId.value = def.featGrant.featId;
      } else if (def.featGrant.featChoices?.length) {
        selectedFeatId.value = def.featGrant.featChoices[0];
      }
    }

    currentStepInfo.value = {
      stepGroup: wizardSteps.value[0],
      index: 1,
      total: wizardSteps.value.length,
    };
  }

  // Инициализация при смене предыстории
  watch(
    () => backgroundDefinitionRef.value?.key,
    () => {
      resetState();
    },
    { immediate: true },
  );

  // Сброс при закрытии окна
  watch(
    () => isOpenRef.value,
    (isOpen) => {
      if (!isOpen) {
        resetState();
      }
    },
  );

  // Вычисляемое свойство: можно ли перейти дальше
  const canProceed = computed(() => {
    const def = backgroundDefinitionRef.value;

    if (!def) {
      return false;
    }

    if (currentStepInfo.value.stepGroup === 'overview') {
      if (def.featGrant.featChoices?.length && !selectedFeatId.value) {
        return false;
      }
    }

    if (currentStepInfo.value.stepGroup === 'tools') {
      const neededCounts = def.toolGrant.choices?.count ?? 0;
      const fixedCount = def.toolGrant.items.length;

      if (toolSelections.value.length - fixedCount !== neededCounts) {
        return false;
      }
    }

    if (currentStepInfo.value.stepGroup === 'abilities') {
      const values = Object.values(abilityAllocation.value);

      const totalAllocated = values.reduce(
        (sum, val) => (sum ?? 0) + (val ?? 0),
        0,
      );

      // Для обеих схем в сумме должно быть 3 очка (2+1=3, 1+1+1=3)
      if (totalAllocated !== 3) {
        return false;
      }

      // Проверка структуры: для 2/1 должно быть ровно 2 стата (один 2, другой 1)
      if (selectedScheme.value === '+2/+1') {
        const hasTwo = values.includes(2);
        const hasOne = values.includes(1);

        return hasTwo && hasOne && values.length === 2;
      }

      // Для 1/1/1 должно быть ровно 3 стата по 1
      if (selectedScheme.value === '+1/+1/+1') {
        return values.length === 3 && values.every((value) => value === 1);
      }
    }

    return true;
  });

  // Навигация
  function nextStep() {
    if (!canProceed.value) {
      return;
    }

    const steps = wizardSteps.value;
    const currentIndex = steps.indexOf(currentStepInfo.value.stepGroup);

    if (currentIndex < steps.length - 1) {
      const nextGroup = steps[currentIndex + 1];

      currentStepInfo.value = {
        stepGroup: nextGroup,
        index: currentIndex + 2,
        total: steps.length,
      };
    }
  }

  function previousStep() {
    const steps = wizardSteps.value;
    const currentIndex = steps.indexOf(currentStepInfo.value.stepGroup);

    if (currentIndex > 0) {
      const prevGroup = steps[currentIndex - 1];

      currentStepInfo.value = {
        stepGroup: prevGroup,
        index: currentIndex,
        total: steps.length,
      };
    }
  }

  /**
   * Применяет выбранные данные и формирует updates для актора.
   * Если у актора уже есть предыстория — откатывает все её бонусы
   * (характеристики, навыки, инструменты, черту, granted-заклинания черты)
   * перед применением новой.
   *
   * @param srdFeats Полный список черт из SRD feats.json
   * @param resolvedGrantedSpells granted-заклинания выбранной черты,
   * сопоставленные с данными компендиума
   */
  function buildUpdates(
    srdFeats: Feature[],
    resolvedGrantedSpells: ResolvedGrantedSpell[] = [],
  ) {
    const def = backgroundDefinitionRef.value;

    if (!def) {
      return { systemUpdates: {}, rootUpdates: {} };
    }

    const system: DnDActorSystem = actorRef.value.system;

    const previousBackground = system.background;

    // --- Откат предыдущей предыстории ---
    const baseSkills = { ...(system.proficiencies?.skills || {}) };
    const baseTools = [...((system.proficiencies?.tools || []) as string[])];
    const baseSavingThrows = [...(system.proficiencies?.savingThrows ?? [])];
    const baseArmor = [...(system.proficiencies?.armor ?? [])];
    const baseWeapons = [...(system.proficiencies?.weapons ?? [])];
    const baseLanguages = [...(system.proficiencies?.languages ?? [])];

    let baseFeatures = [...(actorRef.value.features || [])];

    // Убираем старые эффекты предыстории (по префиксу провенанса background:) —
    // это и бонус характеристик, и синтетический эффект даров, и перенесённые.
    const baseEffects = [...(actorRef.value.activeEffects ?? [])].filter(
      (effect) => !effect.originId?.startsWith(BACKGROUND_ORIGIN_PREFIX),
    );

    if (previousBackground) {
      // Откат навыков: канонические + расширенные (из featData)
      for (const skill of previousBackground.skillChoices ?? []) {
        Reflect.deleteProperty(baseSkills, skill);
      }

      for (const skill of previousBackground.extraSkillProficiencies ?? []) {
        Reflect.deleteProperty(baseSkills, skill);
      }

      // Откат инструментов: канонические + расширенные
      removeItems(baseTools, previousBackground.toolChoices);
      removeItems(baseTools, previousBackground.extraToolProficiencies ?? []);

      // Откат расширенных владений (из featData)
      removeItems(
        baseSavingThrows,
        previousBackground.savingThrowProficiencies ?? [],
      );

      removeItems(baseArmor, previousBackground.armorProficiencies ?? []);
      removeItems(baseWeapons, previousBackground.weaponProficiencies ?? []);
      removeItems(baseLanguages, previousBackground.languages ?? []);

      // Откат черты
      if (previousBackground.grantedFeatId) {
        baseFeatures = baseFeatures.filter(
          (feat) => feat.id !== previousBackground.grantedFeatId,
        );
      }
    }

    // --- Применение новой предыстории ---

    // 1. Добавляем навыки
    for (const skill of def.skillGrant.skills) {
      if (!baseSkills[skill]) {
        baseSkills[skill] = 'proficient';
      }
    }

    // 2. Добавляем инструменты
    for (const tool of toolSelections.value) {
      if (!baseTools.includes(tool)) {
        baseTools.push(tool);
      }
    }

    // 3. Добавляем черту
    const grantedFeatId = generateId('feat');

    const srdFeat = srdFeats.find((feat) => feat.id === selectedFeatId.value);

    let grantedFeatName = def.featGrant.featName;

    if (srdFeat) {
      grantedFeatName = srdFeat.name;

      baseFeatures.push({
        ...srdFeat,
        id: grantedFeatId,
        featureType: 'feat',
      });
    } else {
      const fallbackFeat: Partial<Feature> = {
        id: grantedFeatId,
        name: def.featGrant.featName,
        nameEn: def.featGrant.featNameEn || '',
        description: '', // Больше не храним fallback описание
        featureType: 'feat',
        isSRD: !!def.isSRD,
      };

      baseFeatures.push(fallbackFeat as Feature);
    }

    // 4. Создаём Active Effect для бонусов характеристик от предыстории
    const abilityChanges: import('@vtt/shared/system/dnd.js').EffectChange[] =
      [];

    for (const [abilityKey, bonus] of typedObjectEntries<AbilityType, number>(
      abilityAllocation.value,
    )) {
      if (bonus && bonus > 0) {
        abilityChanges.push({
          key: `ability.${abilityKey}` as EffectTargetKey,
          mode: 'add',
          value: String(bonus),
          priority: 10,
        });
      }
    }

    if (abilityChanges.length > 0) {
      baseEffects.push({
        id: generateId('eff'),
        name: `Предыстория: ${def.name}`,
        description: `Бонусы характеристик от предыстории «${def.name}»`,
        icon: 'tabler:book',
        disabled: false,
        origin: 'feature',
        originId: `background:${def.key}`,
        transfer: false,
        duration: { type: 'permanent' },
        changes: abilityChanges,
        flags: [],
      });
    }

    // 4.5. Применяем СОБСТВЕННЫЕ расширенные дары предыстории (featData):
    // владения, защиты/иммунитеты, тёмное зрение, авторские эффекты — по образцу
    // черты, но с провенансом background:<key> (характеристики и навыки идут
    // каноническими полями, поэтому featData ASI/навыков у фона пуст).
    const featData = def.featData ?? null;

    const extraSkills = featData?.skillProficiencies ?? [];
    const extraSaves = featData?.savingThrowProficiencies ?? [];
    const extraArmor = featData?.armorProficiencies ?? [];
    const extraWeapons = featData?.weaponProficiencies ?? [];
    const extraTools = featData?.toolProficiencies ?? [];
    const extraLanguages = featData?.languages ?? [];

    for (const skill of extraSkills) {
      baseSkills[skill] = 'proficient';
    }

    pushUnique(baseSavingThrows, extraSaves);
    pushUnique(baseArmor, extraArmor);
    pushUnique(baseWeapons, extraWeapons);
    pushUnique(baseTools, extraTools);
    pushUnique(baseLanguages, extraLanguages);

    const grantEffect = buildFeatGrantEffect(def.key, def.name, featData, {
      originPrefix: BACKGROUND_ORIGIN_PREFIX,
      namePrefix: 'Предыстория',
      noun: 'предыстории',
      icon: 'tabler:book',
    });

    if (grantEffect) {
      baseEffects.push(grantEffect);
    }

    baseEffects.push(
      ...prepareTransferredFeatEffects(
        def.key,
        def.activeEffects,
        BACKGROUND_ORIGIN_PREFIX,
      ),
    );

    const updatedToken = applyBackgroundDarkvision(
      actorRef.value.token,
      featData?.darkvision ?? 0,
    );

    const ownGrantedSpellSource =
      featData?.grantedSpells && featData.grantedSpells.length > 0
        ? backgroundSpellSource(def.name)
        : undefined;

    // 5. Формируем запись предыстории (с применёнными расширенными дарами —
    // для точного отката при замене/удалении).
    const entry: ActorBackgroundEntry = {
      backgroundKey: def.key,
      backgroundName: def.name,
      abilityChoices: { ...abilityAllocation.value },
      skillChoices: [...def.skillGrant.skills],
      toolChoices: [...toolSelections.value],
      grantedFeatId,
      grantedFeatName,
    };

    if (extraSkills.length > 0) {
      entry.extraSkillProficiencies = [...extraSkills];
    }

    if (extraSaves.length > 0) {
      entry.savingThrowProficiencies = [...extraSaves];
    }

    if (extraArmor.length > 0) {
      entry.armorProficiencies = [...extraArmor];
    }

    if (extraWeapons.length > 0) {
      entry.weaponProficiencies = [...extraWeapons];
    }

    if (extraTools.length > 0) {
      entry.extraToolProficiencies = [...extraTools];
    }

    if (extraLanguages.length > 0) {
      entry.languages = [...extraLanguages];
    }

    if (ownGrantedSpellSource) {
      entry.ownGrantedSpellSource = ownGrantedSpellSource;
    }

    if (updatedToken && featData?.darkvision) {
      entry.darkvisionApplied = featData.darkvision;
    }

    // 6. Granted-заклинания: откатываем заклинания предыдущей предыстории
    // (и черты-происхождения, и собственного featData) и добавляем новые.
    const originalSpells = actorRef.value.spells ?? [];

    let updatedSpells = [...originalSpells];

    const previousSpellSources: string[] = [];

    if (previousBackground?.grantedFeatName) {
      previousSpellSources.push(previousBackground.grantedFeatName);
    }

    if (previousBackground?.ownGrantedSpellSource) {
      previousSpellSources.push(previousBackground.ownGrantedSpellSource);
    }

    if (previousSpellSources.length > 0) {
      updatedSpells = removeGrantedSpellsByFeatureNames(
        updatedSpells,
        previousSpellSources,
      );
    }

    updatedSpells = appendGrantedSpells(updatedSpells, resolvedGrantedSpells);

    // Сравнение по длине недостаточно: удаление и добавление могут совпасть
    // по количеству, поэтому дополнительно сверяем ссылки поэлементно
    const spellsChanged =
      updatedSpells.length !== originalSpells.length
      || updatedSpells.some((spell, index) => spell !== originalSpells[index]);

    // 7. Формируем финальный объект updates
    const systemUpdates: Partial<Actor['system']> = {
      background: entry,
      proficiencies: {
        ...system.proficiencies,
        skills: baseSkills,
        tools: baseTools,
        savingThrows: baseSavingThrows,
        armor: baseArmor,
        weapons: baseWeapons,
        languages: baseLanguages,
      },
    };

    const rootUpdates: Partial<Actor> = {
      features: baseFeatures,
      activeEffects: baseEffects,
    };

    if (spellsChanged) {
      rootUpdates.spells = updatedSpells;
    }

    if (updatedToken) {
      rootUpdates.token = updatedToken;
    }

    return {
      systemUpdates,
      rootUpdates,
    };
  }

  return {
    currentStepInfo,
    selectedScheme,
    abilityAllocation,
    toolSelections,
    selectedFeatId,
    wizardSteps,
    canProceed,
    nextStep,
    previousStep,
    buildUpdates,
  };
}
