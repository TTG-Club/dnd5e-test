/**
 * Под-модуль системы D&D 5e: СУЩЕСТВА.
 *
 * Регистрирует карточку сущности существа. Один из «модулей внутри системы».
 *
 * @module systems/dnd5e/modules/creatures
 */

import type { ClientSystemAPI } from '@/core/systemBootstrap';

import CreatureListItem from '../../ui/creature/CreatureListItem.vue';

/** Регистрирует существ D&D 5e: карточка сущности (через SDK). */
export function register(api: ClientSystemAPI): void {
  api.entityCard({
    type: 'creature',
    listItemComponent: CreatureListItem,
    propsFor: (entry) => {
      // Система знает форму своей записи: ПО существа — в `system.challengeRating`
      // (ядровой `EntityCardEntry` держит поле как непрозрачное `[key]: unknown`).
      const system = entry.system as
        | { challengeRating?: number | string }
        | undefined;

      return {
        name: entry.name,
        nameEn: entry.nameEn,
        header: entry.header,
        challengeRating: system?.challengeRating,
      };
    },
  });
}
