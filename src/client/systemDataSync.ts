/**
 * Синхронизация справочных данных D&D 5e (свойства оружия, типы урона, брони,
 * источники и т.д.) с сервером — ЧАСТЬ СИСТЕМЫ, а не ядра.
 *
 * Раньше ядровой `useSocket` подписывался на `system:*` события и наполнял
 * `systemDataStore`. Теперь система сама берёт активный сокет (SDK-примитив
 * `getActiveSocket` + хук `socket:setup`), подписывается на СВОИ события и
 * запрашивает данные — ядро про `system:*` и `systemDataStore` не знает.
 *
 * @module systems/dnd5e/systemDataSync
 */

import type { TypedWebSocketClient } from '@vtt/shared';

import { systemRegistry } from '@vtt/shared';
import { dnd5eSystemInstance } from '@vtt/shared/system/dnd.js';

import { ClientHooks } from '@/core/clientHooks';
import { getActiveSocket } from '@/system-runtime/activeSocket';

import { useSystemDataStore } from './stores/systemDataStore';

/**
 * Подписывает переданный сокет на все справочные `system:*` события D&D и
 * запрашивает данные (`system:request-all`). Идемпотентно на уровне экземпляра
 * сокета: `socket:setup` эмитится по одному разу на клиент (в т.ч. реконнект).
 *
 * @param socket - активный WebSocket-клиент
 */
function subscribeSystemData(socket: TypedWebSocketClient): void {
  const store = useSystemDataStore();

  // Агрегированный ответ — все справочные данные одним пакетом
  socket.on('system:all-data', (data) => {
    store.setWeaponProperties(data.weaponProperties);
    store.setWeaponBaseTypes(data.weaponBaseTypes);
    store.setDamageTypes(data.damageTypes);
    store.setWeaponCategories(data.weaponCategories);
    store.setAmmunitionTypes(data.ammunitionTypes);
    store.setSources(data.sources);
    store.setArmorCategories(data.equipmentCategories);
    store.setArmorBaseTypes(data.armorBaseTypes);
    store.setEquipmentProperties(data.equipmentProperties);
    store.setToolProperties(data.toolProperties);
  });

  // Индивидуальные обработчики — обратная совместимость
  socket.on('system:weapon-properties', (properties) => {
    store.setWeaponProperties(properties);
  });

  socket.on('system:weapon-base-types', (baseTypes) => {
    store.setWeaponBaseTypes(baseTypes);
  });

  socket.on('system:damage-types', (types) => {
    store.setDamageTypes(types);
  });

  socket.on('system:weapon-categories', (categories) => {
    store.setWeaponCategories(categories);
  });

  socket.on('system:ammunition-types', (types) => {
    store.setAmmunitionTypes(types);
  });

  socket.on('system:sources', (sources) => {
    store.setSources(sources);
  });

  socket.on('system:equipment-categories', (categories) => {
    store.setArmorCategories(categories);
  });

  socket.on('system:armor-base-types', (baseTypes) => {
    store.setArmorBaseTypes(baseTypes);
  });

  socket.on('system:equipment-properties', (properties) => {
    store.setEquipmentProperties(properties);
  });

  socket.on('system:tool-properties', (properties) => {
    store.setToolProperties(properties);
  });

  // Запрашиваем данные при подключении (и сразу, если сокет уже подключён —
  // случай, когда система загрузилась после установления соединения).
  socket.on('connect', () => {
    socket.emit('system:request-all');
  });

  if (socket.connected) {
    socket.emit('system:request-all');
  }
}

/**
 * Хук `socket:setup` уже установлен (регистрация системы перезапускается при
 * каждом входе в мир — без флага подписки копились бы N-кратно).
 */
let hookInstalled = false;

/**
 * Активна ли сейчас ИМЕННО НАША система. Сравнение по ЭКЗЕМПЛЯРУ (не по id):
 * у копии системы движок вбандлен свой, поэтому и оригинал, и копия корректно
 * узнают «себя» независимо от id, под которым их зарегистрировал загрузчик.
 */
function isOwnSystemActive(): boolean {
  try {
    return systemRegistry.getActiveSystem() === dnd5eSystemInstance;
  } catch {
    return false;
  }
}

/**
 * Обработчик `socket:setup`. Хук ядра живёт до конца сессии (механизма снятия при
 * выгрузке системы нет), поэтому гейтим по активной системе: код dnd5e не должен
 * подписываться на сокет мира ЧУЖОЙ системы и слать ему `system:request-all`.
 *
 * @param socket - создаваемый WebSocket-клиент
 */
function handleSocketSetup(socket: TypedWebSocketClient): void {
  if (!isOwnSystemActive()) {
    return;
  }

  subscribeSystemData(socket);
}

/**
 * Включает синхронизацию справочных данных D&D. Вызывается при регистрации
 * клиентской системы. Покрывает оба порядка загрузки: если сокет уже создан —
 * подписывается сразу; на будущие подключения (реконнект/поздний коннект) —
 * через хук `socket:setup`. Повторные вызовы (повторный вход в мир) хук не
 * дублируют.
 */
export function registerSystemDataSync(): void {
  const existing = getActiveSocket();

  if (existing) {
    subscribeSystemData(existing);
  }

  if (!hookInstalled) {
    hookInstalled = true;
    ClientHooks.on('socket:setup', handleSocketSetup);
  }
}
