<script setup lang="ts">
  import type { Feature } from '@vtt/shared';
  import type { BackgroundDefinition } from '@vtt/shared/system/dnd.js';

  import { SKILLS_LABELS, TOOLS_LABELS } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';

  const props = defineProps<{
    backgroundDefinition: BackgroundDefinition;
    featsData: Feature[];
  }>();

  const selectedFeatId = defineModel<string>('selectedFeatId');

  const { openModal } = useModalManager();

  function openFeatDescription() {
    const featId =
      selectedFeatId.value || props.backgroundDefinition.featGrant.featId;

    if (!featId) {
      return;
    }

    const feat = props.featsData.find((feat) => feat.id === featId);

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

  // Для SelectMenu нужно преобразовать в объекты { id: string, name: string }
  const featChoiceOptions = computed(() => {
    if (!props.backgroundDefinition.featGrant.featChoices) {
      return [];
    }

    return props.backgroundDefinition.featGrant.featChoices.map((id) => {
      const feat = props.featsData.find((feat) => feat.id === id);

      return {
        id,
        name: feat ? feat.name : id,
      };
    });
  });
</script>

<template>
  <div class="space-y-6">
    <ItemDescriptionRenderer :content="backgroundDefinition.description" />

    <!-- Резюме -->
    <div class="grid grid-cols-2 gap-2">
      <div
        class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5"
      >
        <span
          class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
          >Навыки</span
        >

        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <UBadge
            v-for="skill in backgroundDefinition.skillGrant.skills"
            :key="skill"
            variant="subtle"
            color="neutral"
            size="sm"
          >
            {{ SKILLS_LABELS[skill] }}
          </UBadge>
        </div>
      </div>

      <div
        class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5"
      >
        <span
          class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
          >Инструменты</span
        >

        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <UBadge
            v-for="tool in backgroundDefinition.toolGrant.items"
            :key="tool"
            variant="subtle"
            color="neutral"
            size="sm"
          >
            {{ TOOLS_LABELS[tool] || tool }}
          </UBadge>

          <span
            v-if="backgroundDefinition.toolGrant.choices?.count"
            class="text-sm font-semibold text-highlighted"
          >
            {{ backgroundDefinition.toolGrant.items.length > 0 ? 'и ' : ''
            }}{{ backgroundDefinition.toolGrant.choices.count }} на выбор из
            списка
          </span>
        </div>
      </div>

      <div
        class="col-span-2 flex flex-col gap-2 rounded-lg border border-default/50 bg-elevated/30 p-3"
      >
        <span
          class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
        >
          Черта
        </span>

        <template v-if="backgroundDefinition.featGrant.featChoices?.length">
          <USelectMenu
            v-model="selectedFeatId"
            :options="featChoiceOptions"
            value-attribute="id"
            option-attribute="name"
            class="w-full"
            placeholder="Выберите черту"
          />

          <UButton
            v-if="selectedFeatId"
            variant="link"
            color="primary"
            class="h-auto self-start p-0"
            @click.left.exact.prevent="openFeatDescription"
          >
            Показать описание черты
          </UButton>
        </template>

        <template v-else>
          <button
            class="self-start text-left text-sm font-medium text-healing hover:text-healing/80 hover:underline"
            @click.left.exact.prevent="openFeatDescription"
          >
            {{ backgroundDefinition.featGrant.featName }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
