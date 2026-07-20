import type { Feature } from '@vtt/shared';
import type { GameItem } from '@vtt/shared/system/dnd.js';

import { systemRegistry } from '@vtt/shared';

import { useModalManager } from '@/shared_ui/composables/useModalManager';

/**
 * Композабл для открытия модального окна просмотра черты (D&D 5e).
 * Живёт в системе — «черта» — понятие D&D. Ядро (панель предметов, компендиум)
 * открывает просмотр черты через хук `openDetail` реестра карточек, не импортируя
 * этот файл напрямую (иначе образовалось бы ребро `core → systems`).
 */
export function useFeatModal() {
  const { openModal } = useModalManager();

  /**
   * Открывает стандартное описание черты (ActorDescriptionModal).
   * @param feat - черта (Feature из листа персонажа или GameItem из предметов)
   * @param options - дополнительные настройки (напр. кнопка копирования из компендиума)
   * @param options.showCopyButton - показывать ли кнопку копирования в инвентарь
   * @param options.onCopy - колбэк при копировании
   */
  function openFeatDescription(
    feat: Feature | GameItem,
    options?: { showCopyButton?: boolean; onCopy?: () => void },
  ) {
    const badges = [];

    let alertConfig:
      | { title?: string; description: string; color: 'warning'; icon?: string }
      | undefined;

    if (feat.repeatable) {
      badges.push({ text: 'Повторяемая', color: 'warning' });

      alertConfig = {
        title: 'Повторяемая черта',
        description:
          'Вы можете выбирать эту черту больше 1 раза, но каждый раз вы должны выбирать другой список заклинаний.',
        color: 'warning',
        icon: 'tabler:repeat',
      };
    }

    const nameEn = 'nameEn' in feat ? feat.nameEn : undefined;

    // Описание остаётся чистой прозой; механические дары выводятся отдельным
    // табом «Автоматизация» (сводка собирается из настроек черты). Пусто — таба
    // нет (модалка показывает только описание).
    const automation =
      systemRegistry.getActiveSystem()?.getFeatGrantsSummary?.(feat) ?? '';

    openModal('ActorDescriptionModal', {
      _modalKey: feat.id,
      title: feat.name,
      subtitle: nameEn || undefined,
      description: feat.description,
      automation: automation || undefined,
      sourceKey: feat.sourceKey,
      isSRD: feat.isSRD ?? false,
      fields: badges.length > 0 ? [{ badges }] : [],
      alert: alertConfig,
      showCopyButton: options?.showCopyButton,
      onCopy: options?.onCopy,
      shareCard: {
        cardType: 'feature',
        title: feat.name,
        payload: JSON.stringify({ ...feat, type: 'feat', featureType: 'feat' }),
      },
    });
  }

  return { openFeatDescription };
}
