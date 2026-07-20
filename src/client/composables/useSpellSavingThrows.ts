import type { AbilityType, SceneEntity } from '@vtt/shared';
import type { DnDSceneEntity } from '@vtt/shared/system/dnd.js';

import type { ActorSaveInfo, SavingThrowResult } from './spellResolutionShared';

import { resolveActorStats, SAVE_TYPE_LABELS } from '@vtt/shared/system/dnd.js';

import { useModalManager } from '@/shared_ui/composables/useModalManager';
import { useChatStore } from '@/stores/chatStore';
import { useDiceRollerStore } from '@/stores/diceRollerStore';

import { determineRollMode, resolveAutoSaves } from './spellResolutionShared';

/**
 * Композабл для обработки спасбросков от заклинаний.
 */
export function useSpellSavingThrows() {
  const diceRollerStore = useDiceRollerStore();
  const chatStore = useChatStore();
  const { openModal } = useModalManager();

  /**
   * Рассчитывает модификатор спасброска актора с учётом Active Effects.
   *
   * @param entity - сущность-цель
   * @param saveAbility - характеристика спасброска
   * @returns модификатор спасброска и флаги (преимущество/помеха/автопровал)
   */
  function getActorSaveInfo(
    entity: SceneEntity,
    saveAbility: AbilityType,
  ): ActorSaveInfo {
    const stats = resolveActorStats(entity as DnDSceneEntity);

    const modifier = stats.saves[saveAbility] ?? 0;

    // Проверяем флаги преимущества/помехи на спасброски.
    // Шаблонные строки уже получают точный тип `save.*.${AbilityType}`
    // из `saveAbility: AbilityType` — приведение типов не требуется.
    const hasAdvantage =
      stats.activeFlags.has('save.advantage')
      || stats.activeFlags.has(`save.advantage.${saveAbility}`);

    const hasDisadvantage =
      stats.activeFlags.has('save.disadvantage')
      || stats.activeFlags.has(`save.disadvantage.${saveAbility}`);

    const autoFail = stats.activeFlags.has(`save.autoFail.${saveAbility}`);

    return { modifier, hasAdvantage, hasDisadvantage, autoFail };
  }

  /**
   * Бросает спасбросок за актора автоматически.
   *
   * @param entity - сущность-цель
   * @param saveAbility - характеристика спасброска
   * @param saveDC - сложность спасброска
   * @returns результат спасброска
   */
  function rollSavingThrow(
    entity: SceneEntity,
    saveAbility: AbilityType,
    saveDC: number,
  ): SavingThrowResult {
    const { modifier, hasAdvantage, hasDisadvantage, autoFail } =
      getActorSaveInfo(entity, saveAbility);

    if (autoFail) {
      return { roll: 1, modifier, total: 1 + modifier, passed: false };
    }

    // Определяем формулу (преимущество/помеха)
    let formula = '1к20';

    if (hasAdvantage && !hasDisadvantage) {
      formula = '2к20вл1';
    } else if (hasDisadvantage && !hasAdvantage) {
      formula = '2к20ул1';
    }

    if (modifier !== 0) {
      const sign = modifier >= 0 ? '+' : '';

      formula += `${sign}${modifier}`;
    }

    const rollData = diceRollerStore.parseAndRoll(formula);
    const total = rollData.total;
    const passed = total >= saveDC;

    // Отправляем бросок спасброска в чат
    const saveLabel = SAVE_TYPE_LABELS[saveAbility] ?? saveAbility;

    rollData.label = `Спасбросок ${saveLabel} — ${entity.name}`;

    if (passed) {
      rollData.label += ' ✓ Успех';
    } else {
      rollData.label += ' ✗ Провал';
    }

    chatStore.sendMessage(formula, 'roll', rollData);

    // Извлекаем значение первого (или лучшего/худшего) кубика
    const dieRoll = rollData.dice[0]?.values[0] ?? 0;

    return { roll: dieRoll, modifier, total, passed };
  }

  /**
   * Запрашивает ручной бросок спасброска через DiceRollModal.
   * Открывает модалку с предзаполненным модификатором и ждёт результат.
   *
   * @param entity - сущность-цель
   * @param saveAbility - характеристика спасброска
   * @param saveDC - сложность спасброска
   * @returns промис с результатом спасброска
   */
  function requestManualSavingThrow(
    entity: SceneEntity,
    saveAbility: AbilityType,
    saveDC: number,
  ): Promise<SavingThrowResult> {
    return new Promise((resolve) => {
      const { modifier, hasAdvantage, hasDisadvantage, autoFail } =
        getActorSaveInfo(entity, saveAbility);

      const saveLabel = SAVE_TYPE_LABELS[saveAbility] ?? saveAbility;
      const rollMode = determineRollMode(hasAdvantage, hasDisadvantage);

      openModal('DiceRollModal', {
        allowMultiple: true,
        title: `Спасбросок ${saveLabel} — ${entity.name} (DC ${saveDC})`,
        rollLabel: `Спасбросок ${saveLabel} — ${entity.name}`,
        rollButtonText: 'Бросить спасбросок',
        modifier,
        initialRollMode: rollMode,
        autoFail,
        targetDc: saveDC,
        onRoll: (total: number) => {
          const passed = !autoFail && total >= saveDC;

          resolve({
            roll: total - modifier,
            modifier,
            total,
            passed,
          });
        },
      });
    });
  }

  /**
   * Разрешает спасбросок цели с учётом режима `autoSaves`.
   *
   * Существа и сущности с включёнными автоспасбросками кидают автоматически
   * (`rollSavingThrow`), PC с `autoSaves: false` — вручную через DiceRollModal
   * (`requestManualSavingThrow`).
   *
   * @param entity - сущность-цель
   * @param saveAbility - характеристика спасброска
   * @param saveDC - сложность спасброска
   * @returns промис с результатом спасброска
   */
  function resolveSavingThrowForTarget(
    entity: SceneEntity,
    saveAbility: AbilityType,
    saveDC: number,
  ): Promise<SavingThrowResult> {
    if (resolveAutoSaves(entity)) {
      return Promise.resolve(rollSavingThrow(entity, saveAbility, saveDC));
    }

    return requestManualSavingThrow(entity, saveAbility, saveDC);
  }

  return {
    getActorSaveInfo,
    rollSavingThrow,
    requestManualSavingThrow,
    resolveSavingThrowForTarget,
  };
}
