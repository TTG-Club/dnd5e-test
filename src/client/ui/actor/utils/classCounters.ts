import type {
  ActorCounterState,
  ClassCounterDefinition,
} from '@vtt/shared/system/dnd.js';

/**
 * Находит определение счётчика в переданном списке определений компендиума.
 * Сначала пытается сопоставить по ключу счётчика и ключу подкласса,
 * если совпадение не найдено — ищет по ключу счётчика в целом.
 *
 * @param counter - состояние счётчика на акторе
 * @param counterDefinitions - список определений счётчиков классов
 * @returns найденное определение счётчика или undefined
 */
export function findCounterDefinition(
  counter: ActorCounterState,
  counterDefinitions: ClassCounterDefinition[],
): ClassCounterDefinition | undefined {
  const exactDefinition = counterDefinitions.find(
    (definition) =>
      definition.key === counter.counterKey
      && definition.subclassKey === counter.subclassKey,
  );

  if (exactDefinition) {
    return exactDefinition;
  }

  const matchingDefinitions = counterDefinitions.filter(
    (definition) => definition.key === counter.counterKey,
  );

  return matchingDefinitions.length === 1 ? matchingDefinitions[0] : undefined;
}
