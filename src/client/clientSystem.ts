import type { Component } from 'vue';

import type { ClientSystemAPI } from '@/core/systemBootstrap';

import { dnd5eSystemInstance } from '@vtt/shared/system/dnd.js';
import { defineAsyncComponent } from 'vue';

import { registerDnd5eMacros } from './macros/dnd5eMacros';
import { registerSystemDataSync } from './systemDataSync';
import ActorDeleteConfirmModal from './ui/actor/ActorDeleteConfirmModal.vue';
import QuickEquipmentModal from './ui/actor/QuickEquipmentModal.vue';
import QuickSpellsModal from './ui/actor/QuickSpellsModal.vue';
import ActiveEffectFormModal from './ui/actor/tabs/ActiveEffectFormModal.vue';
import CreatureDeleteConfirmModal from './ui/creature/CreatureDeleteConfirmModal.vue';

/**
 * Ленивая карта ВСЕХ модалок и листов системы D&D 5e (по имени файла). Glob
 * выполняется ВНУТРИ чанка системы (`systems/dnd5e/`) — ребра `core → systems`
 * не образует и всё остаётся в ленивом `system-dnd5e` чанке.
 */
const DND5E_MODAL_MODULES: Record<string, () => Promise<unknown>> = {
  ...import.meta.glob('./**/*Modal.vue'),
  ...import.meta.glob('./**/*Sheet.vue'),
};

/**
 * Содержательные ПОД-МОДУЛИ системы (персонаж, предметы, существа) — Foundry-стиль
 * «модули внутри системы». Каждый — `modules/<domain>/register.ts` с экспортом
 * `register()`. Glob выполняется ВНУТРИ чанка системы (`core → systems` не
 * образуется) и остаётся в ленивом `system-dnd5e` чанке.
 */
const DND5E_CONTENT_MODULES = import.meta.glob('./modules/*/register.ts', {
  eager: true,
});

/**
 * Регистрирует все модалки/листы системы в реестре модалок по имени файла
 * (напр. `DiceRollModal`, `SpellDetailModal`, `CreatureSheet`). После этого
 * `ModalContainer` резолвит их через реестр, а не файловым glob — система
 * «владеет» своими окнами (шаг к самодостаточной папке системы).
 */
function registerDnd5eModals(api: ClientSystemAPI): void {
  for (const [path, importer] of Object.entries(DND5E_MODAL_MODULES)) {
    const fileName = path.split('/').pop();

    if (!fileName) {
      continue;
    }

    api.modal(
      fileName.replace(/\.vue$/, ''),
      // Ленивый async-компонент — как и прежний glob в ModalContainer (код
      // модалки грузится при первом открытии, не при загрузке системы).
      defineAsyncComponent(importer as () => Promise<Component>),
    );
  }
}

/** Type-guard: под-модуль экспортирует `register(api)`. */
function hasRegister(
  mod: unknown,
): mod is { register: (api: ClientSystemAPI) => void } {
  return (
    typeof mod === 'object'
    && mod !== null
    && 'register' in mod
    && typeof mod.register === 'function'
  );
}

/** Прогоняет `register(api)` всех содержательных под-модулей системы. */
function registerDnd5eContentModules(api: ClientSystemAPI): void {
  for (const mod of Object.values(DND5E_CONTENT_MODULES)) {
    if (hasRegister(mod)) {
      mod.register(api);
    }
  }
}

/**
 * Регистрирует клиентскую часть системы D&D 5e в реестрах ядра: ядро системы
 * (расчёты), UI-систему и системные модалки, затем содержательные под-модули
 * (персонаж, предметы, существа), которые регистрируют листы/карточки/типы.
 *
 * Имя `registerClientSystem` — конвенция: рантайм-загрузчик клиентских систем
 * (`clientSystemLoader`) вызывает именно этот экспорт у выбранной системы.
 */
export function registerClientSystem(api: ClientSystemAPI) {
  // Ядро системы (расчёты: инициатива, здоровье…) в общий реестр систем через SDK.
  // Активную систему проставляет ЗАГРУЗЧИК ПОСЛЕ регистрации (`setActive`), поэтому
  // здесь `setActiveSessionSystem`/`setActiveSystem` НЕ дублируем (потребители
  // активной системы — рантайм-код: лист/компендиум, а не сама регистрация).
  api.defineSystem(dnd5eSystemInstance);

  // UI-слоты системы: макросы + модалки удаления/эффектов/быстрые (их рендерит
  // ядро — custom-areas, удаление актёра/существа, быстрые окна).
  api.uiSystem({
    registerMacros: registerDnd5eMacros,
    actorDeleteConfirmModal: ActorDeleteConfirmModal,
    creatureDeleteConfirmModal: CreatureDeleteConfirmModal,
    activeEffectFormModal: ActiveEffectFormModal,
    quickSpellsModal: QuickSpellsModal,
    quickEquipmentModal: QuickEquipmentModal,
  });

  // Система «владеет» своими модалками (лист, просмотрщики, кубики) — регистрируем
  // их в реестре модалок, чтобы ModalContainer резолвил их через реестр.
  registerDnd5eModals(api);

  // Содержательные под-модули: персонаж (лист), предметы (типы + карточки),
  // существа (карточка) — каждый в своей папке `modules/<domain>/register.ts`.
  registerDnd5eContentModules(api);

  // Синхронизация справочных данных системы (оружие/урон/броня/…): система сама
  // подписывается на свои `system:*` WS-события через SDK-примитив `socket:setup`.
  registerSystemDataSync();
}
