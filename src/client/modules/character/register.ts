/**
 * Под-модуль системы D&D 5e: ПЕРСОНАЖ.
 *
 * Регистрирует лист персонажа в реестре листов ядра. Один из «модулей внутри
 * системы» (Foundry-стиль): каждый содержательный домен (персонаж, предметы,
 * существа) — самодостаточный `register.ts`, который `clientSystem.ts`
 * подхватывает `import.meta.glob('./modules/*\/register.ts')`.
 *
 * @module systems/dnd5e/modules/character
 */

import type { ClientSystemAPI } from '@/core/systemBootstrap';

import Dnd5eActorSheet from '../../ui/actor/Dnd5eActorSheet.vue';

/** Регистрирует UI персонажа D&D 5e (через SDK, без прямых импортов ядра). */
export function register(api: ClientSystemAPI): void {
  api.actorSheet({
    actorType: 'character',
    label: 'Лист персонажа D&D 5e',
    component: Dnd5eActorSheet,
  });
}
