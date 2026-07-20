/**
 * Константы типов урона D&D 5e.
 *
 * Выделены в отдельный «листовой» модуль (зависит только от `types/base`),
 * чтобы их могли использовать и `activeEffectTypes`, и `consts` без
 * образования циклических зависимостей.
 */

import type { DefensibleDamageType } from '@vtt/shared';

/**
 * Все типы урона, к которым применимы защиты (сопротивление, иммунитет,
 * уязвимость). Единый источник правды для рантайма: используется при
 * разборе защит сущностей и при генерации флагов активных эффектов.
 */
export const DEFENSIBLE_DAMAGE_TYPES = [
  'slashing',
  'piercing',
  'bludgeoning',
  'fire',
  'cold',
  'lightning',
  'thunder',
  'poison',
  'acid',
  'necrotic',
  'radiant',
  'force',
  'psychic',
] as const satisfies readonly DefensibleDamageType[];

/**
 * Локализованные русские названия типов урона.
 *
 * Используется как единый источник подписей для статических меток
 * (флаги защит активных эффектов и т.п.). Динамические подписи из БД
 * (`DamageTypeDefinition`) — отдельный, загружаемый механизм.
 */
export const DAMAGE_TYPE_LABELS: Record<DefensibleDamageType, string> = {
  slashing: 'Рубящий урон',
  piercing: 'Колющий урон',
  bludgeoning: 'Дробящий урон',
  fire: 'Огненный урон',
  cold: 'Урон холодом',
  lightning: 'Урон молнией',
  thunder: 'Урон звуком (гром)',
  poison: 'Урон ядом',
  acid: 'Урон кислотой',
  necrotic: 'Некротический урон',
  radiant: 'Урон излучением',
  force: 'Силовой урон',
  psychic: 'Психический урон',
};

/**
 * Вид защиты от урона по типу: сопротивление (×0.5), иммунитет (×0) или
 * уязвимость (×2). Единый список для грантов вида и редактора.
 */
export type DamageDefenseKind = 'resistance' | 'immunity' | 'vulnerability';

/** Локализованные названия видов защиты от урона (для UI). */
export const DAMAGE_DEFENSE_KIND_LABELS: Record<DamageDefenseKind, string> = {
  resistance: 'Сопротивление',
  immunity: 'Иммунитет',
  vulnerability: 'Уязвимость',
};

/**
 * Возвращает краткое локализованное название типа урона в нижнем регистре.
 */
export function getShortDamageTypeLabel(damageType: string): string {
  const label =
    DAMAGE_TYPE_LABELS[damageType as DefensibleDamageType] ?? damageType;

  return label
    .replace(/урон\s*|^\s*урон\s*/gi, '')
    .trim()
    .toLowerCase();
}
