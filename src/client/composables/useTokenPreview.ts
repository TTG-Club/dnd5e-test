/**
 * Композабл превью токена в модалках настроек (актёр и существо).
 *
 * Инкапсулирует общую логику предпросмотра токена:
 * - вычисление отображаемого размера с учётом размера существа и ограничения,
 *   чтобы крупные токены целиком помещались в область превью;
 * - CSS-трансформацию изображения токена (позиция, зум, поворот);
 * - перетаскивание изображения мышью и зум колесом.
 */
import type { ComputedRef, Ref } from 'vue';

import { computed, onScopeDispose, ref } from 'vue';

import { TOKEN_PREVIEW_MAX_SIZE, TOKEN_PREVIEW_SIZE } from '@/core/tokenConsts';

/** Минимальный зум изображения внутри токена */
const TEXTURE_SCALE_MIN = 0.1;

/** Максимальный зум изображения внутри токена */
const TEXTURE_SCALE_MAX = 5;

/** Чувствительность зума изображения колесом мыши */
const TEXTURE_WHEEL_SENSITIVITY = 0.001;

/** Подмножество настроек токена, необходимое для превью */
export interface TokenPreviewSettings {
  /** Множитель размера токена (размер существа: 1 — средний, 2 — большой и т.д.) */
  scale: number;
  /** Зум изображения внутри токена */
  textureScale: number;
  /** Смещение изображения по X (0..1, где 0.5 — центр) */
  textureX: number;
  /** Смещение изображения по Y (0..1, где 0.5 — центр) */
  textureY: number;
  /** Поворот изображения в градусах */
  rotation: number;
}

/** Возвращаемое composable API превью токена */
export interface UseTokenPreviewReturn {
  /** Отображаемый размер токена в превью (px), ограниченный для крупных существ */
  previewTokenSize: ComputedRef<number>;
  /** CSS-стиль трансформации изображения токена */
  tokenImageStyle: ComputedRef<{ transform: string; transformOrigin: string }>;
  /** Начать перетаскивание изображения токена */
  handleTokenMouseDown: (event: MouseEvent) => void;
  /** Зум изображения токена колесом мыши */
  handleTokenWheel: (event: WheelEvent) => void;
}

/**
 * Превью токена для модалок настроек.
 *
 * @param tokenSettings - Реактивные настройки токена (минимум поля {@link TokenPreviewSettings}).
 * @param canEdit - Может ли текущий пользователь редактировать токен.
 * @returns Размер превью, стиль изображения и обработчики перетаскивания/зума.
 */
export function useTokenPreview<TSettings extends TokenPreviewSettings>(
  tokenSettings: Ref<TSettings>,
  canEdit: ComputedRef<boolean>,
): UseTokenPreviewReturn {
  // Отображаемый размер токена: масштабируется на размер существа
  // (Большой ×2, Огромный ×3 и т.д.), но ограничен, чтобы крупные токены
  // целиком помещались в область превью.
  const previewTokenSize = computed(() =>
    Math.min(
      TOKEN_PREVIEW_SIZE * tokenSettings.value.scale,
      TOKEN_PREVIEW_MAX_SIZE,
    ),
  );

  const tokenImageStyle = computed(() => {
    const { textureScale, textureX, textureY, rotation } = tokenSettings.value;

    // Порядок: translate → scale → rotate (CSS читает справа налево).
    // translate последний = независим от scale, как в PixiJS.
    return {
      transform: `translate(${(textureX - 0.5) * 100}%, ${(textureY - 0.5) * 100}%) scale(${textureScale}) rotate(${rotation}deg)`,
      transformOrigin: 'center center',
    };
  });

  const isDraggingToken = ref(false);
  const dragStart = ref({ x: 0, y: 0 });
  const initialTexturePos = ref({ x: 0, y: 0 });

  function handleTokenMouseMove(event: MouseEvent) {
    if (!isDraggingToken.value) {
      return;
    }

    const deltaX = event.clientX - dragStart.value.x;
    const deltaY = event.clientY - dragStart.value.y;

    // Чувствительность зависит от отображаемого размера, чтобы перетаскивание
    // ощущалось 1:1 независимо от размера токена.
    const sensitivity = 1 / previewTokenSize.value;

    tokenSettings.value.textureX =
      initialTexturePos.value.x + deltaX * sensitivity;

    tokenSettings.value.textureY =
      initialTexturePos.value.y + deltaY * sensitivity;
  }

  function stopDragging() {
    isDraggingToken.value = false;
    window.removeEventListener('mousemove', handleTokenMouseMove);
    window.removeEventListener('mouseup', stopDragging);
  }

  function handleTokenMouseDown(event: MouseEvent) {
    if (!canEdit.value) {
      return;
    }

    isDraggingToken.value = true;
    dragStart.value = { x: event.clientX, y: event.clientY };

    initialTexturePos.value = {
      x: tokenSettings.value.textureX,
      y: tokenSettings.value.textureY,
    };

    window.addEventListener('mousemove', handleTokenMouseMove);
    window.addEventListener('mouseup', stopDragging);
  }

  function handleTokenWheel(event: WheelEvent) {
    if (!canEdit.value) {
      return;
    }

    const delta = event.deltaY * -TEXTURE_WHEEL_SENSITIVITY;

    tokenSettings.value.textureScale = Math.max(
      TEXTURE_SCALE_MIN,
      Math.min(TEXTURE_SCALE_MAX, tokenSettings.value.textureScale + delta),
    );
  }

  // Снимаем глобальные слушатели, если компонент размонтирован во время перетаскивания.
  onScopeDispose(stopDragging);

  return {
    previewTokenSize,
    tokenImageStyle,
    handleTokenMouseDown,
    handleTokenWheel,
  };
}
