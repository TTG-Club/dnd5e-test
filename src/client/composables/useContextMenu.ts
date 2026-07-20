import { computed, ref } from 'vue';

/** Действие контекстного меню */
export type ContextMenuAction = 'copy' | 'edit' | 'delete';

/** Пропсы, необходимые для контекстного меню */
export interface ContextMenuProps {
  showCopy?: boolean;
  showEdit?: boolean;
  showDelete?: boolean;
}

/**
 * Composable для управления контекстным меню элемента списка.
 *
 * Инкапсулирует состояние открытия, позицию и действия меню.
 * Используется в WeaponListItem, ToolListItem, EquipmentListItem,
 * FeatListItem, SpellListItem, BackgroundListItem.
 *
 * @param props - реактивный источник пропсов с флагами видимости пунктов
 * @param emit - функция эмита событий компонента (Vue defineEmits)
 */
export function useContextMenu(
  props: ContextMenuProps,
  emit: {
    (event: 'copy'): void;
    (event: 'edit'): void;
    (event: 'delete'): void;
  },
) {
  const isMenuOpen = ref(false);
  const menuX = ref(0);
  const menuY = ref(0);

  /** Есть ли пункты для контекстного меню */
  const hasContextMenu = computed(
    () => props.showCopy || props.showEdit || props.showDelete,
  );

  /**
   * Показывает контекстное меню по координатам клика.
   *
   * @param event - событие contextmenu
   */
  function openContextMenu(event: MouseEvent): void {
    if (!hasContextMenu.value) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    menuX.value = event.clientX;
    menuY.value = event.clientY;
    isMenuOpen.value = true;
  }

  /**
   * Обработчик выбора пункта меню.
   *
   * @param action - действие ('copy' | 'edit' | 'delete')
   */
  function handleAction(action: ContextMenuAction): void {
    isMenuOpen.value = false;

    if (action === 'copy') {
      emit('copy');
    } else if (action === 'edit') {
      emit('edit');
    } else {
      emit('delete');
    }
  }

  /** Закрывает меню */
  function closeMenu(): void {
    isMenuOpen.value = false;
  }

  return {
    isMenuOpen,
    menuX,
    menuY,
    hasContextMenu,
    openContextMenu,
    handleAction,
    closeMenu,
  };
}
