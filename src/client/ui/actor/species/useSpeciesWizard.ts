import type { DefensibleDamageType } from '@vtt/shared';
import type {
  ActiveEffect,
  Actor,
  ActorSpeciesEntry,
  ConditionKey,
  CreatureSize,
  DamageDefenseEntry,
  DamageDefenseKind,
  EffectFlagKey,
  GrantedSpellSource,
  ResolvedGrantedSpell,
  SpeciesDefinition,
  SpeciesFeature,
} from '@vtt/shared/system/dnd.js';

import {
  appendGrantedSpells,
  collectSpeciesGrantedSpellSources,
  computeSpeciesDarkvision,
  computeSpeciesMovement,
  CONDITIONS,
  EFFECT_FLAG_LABELS,
  getTotalLevel,
  isSkillType,
  removeGrantedSpellsByFeatureNames,
  SPECIES_SIZE_SCALE_MAP,
} from '@vtt/shared/system/dnd.js';
import { computed, ref, watch } from 'vue';

export interface SpeciesWizardState {
  selectedSize: CreatureSize | null;
  grantSelections: Record<number, string[]>;
  featureChoices: Record<string, string>;
}

/**
 * Префиксы стабильного id активного эффекта-защит, выданного видом. По ним
 * эффект прежнего вида снимается при смене/удалении вида, не задевая эффекты
 * из других источников (предметы/заклинания/состояния). Старый префикс
 * (только-сопротивление) тоже снимаем — для миров, где он успел примениться.
 */
const SPECIES_DEFENSE_EFFECT_PREFIX = 'species-defenses:';
const SPECIES_LEGACY_RESISTANCE_EFFECT_PREFIX = 'species-resistance:';

/** Принадлежит ли эффект защитам, выданным видом (текущий или старый префикс). */
function isSpeciesDefenseEffect(effect: ActiveEffect): boolean {
  return (
    effect.id.startsWith(SPECIES_DEFENSE_EFFECT_PREFIX)
    || effect.id.startsWith(SPECIES_LEGACY_RESISTANCE_EFFECT_PREFIX)
  );
}

/**
 * Собирает флаги защит от урона (`resistance.*`/`immunity.*`/`vulnerability.*`)
 * из гранта `damageDefense` основного вида И из защит выбранных подвидов
 * (`SpeciesFeatureChoice.damageDefenses` — как наследие драконорождённых).
 * Дедуп по типу урона: для типа берётся последний заданный вид защиты (один тип
 * = один вид), причём подвид может переопределить защиту основного вида.
 *
 * @param definition - определение вида
 * @param chosenSubspecies - выбранные ключи вариантов-подвидов
 */
function collectDamageDefenseFlags(
  definition: SpeciesDefinition,
  chosenSubspecies: ReadonlyArray<string>,
): EffectFlagKey[] {
  const kindByType = new Map<DefensibleDamageType, DamageDefenseKind>();

  const addEntries = (entries: DamageDefenseEntry[] | undefined): void => {
    for (const entry of entries ?? []) {
      kindByType.set(entry.damageType, entry.kind);
    }
  };

  for (const grant of definition.grants) {
    if (grant.type === 'damageDefense') {
      addEntries(grant.entries);
    }
  }

  for (const feature of definition.features) {
    for (const choice of feature.choices ?? []) {
      if (chosenSubspecies.includes(choice.key)) {
        addEntries(choice.damageDefenses);
      }
    }
  }

  const flags: EffectFlagKey[] = [];

  for (const [damageType, kind] of kindByType) {
    flags.push(`${kind}.${damageType}`);
  }

  return flags;
}

/**
 * Собирает ключи состояний, к которым вид даёт иммунитет: грант
 * `conditionImmunity` основного вида плюс иммунитеты выбранных подвидов
 * (`SpeciesFeatureChoice.conditionImmunities`). Дедуп по ключу состояния.
 *
 * @param definition - определение вида
 * @param chosenSubspecies - выбранные ключи вариантов-подвидов
 */
function collectSpeciesConditionImmunities(
  definition: SpeciesDefinition,
  chosenSubspecies: ReadonlyArray<string>,
): ConditionKey[] {
  const conditions = new Set<ConditionKey>();

  for (const grant of definition.grants) {
    if (grant.type === 'conditionImmunity') {
      for (const conditionKey of grant.conditions) {
        conditions.add(conditionKey);
      }
    }
  }

  for (const feature of definition.features) {
    for (const choice of feature.choices ?? []) {
      if (chosenSubspecies.includes(choice.key)) {
        for (const conditionKey of choice.conditionImmunities ?? []) {
          conditions.add(conditionKey);
        }
      }
    }
  }

  return [...conditions];
}

/**
 * Строит пассивный активный эффект защит вида: флаги защит от урона
 * (`resistance/immunity/vulnerability.*`) и/или иммунитеты к состояниям.
 *
 * @param definition - определение вида (для имени и id-провенанса)
 * @param flags - флаги защит от урона
 * @param conditionImmunities - иммунитеты к состояниям
 */
function buildSpeciesDefenseEffect(
  definition: SpeciesDefinition,
  flags: EffectFlagKey[],
  conditionImmunities: ConditionKey[],
): ActiveEffect {
  const summaryParts: string[] = [];

  for (const flag of flags) {
    summaryParts.push(EFFECT_FLAG_LABELS[flag] ?? flag);
  }

  for (const conditionKey of conditionImmunities) {
    const label =
      CONDITIONS.find((condition) => condition.key === conditionKey)?.nameRu
      ?? conditionKey;

    summaryParts.push(`Иммунитет к состоянию: ${label}`);
  }

  const effect: ActiveEffect = {
    id: `${SPECIES_DEFENSE_EFFECT_PREFIX}${definition.key}`,
    name: `Защиты вида (${definition.name})`,
    description: `${summaryParts.join('; ')}.`,
    disabled: false,
    origin: 'feature',
    originId: definition.key,
    transfer: false,
    duration: { type: 'permanent' },
    changes: [],
    flags,
  };

  if (conditionImmunities.length > 0) {
    effect.conditionImmunities = conditionImmunities;
  }

  return effect;
}

/**
 * Удаляет все вхождения указанных элементов из массива (in-place).
 *
 * @param target - массив, из которого удаляются элементы
 * @param itemsToRemove - элементы для удаления
 */
function removeItems<T>(target: T[], itemsToRemove: T[]): void {
  for (const item of itemsToRemove) {
    const index = target.indexOf(item);

    if (index !== -1) {
      target.splice(index, 1);
    }
  }
}

export function useSpeciesWizard(
  actor: import('vue').Ref<Actor>,
  speciesDef: import('vue').Ref<SpeciesDefinition | null>,
) {
  const state = ref<SpeciesWizardState>({
    selectedSize: null,
    grantSelections: {},
    featureChoices: {},
  });

  // Инициализация при смене вида
  watch(
    () => speciesDef.value,
    (definition) => {
      if (!definition) {
        state.value = {
          selectedSize: null,
          grantSelections: {},
          featureChoices: {},
        };

        return;
      }

      // 1. Инициализация grantSelections массивами нужной длины или пустыми
      const grantSelections: Record<number, string[]> = {};

      definition.grants.forEach((grant, index) => {
        if ('count' in grant || ('choices' in grant && grant.choices?.count)) {
          grantSelections[index] = [];
        }
      });

      state.value = {
        selectedSize: definition.size.length === 1 ? definition.size[0] : null,
        grantSelections,
        featureChoices: {},
      };
    },
    { immediate: true },
  );

  const steps = computed(() => {
    if (!speciesDef.value) {
      return [];
    }

    const result = [{ key: 'overview', title: 'Обзор' }];

    // Есть ли гранты с выбором?
    const hasGrantChoices = speciesDef.value.grants.some((grant) => {
      if (grant.type === 'skillProficiency' && grant.count > 0) {
        return true;
      }

      if (grant.type === 'weaponProficiency' && grant.choices) {
        return true;
      }

      if (grant.type === 'armorProficiency' && grant.choices) {
        return true;
      }

      if (grant.type === 'toolProficiency' && grant.choices) {
        return true;
      }

      if (grant.type === 'language' && grant.choices) {
        return true;
      }

      return false;
    });

    if (hasGrantChoices) {
      result.push({ key: 'grants', title: 'Владения' });
    }

    const hasFeatures = speciesDef.value.features.some(
      (feature) =>
        !feature.isInformationalOnly
        || (feature.choices && feature.choices.length > 0),
    );

    if (hasFeatures || speciesDef.value.features.length > 0) {
      result.push({ key: 'features', title: 'Особенности' });
    }

    return result;
  });

  const currentStepIndex = ref(0);

  const currentStep = computed(() => {
    if (steps.value.length === 0) {
      return null;
    }

    return steps.value[currentStepIndex.value];
  });

  function nextStep() {
    if (currentStepIndex.value < steps.value.length - 1) {
      currentStepIndex.value++;
    }
  }

  function prevStep() {
    if (currentStepIndex.value > 0) {
      currentStepIndex.value--;
    }
  }

  const canProceed = computed(() => {
    if (!speciesDef.value || !currentStep.value) {
      return false;
    }

    const stepKey = currentStep.value.key;

    if (stepKey === 'overview') {
      return state.value.selectedSize !== null;
    }

    if (stepKey === 'grants') {
      return speciesDef.value.grants.every((grant, index) => {
        if (grant.type === 'skillProficiency' && grant.count > 0) {
          return state.value.grantSelections[index]?.length === grant.count;
        }

        if ('choices' in grant && grant.choices) {
          return (
            state.value.grantSelections[index]?.length === grant.choices.count
          );
        }

        return true;
      });
    }

    if (stepKey === 'features') {
      const featuresWithChoices = speciesDef.value.features.filter(
        (feature) => feature.choices && feature.choices.length > 0,
      );

      return featuresWithChoices.every(
        (feature) => !!state.value.featureChoices[feature.key],
      );
    }

    return true;
  });

  const isFinalStep = computed(() => {
    return currentStepIndex.value === steps.value.length - 1;
  });

  /**
   * Заклинания, автоматически предоставляемые особенностями вида
   * (поле `grantedSpells` особенности).
   */
  const grantedSpellSources = computed((): GrantedSpellSource[] => {
    if (!speciesDef.value) {
      return [];
    }

    return collectSpeciesGrantedSpellSources(speciesDef.value);
  });

  /**
   * Собирает обновления для применения нового вида.
   * Если у актора уже есть вид — откатывает все его бонусы
   * (владения, features, darkvision, granted-заклинания)
   * перед применением нового.
   *
   * @param previousSpeciesDef - определение предыдущего вида из SRD (для отката фиксированных грантов)
   * @param resolvedGrantedSpells - granted-заклинания особенностей вида,
   * сопоставленные с данными компендиума
   */
  function buildUpdates(
    previousSpeciesDef?: SpeciesDefinition | null,
    resolvedGrantedSpells: ResolvedGrantedSpell[] = [],
  ): {
    systemUpdates: Partial<Actor['system']>;
    rootUpdates: Partial<Actor>;
  } {
    if (!speciesDef.value || !state.value.selectedSize) {
      return { systemUpdates: {}, rootUpdates: {} };
    }

    const definition = speciesDef.value;
    const previousSpecies = actor.value.system.species;

    const grantChoices: Record<number, string[]> = {};

    Object.entries(state.value.grantSelections).forEach(([key, value]) => {
      grantChoices[Number(key)] = [...value];
    });

    const speciesEntry: ActorSpeciesEntry = {
      speciesKey: definition.key,
      speciesName: definition.name,
      creatureType: definition.creatureType,
      size: state.value.selectedSize,
      featureChoices: { ...state.value.featureChoices },
      grantChoices,
    };

    // --- Откат предыдущего вида ---
    const baseProficiencies: Actor['system']['proficiencies'] = JSON.parse(
      JSON.stringify(actor.value.system.proficiencies),
    );

    if (previousSpecies && previousSpeciesDef) {
      // Откат грантов предыдущего вида
      previousSpeciesDef.grants.forEach((grant, grantIndex) => {
        const previousUserChoices =
          previousSpecies.grantChoices[grantIndex] || [];

        if (grant.type === 'skillProficiency') {
          for (const choice of previousUserChoices) {
            if (isSkillType(choice)) {
              Reflect.deleteProperty(baseProficiencies.skills, choice);
            }
          }
        } else if (grant.type === 'weaponProficiency') {
          removeItems(baseProficiencies.weapons, grant.items ?? []);
          removeItems(baseProficiencies.weapons, previousUserChoices);
        } else if (grant.type === 'armorProficiency') {
          removeItems(baseProficiencies.armor, grant.items ?? []);
          removeItems(baseProficiencies.armor, previousUserChoices);
        } else if (grant.type === 'toolProficiency') {
          removeItems(baseProficiencies.tools, grant.items ?? []);
          removeItems(baseProficiencies.tools, previousUserChoices);
        } else if (grant.type === 'language') {
          removeItems(baseProficiencies.languages, grant.items ?? []);
          removeItems(baseProficiencies.languages, previousUserChoices);
        } else if (grant.type === 'savingThrowProficiency') {
          removeItems(baseProficiencies.savingThrows, grant.abilities);
        }
      });
    }

    // Уровне-зависимые дары: скорость и тёмное зрение считаются от текущего
    // суммарного уровня персонажа и выбранного подвида.
    const chosenSubspecies = Object.values(state.value.featureChoices);
    const totalLevel = getTotalLevel(actor.value.system.classes);

    const speciesMovement = computeSpeciesMovement(
      definition,
      totalLevel,
      chosenSubspecies,
    );

    const systemUpdates: Partial<Actor['system']> = {
      species: speciesEntry,
      size: state.value.selectedSize,
      movement: {
        ...speciesMovement,
        hover: false, // by default false
        units: 'ft',
      },
      proficiencies: baseProficiencies,
    };

    const tokenUpdates: Partial<Actor['token']> = JSON.parse(
      JSON.stringify(actor.value.token || {}),
    );

    if (!tokenUpdates!.vision) {
      tokenUpdates!.vision = {
        enabled: true,
        range: 60,
        darkvision: 0,
        angle: 360,
      };
    }

    // При СМЕНЕ вида сбрасываем прежнее тёмное зрение ТОЛЬКО если оно совпадает
    // с вкладом предыдущего вида — иначе затёрли бы тёмное зрение из других
    // источников (класс/предмет/ручная правка). Полного учёта источников нет
    // (нет провенанса) — это известное ограничение.
    if (previousSpecies) {
      const previousSpeciesDarkvision = previousSpeciesDef
        ? computeSpeciesDarkvision(
            previousSpeciesDef,
            totalLevel,
            Object.values(previousSpecies.featureChoices ?? {}),
          )
        : tokenUpdates!.vision!.darkvision;

      if (tokenUpdates!.vision!.darkvision === previousSpeciesDarkvision) {
        tokenUpdates!.vision!.darkvision = 0;
      }
    }

    // Итоговое тёмное зрение вида (база + активные на уровне особенности) —
    // максимум с уже имеющимся (не видовым) значением.
    const speciesDarkvision = computeSpeciesDarkvision(
      definition,
      totalLevel,
      chosenSubspecies,
    );

    if (speciesDarkvision > tokenUpdates!.vision!.darkvision) {
      tokenUpdates!.vision!.darkvision = speciesDarkvision;
    }

    tokenUpdates!.scale = SPECIES_SIZE_SCALE_MAP[state.value.selectedSize];

    // --- Применяем гранты нового вида ---
    definition.grants.forEach((grant, index) => {
      const userChoices = state.value.grantSelections[index] || [];

      if (grant.type === 'skillProficiency') {
        userChoices.forEach((choice) => {
          if (isSkillType(choice)) {
            systemUpdates.proficiencies!.skills[choice] = 'proficient';
          }
        });
      } else if (grant.type === 'weaponProficiency') {
        grant.items?.forEach((item) => {
          if (!systemUpdates.proficiencies!.weapons.includes(item)) {
            systemUpdates.proficiencies!.weapons.push(item);
          }
        });

        userChoices.forEach((choice) => {
          if (!systemUpdates.proficiencies!.weapons.includes(choice)) {
            systemUpdates.proficiencies!.weapons.push(choice);
          }
        });
      } else if (grant.type === 'armorProficiency') {
        grant.items?.forEach((item) => {
          if (!systemUpdates.proficiencies!.armor.includes(item)) {
            systemUpdates.proficiencies!.armor.push(item);
          }
        });

        userChoices.forEach((choice) => {
          if (!systemUpdates.proficiencies!.armor.includes(choice)) {
            systemUpdates.proficiencies!.armor.push(choice);
          }
        });
      } else if (grant.type === 'toolProficiency') {
        grant.items?.forEach((item) => {
          if (!systemUpdates.proficiencies!.tools.includes(item)) {
            systemUpdates.proficiencies!.tools.push(item);
          }
        });

        userChoices.forEach((choice) => {
          if (!systemUpdates.proficiencies!.tools.includes(choice)) {
            systemUpdates.proficiencies!.tools.push(choice);
          }
        });
      } else if (grant.type === 'language') {
        grant.items?.forEach((item) => {
          if (!systemUpdates.proficiencies!.languages.includes(item)) {
            systemUpdates.proficiencies!.languages.push(item);
          }
        });

        userChoices.forEach((choice) => {
          if (!systemUpdates.proficiencies!.languages.includes(choice)) {
            systemUpdates.proficiencies!.languages.push(choice);
          }
        });
      } else if (grant.type === 'savingThrowProficiency') {
        grant.abilities.forEach((ability) => {
          if (!systemUpdates.proficiencies!.savingThrows.includes(ability)) {
            systemUpdates.proficiencies!.savingThrows.push(ability);
          }
        });
      }
      // darkvision — применяется через computeSpeciesDarkvision (с учётом уровня).
      // resistance — пока без поддержки в proficiencies.
    });

    const rootUpdates: Partial<Actor> = {
      token: tokenUpdates,
    };

    // --- Удаляем старые видовые features и добавляем новые ---
    let newFeatures = [...(actor.value.features || [])];

    // Удаляем features от предыдущего вида
    if (previousSpecies) {
      newFeatures = newFeatures.filter(
        (feature) => feature.featureType !== 'species',
      );
    }

    /**
     * Добавляет видовую особенность в список актёра (без дублей по названию).
     * Уровень НЕ фильтруем: храним все, лист показывает по достижении уровня.
     *
     * @param featureName - итоговое название особенности
     * @param description - итоговое описание (Markdown)
     * @param level - уровень появления особенности
     */
    const pushSpeciesFeature = (
      featureName: string,
      description: string,
      level: number,
    ): void => {
      if (
        newFeatures.some(
          (existing) =>
            existing.grantedBy === definition.name
            && existing.name === featureName,
        )
      ) {
        return;
      }

      newFeatures.push({
        id: Math.random().toString(36).substring(2, 11),
        name: featureName,
        description,
        grantedBy: definition.name,
        featureType: 'species',
        level,
      });
    };

    const resolvedSpellIds = new Set(
      resolvedGrantedSpells.map((resolved) => resolved.spell.id),
    );

    /**
     * Дописывает в описание блок заклинаний особенности: связанные и найденные
     * (или просто именованные) — как выдаваемые; связанные, но не найденные в
     * компендиуме — как требующие ручного добавления.
     *
     * @param feature - особенность вида
     * @returns описание с приписанным блоком заклинаний (если есть)
     */
    const describeGrantedSpells = (feature: SpeciesFeature): string => {
      const refs = feature.grantedSpells ?? [];

      if (refs.length === 0) {
        return feature.description;
      }

      const granted: string[] = [];
      const missing: string[] = [];

      for (const spellRef of refs) {
        if (spellRef.spellId && !resolvedSpellIds.has(spellRef.spellId)) {
          missing.push(spellRef.name);
        } else {
          granted.push(spellRef.name);
        }
      }

      let description = feature.description;

      if (granted.length > 0) {
        description += `\n\n**Заклинания:** ${granted.join(', ')}`;
      }

      if (missing.length > 0) {
        description += `\n\n⚠ **Не найдены в компендиуме (добавьте вручную):** ${missing.join(', ')}`;
      }

      return description;
    };

    // Имена применённых особенностей — чтобы выдать заклинания только от них
    // (не от невыбранных подвидов): сверяем с источником granted-заклинаний.
    const appliedFeatureNames = new Set<string>();

    definition.features.forEach((speciesFeature) => {
      const selectedChoice = speciesFeature.choices?.find(
        (featureChoice) =>
          featureChoice.key === state.value.featureChoices[speciesFeature.key],
      );

      // Базовая особенность вида (если не чисто информационная)
      if (!speciesFeature.isInformationalOnly) {
        let description = describeGrantedSpells(speciesFeature);
        let finalName = speciesFeature.name;

        if (selectedChoice) {
          finalName = `${speciesFeature.name}: ${selectedChoice.name}`;
          description += `\n\n**Выбранный вариант:** ${selectedChoice.name}\n${selectedChoice.description}`;
        }

        pushSpeciesFeature(finalName, description, speciesFeature.level ?? 1);
        appliedFeatureNames.add(speciesFeature.name);
      }

      // Особенности выбранного подвида — со своими уровнями появления.
      for (const subspeciesFeature of selectedChoice?.features ?? []) {
        if (subspeciesFeature.isInformationalOnly) {
          continue;
        }

        pushSpeciesFeature(
          subspeciesFeature.name,
          describeGrantedSpells(subspeciesFeature),
          subspeciesFeature.level ?? 1,
        );

        appliedFeatureNames.add(subspeciesFeature.name);
      }
    });

    rootUpdates.features = newFeatures;

    // --- Granted-заклинания: откатываем от предыдущего вида и добавляем новые ---
    const originalSpells = actor.value.spells ?? [];

    let updatedSpells = [...originalSpells];

    if (previousSpecies && previousSpeciesDef) {
      // Имена особенностей предыдущего вида, включая особенности подвидов.
      const previousFeatureNames: string[] = [];

      for (const feature of previousSpeciesDef.features) {
        previousFeatureNames.push(feature.name);

        for (const choice of feature.choices ?? []) {
          for (const choiceFeature of choice.features ?? []) {
            previousFeatureNames.push(choiceFeature.name);
          }
        }
      }

      updatedSpells = removeGrantedSpellsByFeatureNames(
        updatedSpells,
        previousFeatureNames,
      );
    }

    // Выдаём только заклинания от применённых особенностей (выбранных подвидов).
    const applicableGrantedSpells = resolvedGrantedSpells.filter((resolved) =>
      appliedFeatureNames.has(resolved.featureName),
    );

    updatedSpells = appendGrantedSpells(updatedSpells, applicableGrantedSpells);

    // Сравнение по длине недостаточно: удаление и добавление могут совпасть
    // по количеству, поэтому дополнительно сверяем ссылки поэлементно
    const spellsChanged =
      updatedSpells.length !== originalSpells.length
      || updatedSpells.some((spell, index) => spell !== originalSpells[index]);

    if (spellsChanged) {
      rootUpdates.spells = updatedSpells;
    }

    // --- Защиты вида: применяются актёру как пассивный активный эффект
    // (у актёров нет system.defenses). Защиты от урона — через флаги
    // resistance/immunity/vulnerability.*, иммунитеты к состояниям — через
    // поле conditionImmunities. Эффект помечен стабильным id-префиксом, что
    // позволяет снять прежний при смене/удалении вида, не задевая эффекты из
    // других источников. ---
    const damageDefenseFlags = collectDamageDefenseFlags(
      definition,
      chosenSubspecies,
    );

    const speciesConditionImmunities = collectSpeciesConditionImmunities(
      definition,
      chosenSubspecies,
    );

    const baseEffects = (actor.value.activeEffects ?? []).filter(
      (effect) => !isSpeciesDefenseEffect(effect),
    );

    const hasDefenses =
      damageDefenseFlags.length > 0 || speciesConditionImmunities.length > 0;

    const updatedEffects = hasDefenses
      ? [
          ...baseEffects,
          buildSpeciesDefenseEffect(
            definition,
            damageDefenseFlags,
            speciesConditionImmunities,
          ),
        ]
      : baseEffects;

    const originalEffects = actor.value.activeEffects ?? [];

    const effectsChanged =
      updatedEffects.length !== originalEffects.length
      || updatedEffects.some(
        (effect, index) => effect !== originalEffects[index],
      );

    if (effectsChanged) {
      rootUpdates.activeEffects = updatedEffects;
    }

    return { systemUpdates, rootUpdates };
  }

  return {
    state,
    steps,
    currentStepIndex,
    currentStep,
    nextStep,
    prevStep,
    canProceed,
    isFinalStep,
    grantedSpellSources,
    buildUpdates,
  };
}
