/**
 * Локальные типы редактирования черты (форма «Создать/Редактировать черту»).
 *
 * Форма держит «дары» черты в плоском, удобном для UI виде
 * ({@link EditableFeatGrants}); при сохранении они собираются в блоб
 * {@link FeatData} (`buildFeatData`), а при открытии — разворачиваются из него
 * (`featDataToGrants`). Тип вынесен отдельно, чтобы вкладку «Владения»
 * ({@link FeatGrantsFields}) можно было переиспользовать в других разделах.
 */

import type { AbilityType, SkillType } from '@vtt/shared';
import type {
  ConditionKey,
  DamageDefenseEntry,
  FeatAbilityScoreIncrease,
  FeatData,
  FeatPrerequisite,
  GrantedSpellRef,
} from '@vtt/shared/system/dnd.js';

/** Характеристики в порядке вывода. */
export const ABILITY_KEYS: readonly AbilityType[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

/** Запись «характеристика → число» со всеми шестью характеристиками по нулям. */
export function createEmptyAbilityRecord(): Record<AbilityType, number> {
  return {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };
}

/** Редактируемые «дары» черты (вкладка «Владения»). */
export interface EditableFeatGrants {
  skillProficiencies: SkillType[];
  savingThrowProficiencies: AbilityType[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  languages: string[];
  damageDefenses: DamageDefenseEntry[];
  conditionImmunities: ConditionKey[];
  darkvision: number;
  /** Фиксированные прибавки характеристик (0 = нет). */
  asiFixed: Record<AbilityType, number>;
  /** Прибавка на выбор: размер прибавки. */
  asiChoiceAmount: number;
  /** Прибавка на выбор: сколько характеристик выбирается (0 = нет выбора). */
  asiChoiceCount: number;
  /** Прибавка на выбор: из каких характеристик (пусто = любая). */
  asiChoiceFrom: AbilityType[];
  /** Минимальные значения характеристик-требований (0 = нет). */
  prerequisiteAbilities: Record<AbilityType, number>;
  /** Минимальный суммарный уровень персонажа (0 = нет). */
  prerequisiteMinLevel: number;
  /** Требуется ли способность творить заклинания. */
  prerequisiteSpellcasting: boolean;
  /** Произвольный текст требования. */
  prerequisiteText: string;
}

/** Пустые «дары» черты. */
export function createEmptyFeatGrants(): EditableFeatGrants {
  return {
    skillProficiencies: [],
    savingThrowProficiencies: [],
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    languages: [],
    damageDefenses: [],
    conditionImmunities: [],
    darkvision: 0,
    asiFixed: createEmptyAbilityRecord(),
    asiChoiceAmount: 1,
    asiChoiceCount: 0,
    asiChoiceFrom: [],
    prerequisiteAbilities: createEmptyAbilityRecord(),
    prerequisiteMinLevel: 0,
    prerequisiteSpellcasting: false,
    prerequisiteText: '',
  };
}

/** Разворачивает блоб {@link FeatData} в редактируемые «дары». */
export function featDataToGrants(
  featData: FeatData | null | undefined,
): EditableFeatGrants {
  const grants = createEmptyFeatGrants();

  if (!featData) {
    return grants;
  }

  grants.skillProficiencies = [...(featData.skillProficiencies ?? [])];

  grants.savingThrowProficiencies = [
    ...(featData.savingThrowProficiencies ?? []),
  ];

  grants.armorProficiencies = [...(featData.armorProficiencies ?? [])];
  grants.weaponProficiencies = [...(featData.weaponProficiencies ?? [])];
  grants.toolProficiencies = [...(featData.toolProficiencies ?? [])];
  grants.languages = [...(featData.languages ?? [])];

  grants.damageDefenses = (featData.damageDefenses ?? []).map((entry) => ({
    ...entry,
  }));

  grants.conditionImmunities = [...(featData.conditionImmunities ?? [])];
  grants.darkvision = featData.darkvision ?? 0;

  for (const ability of ABILITY_KEYS) {
    grants.asiFixed[ability] =
      featData.abilityScoreIncrease?.fixed?.[ability] ?? 0;
  }

  const choice = featData.abilityScoreIncrease?.choice;

  if (choice) {
    grants.asiChoiceAmount = choice.amount;
    grants.asiChoiceCount = choice.count;
    grants.asiChoiceFrom = [...(choice.from ?? [])];
  }

  for (const ability of ABILITY_KEYS) {
    grants.prerequisiteAbilities[ability] =
      featData.prerequisite?.abilities?.[ability] ?? 0;
  }

  grants.prerequisiteMinLevel = featData.prerequisite?.minLevel ?? 0;

  grants.prerequisiteSpellcasting =
    featData.prerequisite?.spellcasting ?? false;

  grants.prerequisiteText = featData.prerequisite?.text ?? '';

  return grants;
}

/**
 * Собирает блоб {@link FeatData} из редактируемых «даров» и списка выдаваемых
 * заклинаний. Пустые поля опускаются; если черта не даёт ничего механического —
 * возвращает `undefined` (блоб не пишется).
 *
 * @param grants - редактируемые «дары» черты
 * @param grantedSpells - выдаваемые заклинания (вкладка «Заклинания»)
 */
export function buildFeatData(
  grants: EditableFeatGrants,
  grantedSpells: GrantedSpellRef[],
): FeatData | undefined {
  const data: FeatData = { type: 'feat' };

  if (grants.skillProficiencies.length > 0) {
    data.skillProficiencies = [...grants.skillProficiencies];
  }

  if (grants.savingThrowProficiencies.length > 0) {
    data.savingThrowProficiencies = [...grants.savingThrowProficiencies];
  }

  if (grants.armorProficiencies.length > 0) {
    data.armorProficiencies = [...grants.armorProficiencies];
  }

  if (grants.weaponProficiencies.length > 0) {
    data.weaponProficiencies = [...grants.weaponProficiencies];
  }

  if (grants.toolProficiencies.length > 0) {
    data.toolProficiencies = [...grants.toolProficiencies];
  }

  if (grants.languages.length > 0) {
    data.languages = [...grants.languages];
  }

  if (grants.damageDefenses.length > 0) {
    data.damageDefenses = grants.damageDefenses.map((entry) => ({ ...entry }));
  }

  if (grants.conditionImmunities.length > 0) {
    data.conditionImmunities = [...grants.conditionImmunities];
  }

  if (grants.darkvision > 0) {
    data.darkvision = grants.darkvision;
  }

  const asi = buildAbilityScoreIncrease(grants);

  if (asi) {
    data.abilityScoreIncrease = asi;
  }

  const prerequisite = buildPrerequisite(grants);

  if (prerequisite) {
    data.prerequisite = prerequisite;
  }

  const refs = grantedSpells
    .filter((spell) => spell.name.trim().length > 0)
    .map((spell) => ({
      name: spell.name.trim(),
      ...(spell.spellId ? { spellId: spell.spellId } : {}),
      ...(spell.packId ? { packId: spell.packId } : {}),
    }));

  if (refs.length > 0) {
    data.grantedSpells = refs;
  }

  // Кроме дискриминанта `type` ничего не задано — блоб не нужен.
  return Object.keys(data).length > 1 ? data : undefined;
}

/** Собирает повышение характеристик из редактируемых «даров». */
function buildAbilityScoreIncrease(
  grants: EditableFeatGrants,
): FeatAbilityScoreIncrease | undefined {
  const fixed: Partial<Record<AbilityType, number>> = {};

  for (const ability of ABILITY_KEYS) {
    const bonus = grants.asiFixed[ability];

    if (bonus && bonus !== 0) {
      fixed[ability] = bonus;
    }
  }

  const result: FeatAbilityScoreIncrease = {};

  if (Object.keys(fixed).length > 0) {
    result.fixed = fixed;
  }

  if (grants.asiChoiceCount > 0 && grants.asiChoiceAmount !== 0) {
    result.choice = {
      amount: grants.asiChoiceAmount,
      count: grants.asiChoiceCount,
      ...(grants.asiChoiceFrom.length > 0
        ? { from: [...grants.asiChoiceFrom] }
        : {}),
    };
  }

  return result.fixed || result.choice ? result : undefined;
}

/** Собирает предусловия из редактируемых «даров». */
function buildPrerequisite(
  grants: EditableFeatGrants,
): FeatPrerequisite | undefined {
  const result: FeatPrerequisite = {};

  const abilities: Partial<Record<AbilityType, number>> = {};

  for (const ability of ABILITY_KEYS) {
    const value = grants.prerequisiteAbilities[ability];

    if (value && value > 0) {
      abilities[ability] = value;
    }
  }

  if (Object.keys(abilities).length > 0) {
    result.abilities = abilities;
  }

  if (grants.prerequisiteMinLevel > 0) {
    result.minLevel = grants.prerequisiteMinLevel;
  }

  if (grants.prerequisiteSpellcasting) {
    result.spellcasting = true;
  }

  if (grants.prerequisiteText.trim().length > 0) {
    result.text = grants.prerequisiteText.trim();
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
