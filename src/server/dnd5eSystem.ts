/**
 * Серверная игровая система D&D 5th Edition.
 *
 * Наследует расчётную логику (initiative, модификаторы) из shared Dnd5eVttSystem.
 * Добавляет серверный lifecycle (init/destroy).
 *
 * Все расчётные функции (модификатор, бонус мастерства, AC и т.д.)
 * находятся в shared/system/dnd/calculations.ts — единый источник правды (DRY).
 *
 * Система регистрируется через ModuleRegistry.setSystem() при старте мира.
 */

import { Dnd5eVttSystem } from '@vtt/shared/system/dnd.js';

export class Dnd5eSystem extends Dnd5eVttSystem {
  override init(_api: unknown): void {
    // eslint-disable-next-line no-console
    console.log(`[${this.name}] System initialized (v${this.version})`);
  }

  override destroy(): void {
    // eslint-disable-next-line no-console
    console.log(`[${this.name}] System destroyed`);
  }
}
