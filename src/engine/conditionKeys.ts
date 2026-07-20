/**
 * Ключ состояния D&D 5e (PHB 2024).
 *
 * Вынесен в отдельный leaf-модуль БЕЗ импортов, чтобы тип состояния можно было
 * использовать в `activeEffectTypes`/`actionRiders` без циклических зависимостей
 * (`consts.ts` — хаб с обратными связями через `types`/`creatureTypes`).
 * Реэкспортируется из `consts.ts` ради обратной совместимости импортов.
 */
export type ConditionKey =
  | 'blinded'
  | 'charmed'
  | 'deafened'
  | 'exhaustion'
  | 'frightened'
  | 'grappled'
  | 'incapacitated'
  | 'invisible'
  | 'paralyzed'
  | 'petrified'
  | 'poisoned'
  | 'prone'
  | 'restrained'
  | 'stunned'
  | 'unconscious';
