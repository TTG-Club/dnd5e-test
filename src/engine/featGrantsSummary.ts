/**
 * Сборка читаемой текстовой сводки «Что даёт черта» из её настроек
 * (`featData` + `activeEffects`).
 *
 * Описание черты остаётся чистой прозой; механические дары (владения, языки,
 * защиты, повышение характеристик, заклинания, эффекты, предусловия) выводятся
 * отдельным авто-блоком Markdown в просмотре черты — чтобы мастер сразу видел,
 * как черта настроена, без ручного дублирования в описании.
 *
 * Логика системо-зависима (форма `FeatData` D&D 5e), поэтому живёт в системе и
 * вызывается Ядром через контракт `VttSystem.getFeatGrantsSummary`.
 *
 * @module system/dnd/featGrantsSummary
 */

import type { AbilityType, Feature } from '@vtt/shared';
import type { BackgroundDefinition } from './backgroundTypes.js';
import type { GameItem } from './dndEntities.js';
import type { FeatData } from './featTypes.js';

import {
  ABILITY_LABELS,
  CONDITIONS,
  SKILLS_LABELS,
  TOOLS_LABELS,
} from './consts.js';
import {
  DAMAGE_DEFENSE_KIND_LABELS,
  DAMAGE_TYPE_LABELS,
} from './damageConstants.js';

/** Подписи владения доспехами (нет в shared — компактно дублируем). */
const ARMOR_LABELS: Record<string, string> = {
  light: 'лёгкие доспехи',
  medium: 'средние доспехи',
  heavy: 'тяжёлые доспехи',
  shield: 'щиты',
};

/** Подписи владения оружием (нет в shared — компактно дублируем). */
const WEAPON_LABELS: Record<string, string> = {
  simple: 'простое оружие',
  martial: 'воинское оружие',
};

/** Подпись характеристики по ключу. */
function abilityLabel(ability: string): string {
  return ABILITY_LABELS[ability as AbilityType] ?? ability;
}

/** Строка повышения характеристик. */
function abilityScoreLine(featData: FeatData): string | null {
  const asi = featData.abilityScoreIncrease;

  if (!asi) {
    return null;
  }

  const parts: string[] = [];

  for (const [ability, bonus] of Object.entries(asi.fixed ?? {})) {
    if (bonus) {
      parts.push(`+${bonus} ${abilityLabel(ability)}`);
    }
  }

  if (asi.choice && asi.choice.count > 0) {
    const from =
      asi.choice.from && asi.choice.from.length > 0
        ? asi.choice.from.map(abilityLabel).join(' / ')
        : 'любая характеристика';

    const count = asi.choice.count > 1 ? `${asi.choice.count}× ` : '';

    parts.push(`+${asi.choice.amount} к ${count}${from} (на выбор)`);
  }

  return parts.length > 0 ? `- **Характеристики:** ${parts.join(', ')}` : null;
}

/** Строка владений. */
function proficiencyLine(featData: FeatData): string | null {
  const parts: string[] = [];

  if (featData.skillProficiencies?.length) {
    parts.push(
      featData.skillProficiencies
        .map((skill) => SKILLS_LABELS[skill] ?? skill)
        .join(', '),
    );
  }

  if (featData.savingThrowProficiencies?.length) {
    parts.push(
      `спасброски: ${featData.savingThrowProficiencies
        .map(abilityLabel)
        .join(', ')}`,
    );
  }

  if (featData.armorProficiencies?.length) {
    parts.push(
      featData.armorProficiencies
        .map((armor) => ARMOR_LABELS[armor] ?? armor)
        .join(', '),
    );
  }

  if (featData.weaponProficiencies?.length) {
    parts.push(
      featData.weaponProficiencies
        .map((weapon) => WEAPON_LABELS[weapon] ?? weapon)
        .join(', '),
    );
  }

  if (featData.toolProficiencies?.length) {
    parts.push(
      featData.toolProficiencies
        .map((tool) => TOOLS_LABELS[tool] ?? tool)
        .join(', '),
    );
  }

  return parts.length > 0 ? `- **Владения:** ${parts.join('; ')}` : null;
}

/** Строка защит (от урона и состояний). */
function defenseLine(featData: FeatData): string | null {
  const parts: string[] = [];

  for (const defense of featData.damageDefenses ?? []) {
    const kind = DAMAGE_DEFENSE_KIND_LABELS[defense.kind].toLowerCase();

    parts.push(`${kind}: ${DAMAGE_TYPE_LABELS[defense.damageType]}`);
  }

  for (const condition of featData.conditionImmunities ?? []) {
    const label =
      CONDITIONS.find((entry) => entry.key === condition)?.nameRu ?? condition;

    parts.push(`иммунитет к состоянию «${label}»`);
  }

  return parts.length > 0 ? `- **Защиты:** ${parts.join(', ')}` : null;
}

/** Строка предусловий. */
function prerequisiteLine(featData: FeatData): string | null {
  const prerequisite = featData.prerequisite;

  if (!prerequisite) {
    return null;
  }

  const parts: string[] = [];

  for (const [ability, value] of Object.entries(prerequisite.abilities ?? {})) {
    if (value) {
      parts.push(`${abilityLabel(ability)} ${value}+`);
    }
  }

  if (prerequisite.minLevel) {
    parts.push(`уровень ${prerequisite.minLevel}+`);
  }

  if (prerequisite.spellcasting) {
    parts.push('умение творить заклинания');
  }

  if (prerequisite.text) {
    parts.push(prerequisite.text);
  }

  return parts.length > 0 ? `- **Требования:** ${parts.join(', ')}` : null;
}

/**
 * Строит Markdown-список даров черты из её настроек (для таба «Автоматизация»
 * в просмотре). Возвращает пустую строку, если черта не несёт механических
 * даров (тогда таб не показывается).
 *
 * @param feat - источник даров с настройками (`featData` / `activeEffects`):
 *   черта, предмет или предыстория.
 */
export function buildFeatGrantsSummary(
  feat: Feature | GameItem | BackgroundDefinition,
): string {
  // `featData`/`activeEffects` есть у GameItem-черты и у применённой черты на
  // акторе (несётся через AppliedFeatFeature). У обычной особенности (Feature)
  // их нет — сводка тогда пустая.
  const featData: FeatData | null =
    'featData' in feat ? (feat.featData ?? null) : null;

  const activeEffects =
    'activeEffects' in feat ? feat.activeEffects : undefined;

  const lines: string[] = [];

  if (featData?.grantedSpells?.length) {
    lines.push(
      `- **Заклинания:** ${featData.grantedSpells
        .map((spell) => spell.name)
        .join(', ')}`,
    );
  }

  if (activeEffects?.length) {
    const effects = activeEffects
      .map((effect) => effect.description.trim() || effect.name)
      .join('; ');

    lines.push(`- **Эффекты:** ${effects}`);
  }

  if (featData) {
    const asiLine = abilityScoreLine(featData);

    if (asiLine) {
      lines.push(asiLine);
    }

    const profLine = proficiencyLine(featData);

    if (profLine) {
      lines.push(profLine);
    }

    if (featData.languages?.length) {
      lines.push(`- **Языки:** ${featData.languages.join(', ')}`);
    }

    const defenses = defenseLine(featData);

    if (defenses) {
      lines.push(defenses);
    }

    if (featData.darkvision && featData.darkvision > 0) {
      lines.push(`- **Чувства:** тёмное зрение ${featData.darkvision} фт.`);
    }

    const prereq = prerequisiteLine(featData);

    if (prereq) {
      lines.push(prereq);
    }
  }

  return lines.join('\n');
}
