/**
 * Типы данных черты (feat) — всё, что черта выдаёт сверх имени и описания.
 *
 * Черта хранится как `GameItem` с `type: 'feat'`; её механические «дары»
 * (владения, языки, защиты, повышение характеристик, предусловия, выдаваемые
 * заклинания) лежат во вложенном блобе `GameItem.featData` — по аналогии с тем,
 * как вид хранит {@link SpeciesDefinition} в `GameItem.speciesData`. Активные
 * эффекты черты живут на верхнем уровне `GameItem.activeEffects` (общая для всех
 * предметов колонка), поэтому в {@link FeatData} их нет.
 */

import type { AbilityType, SkillType } from '@vtt/shared';
import type { ConditionKey } from './conditionKeys.js';
import type { DamageDefenseEntry, GrantedSpellRef } from './speciesTypes.js';

/**
 * Повышение характеристик, выдаваемое чертой.
 *
 * - `fixed` — фиксированные прибавки (напр. `{ strength: 1 }`).
 * - `choice` — прибавка на выбор: `+amount` к `count` характеристикам из набора
 *   `from` (пусто = любая). Выбор делается игроком при применении и потому не
 *   применяется автоматически на дропе — выводится как подсказка.
 */
export interface FeatAbilityScoreIncrease {
  fixed?: Partial<Record<AbilityType, number>>;
  choice?: {
    amount: number;
    count: number;
    from?: AbilityType[];
  };
}

/** Предусловие (требование) черты — информационное, на дропе не проверяется. */
export interface FeatPrerequisite {
  /** Минимальные значения характеристик (напр. `{ strength: 13 }`). */
  abilities?: Partial<Record<AbilityType, number>>;
  /** Минимальный суммарный уровень персонажа. */
  minLevel?: number;
  /** Требуется ли способность творить заклинания. */
  spellcasting?: boolean;
  /** Произвольный текст требования (напр. «Эльф или полуэльф»). */
  text?: string;
}

/**
 * Полные «грант»-данные черты. Переносятся на актора при применении черты
 * (перетаскивании на лист); хранятся в `GameItem.featData`.
 */
export interface FeatData {
  /** Дискриминант блоба (для единообразия со SpeciesDefinition). */
  type: 'feat';
  /** Владение навыками (фиксированный набор). */
  skillProficiencies?: SkillType[];
  /** Владение спасбросками. */
  savingThrowProficiencies?: AbilityType[];
  /** Владение доспехами (ключи: light/medium/heavy/shield). */
  armorProficiencies?: string[];
  /** Владение оружием (ключи категорий/конкретного оружия). */
  weaponProficiencies?: string[];
  /** Владение инструментами (ключи). */
  toolProficiencies?: string[];
  /** Известные языки. */
  languages?: string[];
  /** Защиты от типов урона (сопротивление/иммунитет/уязвимость). */
  damageDefenses?: DamageDefenseEntry[];
  /** Иммунитеты к состояниям. */
  conditionImmunities?: ConditionKey[];
  /** Тёмное зрение (футы, 0/undefined = нет). */
  darkvision?: number;
  /** Повышение характеристик. */
  abilityScoreIncrease?: FeatAbilityScoreIncrease;
  /** Предусловия (требования) черты. */
  prerequisite?: FeatPrerequisite;
  /**
   * Выдаваемые заклинания: имя + опц. связь с компендиумом (`spellId`). При
   * применении связанные заклинания авто-выдаются (всегда подготовлены), как у
   * особенностей вида. См. {@link GrantedSpellRef}.
   */
  grantedSpells?: GrantedSpellRef[];
}
