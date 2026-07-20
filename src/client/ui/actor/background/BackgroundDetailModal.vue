<script setup lang="ts">
  import type { Feature } from '@vtt/shared';
  import type { BackgroundDefinition } from '@vtt/shared/system/dnd.js';

  import {
    ABILITY_LABELS,
    buildFeatGrantsSummary,
    SKILLS_LABELS,
    TOOLS_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import { loadCompendiumKind } from '@/core/compendiumDataClient';
  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';
  import SendToChatButton from '@/shared_ui/components/SendToChatButton.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { useChatStore } from '@/stores/chatStore';
  import { useSourceLabels } from '@/systems/dnd5e/composables/useSourceLabel';

  const props = defineProps<{
    open: boolean;
    backgroundDefinition?: BackgroundDefinition | null;
    item?: BackgroundDefinition | null;
    zIndex?: number;
    positionOffset?: number;
    showCopyButton?: boolean;
  }>();

  const data = computed(() => props.item ?? props.backgroundDefinition);

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'bring-to-front': [];
    'copy': [];
  }>();

  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  /** Список характеристик с русскими названиями */
  const abilitiesDisplay = computed(() => {
    if (!data.value?.abilityGrant?.abilities) {
      return '';
    }

    return data.value.abilityGrant.abilities
      .map((ability) => ABILITY_LABELS[ability] || ability)
      .join(', ');
  });

  /** Список навыков с русскими названиями */
  const skillsDisplay = computed(() => {
    if (!data.value?.skillGrant?.skills) {
      return '';
    }

    return data.value.skillGrant.skills
      .map((skill) => SKILLS_LABELS[skill] || skill)
      .join(', ');
  });

  /** Строка инструментов */
  const toolsDisplay = computed(() => {
    if (!data.value?.toolGrant) {
      return '';
    }

    let toolsStr = (data.value.toolGrant.items || [])
      .map((tool) => TOOLS_LABELS[tool] || tool)
      .join(', ');

    if (data.value.toolGrant.choices?.count) {
      if (toolsStr) {
        toolsStr += ' и ';
      }

      toolsStr += `${data.value.toolGrant.choices.count} на выбор из списка`;
    }

    return toolsStr;
  });

  /**
   * Авто-сводка расширenных даров (владения/защиты/языки/тёмное зрение/
   * заклинания/эффекты) из `featData`+`activeEffects`. Пусто — блок скрыт.
   */
  const grantsSummary = computed(() =>
    data.value ? buildFeatGrantsSummary(data.value) : '',
  );

  const { openModal } = useModalManager();
  const { getSourceLabel } = useSourceLabels();
  const chatStore = useChatStore();

  /**
   * Проверяет, что запись компендиума — черта.
   *
   * @param value - запись компендиума
   * @returns true, если запись имеет форму черты
   */
  function isFeatureEntry(value: unknown): value is Feature {
    return (
      typeof value === 'object'
      && value !== null
      && 'id' in value
      && 'name' in value
    );
  }

  async function openFeatDescription(featIdOrFallback?: string): Promise<void> {
    if (!featIdOrFallback && !data.value?.featGrant?.featId) {
      return;
    }

    const featId = data.value?.featGrant?.featId || featIdOrFallback;

    const socket = chatStore.getSocket();

    if (!socket) {
      return;
    }

    const feats = (await loadCompendiumKind(socket, 'feat')).filter(
      isFeatureEntry,
    );

    const feat = feats.find((entry) => entry.id === featId);

    if (!feat) {
      return;
    }

    openModal('ActorDescriptionModal', {
      _modalKey: feat.id,
      title: feat.name,
      subtitle: feat.nameEn || '',
      sourceKey: feat.sourceKey,
      description: feat.description || '',
    });
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="data ? data.name : 'Предыстория'"
    :subtitle="data?.nameEn || undefined"
    :initial-width="800"
    :initial-height="600"
    :min-width="400"
    :min-height="400"
    :resizable="true"
    :z-index="zIndex"
    :saved-position="initialPosition"
    @update:open="emit('update:open', $event)"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #header-actions>
      <UBadge
        v-if="getSourceLabel(data?.sourceKey)"
        :label="getSourceLabel(data?.sourceKey)"
        color="neutral"
        variant="subtle"
        size="sm"
      />

      <UBadge
        v-if="data?.isSRD !== false"
        label="SRD"
        color="primary"
        variant="subtle"
        size="sm"
      />

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
        v-if="data"
        card-type="background"
        :title="data.name"
        :payload="JSON.stringify(data)"
      />
    </template>

    <template #body>
      <div
        v-if="data"
        class="flex flex-col gap-4"
      >
        <!-- Описание -->
        <ItemDescriptionRenderer :content="data.description" />

        <!-- Основные характеристики в виде сетки -->
        <div class="grid grid-cols-3 gap-2">
          <!-- Характеристики -->
          <div
            class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Характеристики</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{ abilitiesDisplay }}
            </p>
          </div>

          <!-- Навыки -->
          <div
            class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Навыки</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{ skillsDisplay }}
            </p>
          </div>

          <!-- Инструменты -->
          <div
            v-if="
              data.toolGrant?.items?.length || data.toolGrant?.choices?.count
            "
            class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Инструменты</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{ toolsDisplay }}
            </p>
          </div>
        </div>

        <!-- Черта от предыстории -->
        <div
          v-if="data.featGrant"
          class="rounded-lg border border-default/50 p-4"
        >
          <h3 class="mb-3 text-sm font-semibold tracking-wider text-primary">
            ЧЕРТА
          </h3>

          <!-- Конкретная черта -->
          <div
            v-if="data.featGrant.featId"
            class="flex items-center justify-between rounded bg-elevated/50 px-3 py-2 transition-colors hover:bg-elevated"
          >
            <span class="text-sm font-medium text-highlighted">
              {{ data.featGrant.featName }}
              <span class="text-xs text-dimmed"
                >({{ data.featGrant.featNameEn }})</span
              >
            </span>

            <UButton
              icon="tabler:info-circle"
              color="primary"
              variant="ghost"
              size="2xs"
              @click="openFeatDescription()"
            />
          </div>

          <!-- Выбор черты -->
          <div
            v-else-if="data.featGrant.featChoices?.length"
            class="space-y-2"
          >
            <p class="text-xs text-muted">На выбор одна из черт:</p>

            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="choice in data.featGrant.featChoices"
                :key="choice"
                color="neutral"
                variant="soft"
                class="cursor-pointer transition-colors hover:bg-accented"
                @click="openFeatDescription(choice)"
              >
                {{ choice }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Дополнительные дары (featData / activeEffects) -->
        <div
          v-if="grantsSummary"
          class="rounded-lg border border-default/50 p-4"
        >
          <h3 class="mb-3 text-sm font-semibold tracking-wider text-primary">
            ДОПОЛНИТЕЛЬНЫЕ ДАРЫ
          </h3>

          <ItemDescriptionRenderer :content="grantsSummary" />
        </div>

        <!-- Стартовое снаряжение -->
        <div
          v-if="data.equipmentOptions?.length"
          class="rounded-lg border border-default/50 p-4"
        >
          <h3 class="mb-3 text-sm font-semibold tracking-wider text-primary">
            СНАРЯЖЕНИЕ
          </h3>

          <ul class="space-y-3">
            <li
              v-for="(option, idx) in data.equipmentOptions"
              :key="idx"
              class="flex items-start gap-2"
            >
              <div
                class="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-elevated text-[10px] text-muted"
              >
                {{ idx === 0 ? 'А' : 'Б' }}
              </div>

              <p class="text-sm text-toned">
                <ItemDescriptionRenderer :content="option.description" />
              </p>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
