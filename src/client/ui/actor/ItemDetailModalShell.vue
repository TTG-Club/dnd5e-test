<script setup lang="ts">
  import type { ChatCardType } from '@vtt/shared';

  import { computed } from 'vue';

  import SendToChatButton from '@/shared_ui/components/SendToChatButton.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';

  import { useSourceLabel } from '../../composables/useSourceLabel';

  const props = defineProps<{
    /** Открыто ли модальное окно */
    open: boolean;
    /** Заголовок — название сущности */
    title: string;
    /** Подзаголовок — английское название */
    subtitle?: string;
    /** Ключ источника контента для бейджа (PHB, DMG…) */
    sourceKey?: string;
    /**
     * Является ли контент SRD (для бейджа «SRD»). Имя `isSrd`, а не `isSRD`,
     * намеренно: kebab-привязка `:is-srd` камелизуется в `isSrd` — с тремя
     * заглавными подряд (`isSRD`) проп не сопоставился бы и бейдж не появлялся.
     */
    isSrd?: boolean;
    /** Тип карточки для кнопки «Поделиться в чат» */
    cardType: ChatCardType;
    /** JSON-payload для кнопки «Поделиться в чат» */
    chatPayload: string;
    /** Z-index модалки (управляется родителем для bring-to-front) */
    zIndex?: number;
    /** Смещение позиции для каскадного расположения */
    positionOffset?: number;
    /** Показывать кнопку «Скопировать» */
    showCopyButton?: boolean;
    /** Показывать кнопку «Применить» (для заклинаний) */
    showCastButton?: boolean;
    /** Текст тултипа кнопки «Скопировать» (по умолчанию «Скопировать») */
    copyTooltip?: string;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'copy': [];
    'cast': [];
    'bring-to-front': [];
  }>();

  /**
   * Мемоизированная начальная позиция для каскадного расположения.
   * Computed не пересоздаёт объект при каждом re-render, предотвращая ложное
   * срабатывание savedPosition watch в UDraggableModal.
   */
  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  const { sourceLabel } = useSourceLabel(() => props.sourceKey);
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="title"
    :subtitle="subtitle || undefined"
    :initial-width="480"
    :min-width="300"
    :min-height="200"
    :resizable="false"
    :z-index="zIndex"
    :saved-position="initialPosition"
    @update:open="emit('update:open', $event)"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #header-actions>
      <UBadge
        v-if="sourceLabel"
        :label="sourceLabel"
        color="neutral"
        variant="subtle"
        size="sm"
      />

      <UBadge
        v-if="isSrd"
        label="SRD"
        color="primary"
        variant="subtle"
        size="sm"
      />

      <!-- Доп. действия конкретной модалки (напр. «Атаковать» у действий существ) -->
      <slot name="header-extra" />

      <UTooltip
        v-if="showCastButton"
        text="Применить заклинание"
      >
        <UButton
          icon="tabler:wand"
          size="xs"
          color="success"
          variant="soft"
          @click.left.exact.prevent="emit('cast')"
        />
      </UTooltip>

      <UTooltip
        v-if="showCopyButton"
        :text="copyTooltip || 'Скопировать'"
      >
        <UButton
          icon="tabler:copy"
          size="xs"
          color="primary"
          variant="soft"
          @click.left.exact.prevent="emit('copy')"
        />
      </UTooltip>

      <SendToChatButton
        v-if="chatPayload"
        :card-type="cardType"
        :title="title"
        :payload="chatPayload"
      />
    </template>

    <template #body>
      <slot name="body" />
    </template>
  </UDraggableModal>
</template>
