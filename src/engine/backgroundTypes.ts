/**
 * Типы данных предысторий D&D 5e (PHB 2024)
 *
 * Определяет структуру данных предыстории в компендиуме (BackgroundDefinition)
 * и запись на акторе (ActorBackgroundEntry).
 */

import type { AbilityType, SkillType } from '@vtt/shared';
import type { ActiveEffect } from './activeEffectTypes.js';
import type { FeatData } from './featTypes.js';

/** Ключ предыстории (string для поддержки пользовательских предысторий) */
export type BackgroundKey = string;

/** Грант повышения характеристик предыстории */
export interface BackgroundAbilityGrant {
  /** 3 характеристики, между которыми распределяется +2/+1 или +1/+1/+1 */
  abilities: AbilityType[];
}

/** Грант навыков предыстории */
export interface BackgroundSkillGrant {
  /** Навыки, которые даёт предыстория (всегда 2) */
  skills: SkillType[];
}

/** Грант владения инструментами предыстории */
export interface BackgroundToolGrant {
  /** Фиксированные инструменты */
  items: string[];
  /** Выбор из списка (напр. музыкальный инструмент на выбор) */
  choices?: { count: number; from: string[] };
}

/** Грант черты предыстории */
export interface BackgroundFeatGrant {
  /** ID черты в feats.json (фиксированная черта, если нет выбора) */
  featId?: string;
  /** Список ID черт для выбора (если предыстория допускает альтернативы) */
  featChoices?: string[];
  /** Русское название черты (для отображения, когда featId единственный до выбора) */
  featName: string;
  /** Англ. название (для отображения) */
  featNameEn?: string;
}

/** Вариант стартового снаряжения */
export interface BackgroundEquipmentOption {
  /** Описание варианта снаряжения (текст) */
  description: string;
  /** Стоимость альтернативы в зм (вариант Б) */
  goldAlternative?: number;
}

/** Определение предыстории в компендиуме */
export interface BackgroundDefinition {
  /** Дискриминантное поле типа записи компендиума */
  type: 'background';
  /** Уникальный ключ предыстории */
  key: BackgroundKey;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Описание (может содержать Markdown) */
  description: string;
  /** Ключ источника-книги из sources.json (напр. 'phb', 'dmg') */
  sourceKey?: string;
  /** Принадлежит ли к SRD */
  isSRD?: boolean;

  /** Повышение характеристик */
  abilityGrant: BackgroundAbilityGrant;
  /** Навыки */
  skillGrant: BackgroundSkillGrant;
  /** Владение инструментами */
  toolGrant: BackgroundToolGrant;
  /** Черта */
  featGrant: BackgroundFeatGrant;
  /** Варианты стартового снаряжения */
  equipmentOptions: BackgroundEquipmentOption[];

  /**
   * Расширенные «дары что угодно» (как у черты): владения, языки, защиты,
   * иммунитеты, тёмное зрение, повышение характеристик, предусловия, выдаваемые
   * заклинания. Аддитивны к каноническим полям выше; применяются мастером
   * предыстории по образцу применения черты (провенанс `background:<key>`).
   * Хранится в той же колонке `feat_data`, что и у черты. См. {@link FeatData}.
   */
  featData?: FeatData;
  /**
   * Активные эффекты предыстории (бонусы/флаги). Переносятся на актора при
   * применении предыстории (общая для всех предметов колонка `active_effects`).
   */
  activeEffects?: ActiveEffect[];
}

/** Запись о предыстории на акторе */
export interface ActorBackgroundEntry {
  /** Ключ предыстории */
  backgroundKey: string;
  /** Русское название */
  backgroundName: string;
  /** Выбранное распределение характеристик: { strength: 2, wisdom: 1 } */
  abilityChoices: Partial<Record<AbilityType, number>>;
  /** Навыки, полученные от предыстории */
  skillChoices: SkillType[];
  /** Выбранные инструменты (если был выбор) */
  toolChoices: string[];
  /** ID присвоенной черты на акторе (для удаления при замене) */
  grantedFeatId?: string;
  /** Название присвоенной черты (для отображения на листе) */
  grantedFeatName?: string;

  // --- Применённые расширенные дары (`featData`) — для ТОЧНОГО отката ---
  // Хранятся именно применённые значения, а не пере-выводятся из определения
  // (определение могло измениться/удалиться к моменту замены предыстории).
  /** Доп. владения навыками от `featData` (помимо двух канонических навыков). */
  extraSkillProficiencies?: SkillType[];
  /** Владения спасбросками от `featData`. */
  savingThrowProficiencies?: AbilityType[];
  /** Владения доспехами от `featData`. */
  armorProficiencies?: string[];
  /** Владения оружием от `featData`. */
  weaponProficiencies?: string[];
  /** Доп. владения инструментами от `featData` (помимо канонических). */
  extraToolProficiencies?: string[];
  /** Языки от `featData`. */
  languages?: string[];
  /**
   * Синтетическое имя-источник заклинаний, выданных СОБСТВЕННЫМ `featData`
   * предыстории (отличное от имени черты-происхождения) — для снятия на откате.
   */
  ownGrantedSpellSource?: string;
  /** Тёмное зрение, поднятое предысторией (футы) — справочно (не понижается). */
  darkvisionApplied?: number;
}
