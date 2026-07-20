export {
  isRecord,
  pushUnique,
  removeItems,
  typedObjectEntries,
} from './src/utils/index.js';

export * from './src/assetPaths.js';
export * from './src/constants/permissions.js';
export * from './src/initiativeUtils.js';
// D&D-боёвка на границе хода (system/dnd/turnEffects) БОЛЬШЕ не реэкспортится из
// корневого barrel: последний не-системный потребитель (initiativeModule) переведён
// на контракт `VttSystem` (`getSystem()?.expireTurnEffects?.()`). Значение-уровневая
// расшивка ядра от D&D завершена — core/модули не тянут D&D-значения (§0.4/§0.5).
export * from './src/system/index.js';
// packages/shared/index.ts
// Export all shared modules
export * from './src/types/index.js';
export * from './src/utils/colors.js';
export * from './src/utils/formatting.js';
export * from './src/utils/generateId.js';
export * from './src/utils/geometry.js';
export * from './src/utils/getTokenDistance.js';
export * from './src/utils/manifestValidation.js';
export * from './src/utils/unitConverter.js';
export * from './src/wsClient.js';
export * from './src/wsEvents.js';
export * from './src/wsProtocol.js';
