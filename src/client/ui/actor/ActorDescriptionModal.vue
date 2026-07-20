<script setup lang="ts">
  import type { ChatCardType } from '@vtt/shared';

  import { computed } from 'vue';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';
  import SendToChatButton from '@/shared_ui/components/SendToChatButton.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useSourceLabels } from '@/systems/dnd5e/composables/useSourceLabel';

  /** Бейдж внутри поля */
  export interface DescriptionBadge {
    text: string;
    color?: string;
    variant?: string;
    size?: string;
    mono?: boolean;
  }

  /** Поле данных для отображения */
  export interface DescriptionField {
    /** Иконка Fluent слева */
    icon?: string;
    /** Текстовый лейбл */
    label?: string;
    /** Бейджи */
    badges?: DescriptionBadge[];
    /** Текст после бейджей */
    suffix?: string;
    /** Размер строки: 'sm' (по умолчанию, серый) или 'md' (обычный) */
    size?: 'sm' | 'md';
  }

  interface Props {
    open: boolean;
    title: string;
    subtitle?: string;
    zIndex: number;
    /** Массив полей-строк с данными */
    fields?: DescriptionField[];
    /** Основной текст описания */
    description?: string;
    /**
     * Текст вкладки «Автоматизация» (Markdown) — что сущность выдаёт
     * автоматически. Если задан, тело модалки делится на две вкладки:
     * «Описание» и «Автоматизация». Используется в просмотре черты.
     */
    automation?: string;
    /** Готовый лейбл источника — отображается в header (приоритетнее sourceKey) */
    sourceLabel?: string;
    /** Ключ источника из sources.json — подпись резолвится автоматически */
    sourceKey?: string;
    /** Принадлежит ли к SRD — показывает бейдж в header */
    isSRD?: boolean;
    /** Данные для кнопки отправки в чат */
    shareCard?: {
      cardType: ChatCardType;
      title: string;
      payload: string;
    };
    /** Показывать кнопку копирования в предметы */
    showCopyButton?: boolean;
    /** Дополнительный информационный блок (например, для повторяемых свойств) */
    alert?: {
      title?: string;
      description: string;
      color?: 'primary' | 'warning' | 'info' | 'success' | 'error' | 'neutral';
      icon?: string;
    };
  }

  const props = withDefaults(defineProps<Props>(), {
    subtitle: undefined,
    fields: () => [],
    description: '',
    automation: undefined,
    sourceLabel: undefined,
    sourceKey: undefined,
    isSRD: false,
    shareCard: undefined,
    showCopyButton: false,
    alert: undefined,
  });

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'copy': [];
    'bring-to-front': [];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const { getSourceLabel } = useSourceLabels();

  /** Подпись источника: явная или резолв по ключу */
  const resolvedSourceLabel = computed(
    () => props.sourceLabel ?? getSourceLabel(props.sourceKey),
  );

  /** Вкладки тела (когда задана автоматизация). */
  const descriptionTabs = [
    { label: 'Описание', slot: 'description' as const },
    { label: 'Автоматизация', slot: 'automation' as const },
  ];
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="true"
    :resizable="true"
    :blocking="false"
    :initial-width="800"
    :initial-height="400"
    :min-width="400"
    :min-height="200"
    :title="title"
    :subtitle="subtitle"
    :z-index="zIndex"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #header-actions>
      <UBadge
        v-if="resolvedSourceLabel"
        color="neutral"
        variant="subtle"
        size="sm"
      >
        {{ resolvedSourceLabel }}
      </UBadge>

      <UBadge
        v-if="isSRD"
        color="primary"
        variant="subtle"
        size="sm"
      >
        SRD
      </UBadge>

      <UTooltip
        v-if="showCopyButton"
        text="Скопировать в предметы"
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
        v-if="shareCard"
        :card-type="shareCard.cardType"
        :title="shareCard.title"
        :payload="shareCard.payload"
      />
    </template>

    <template #body>
      <div class="space-y-3">
        <div
          v-for="(field, index) in fields"
          :key="index"
          class="flex items-center gap-2"
          :class="field.size === 'md' ? '' : 'text-xs text-muted'"
        >
          <UIcon
            v-if="field.icon"
            :name="field.icon"
            class="h-3.5 w-3.5 shrink-0"
          />

          <span v-if="field.label">{{ field.label }}</span>

          <UBadge
            v-for="(badge, badgeIndex) in field.badges"
            :key="badgeIndex"
            :color="badge.color ?? 'neutral'"
            :variant="badge.variant ?? 'subtle'"
            :size="badge.size ?? 'sm'"
            :class="badge.mono ? 'font-mono' : ''"
          >
            {{ badge.text }}
          </UBadge>

          <span v-if="field.suffix">{{ field.suffix }}</span>
        </div>

        <!-- Две вкладки: «Описание» и «Автоматизация» (если задана). -->
        <UTabs
          v-if="automation"
          :items="descriptionTabs"
          variant="pill"
          :ui="{ list: 'mb-3' }"
        >
          <template #description>
            <ItemDescriptionRenderer
              v-if="description"
              :content="description"
            />

            <UAlert
              v-if="alert"
              :title="alert.title"
              :description="alert.description"
              :color="alert.color ?? 'warning'"
              :icon="alert.icon"
              variant="soft"
              class="mt-4"
            />
          </template>

          <template #automation>
            <ItemDescriptionRenderer :content="automation" />
          </template>
        </UTabs>

        <!-- Без автоматизации — обычный вид (описание + инфо-блок). -->
        <template v-else>
          <ItemDescriptionRenderer
            v-if="description"
            :content="description"
          />

          <UAlert
            v-if="alert"
            :title="alert.title"
            :description="alert.description"
            :color="alert.color ?? 'warning'"
            :icon="alert.icon"
            variant="soft"
            class="mt-4"
          />
        </template>
      </div>
    </template>
  </UDraggableModal>
</template>
