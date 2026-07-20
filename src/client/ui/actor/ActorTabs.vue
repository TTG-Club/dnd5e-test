<script setup lang="ts">
  import type { Actor } from '@vtt/shared/system/dnd.js';

  import type { ExtensionRegistration } from '@/core/extensionRegistry';

  import { computed, toRef } from 'vue';

  import { getExtensions } from '@/core/extensionRegistry';
  import { useActiveTab } from '@/shared_ui/composables/useActiveTab';
  import { componentHasProp } from '@/shared_ui/utils/componentUtils';

  import { useResolvedStats } from '../../composables/useResolvedStats';
  import ActorEffectsTab from './tabs/ActorEffectsTab.vue';
  import ActorEquipmentTab from './tabs/ActorEquipmentTab.vue';
  import ActorFeaturesTab from './tabs/ActorFeaturesTab.vue';
  import ActorNotesTab from './tabs/ActorNotesTab.vue';
  import ActorSpellsTab from './tabs/ActorSpellsTab.vue';

  interface Props {
    actor: Actor;
    isEditMode: boolean;
    isSpellDragOver?: boolean;
    isEquipmentDragOver?: boolean;
    isFeatureDragOver?: boolean;
  }

  const props = withDefaults(defineProps<Props>(), {
    isSpellDragOver: false,
    isEquipmentDragOver: false,
    isFeatureDragOver: false,
  });

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
    'immediate-save': [];
  }>();

  const { resolvedStats } = useResolvedStats(toRef(() => props.actor));

  // Состояние активной вкладки (сохраняется per-actor между переоткрытиями)
  const { activeTab, setActiveTab } = useActiveTab(
    'actor-sheet',
    toRef(() => props.actor.id),
    'equipment',
  );

  /** Суммарный вес всех предметов в инвентаре */
  const totalWeight = computed(() => {
    return props.actor.equipment.reduce(
      (sum, item) => sum + (item.weight ?? 0) * (item.quantity ?? 1),
      0,
    );
  });

  /** Максимальная грузоподъёмность: Сила × 15 × множитель размера (D&D 5e 2024) */
  const carryingCapacity = computed(() => {
    const strength =
      resolvedStats.value?.abilities.strength
      ?? props.actor.system?.abilities?.strength
      ?? 10;

    const size = props.actor.system?.size ?? 'medium';

    /** Множители грузоподъёмности по размеру */
    const sizeMultiplier: Record<string, number> = {
      small: 1,
      medium: 1,
      large: 2,
      huge: 4,
      gargantuan: 8,
    };

    return strength * 15 * (sizeMultiplier[size] ?? 1);
  });

  /** Перегрузка: текущий вес превышает грузоподъёмность */
  const isOverweight = computed(
    () => totalWeight.value > carryingCapacity.value,
  );

  // Базовые вкладки
  const baseTabs = computed(() => {
    return [
      {
        id: 'equipment',
        label: `Снаряжение (${totalWeight.value} / ${carryingCapacity.value} фнт.)`,
      },
      { id: 'spells', label: 'Заклинания' },
      { id: 'features', label: 'Особенности' },
      { id: 'effects', label: 'Эффекты' },
      { id: 'notes', label: 'Заметки' },
    ];
  });

  /** Вкладки от модулей (зарегистрированные через registerExtension) */
  const extensionTabs = computed(() => getExtensions('actor-sheet:tabs'));

  /** Все вкладки: базовые + от модулей */
  const allTabs = computed(() => [
    ...baseTabs.value,
    ...extensionTabs.value.map((ext) => ({
      id: `ext:${ext.moduleId}`,
      label: ext.label ?? ext.moduleId,
    })),
  ]);

  /** Активное расширение (если выбрана вкладка модуля) */
  const activeExtension = computed(() => {
    if (!activeTab.value.startsWith('ext:')) {
      return null;
    }

    const moduleId = activeTab.value.replace('ext:', '');

    return extensionTabs.value.find((ext) => ext.moduleId === moduleId) ?? null;
  });

  // Проброс обновлений актора
  function handleUpdate(updates: Partial<Actor>) {
    emit('update:actor', updates);
  }

  function getTabClass(tabId: string): string {
    const isActive = activeTab.value === tabId;

    if (tabId === 'spells' && props.isSpellDragOver) {
      return 'border-b-2 border-primary-500 text-primary-400 drop-shadow-[0_0_8px_rgba(var(--color-primary-400),0.8)] filter transition-all duration-300';
    }

    if (tabId === 'equipment' && props.isEquipmentDragOver) {
      return 'border-b-2 border-primary-500 text-primary-400 drop-shadow-[0_0_8px_rgba(var(--color-primary-400),0.8)] filter transition-all duration-300';
    }

    if (tabId === 'features' && props.isFeatureDragOver) {
      return 'border-b-2 border-primary-500 text-primary-400 drop-shadow-[0_0_8px_rgba(var(--color-primary-400),0.8)] filter transition-all duration-300';
    }

    if (tabId === 'equipment' && isOverweight.value) {
      return isActive
        ? 'border-b-2 border-danger text-danger'
        : 'border-b-2 border-transparent text-danger hover:text-danger-muted';
    }

    return isActive
      ? 'border-b-2 border-gold text-gold'
      : 'border-b-2 border-transparent text-muted hover:text-highlighted';
  }

  function getExtensionProps(
    ext: ExtensionRegistration,
  ): Record<string, unknown> {
    const bindProps: Record<string, unknown> = {
      actor: props.actor,
      isEditMode: props.isEditMode,
    };

    if (
      componentHasProp(ext.component, 'moduleId')
      || componentHasProp(ext.component, 'module-id')
    ) {
      bindProps.moduleId = ext.moduleId;
    }

    return bindProps;
  }
</script>

<template>
  <div class="relative flex flex-1 flex-col space-y-4">
    <!-- Overlay удален, вместо этого подсвечиваем кнопку вкладки Заклинания -->
    <!-- Кнопки вкладок -->
    <div class="mb-4 flex gap-4 border-b border-muted/30">
      <button
        v-for="tab in allTabs"
        :key="tab.id"
        :class="[
          'relative pb-2 text-xs font-bold tracking-wider uppercase transition-colors',
          getTabClass(tab.id),
        ]"
        @click.left.exact.prevent="setActiveTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Содержимое вкладок -->
    <div class="flex flex-1 flex-col">
      <ActorEquipmentTab
        v-if="activeTab === 'equipment'"
        :actor="actor"
        :is-edit-mode="isEditMode"
        :is-drag-over="props.isEquipmentDragOver"
        @update:actor="handleUpdate"
        @immediate-save="emit('immediate-save')"
      />

      <ActorSpellsTab
        v-if="activeTab === 'spells'"
        :actor="actor"
        :is-edit-mode="isEditMode"
        :is-drag-over="props.isSpellDragOver"
        @update:actor="handleUpdate"
        @immediate-save="emit('immediate-save')"
      />

      <ActorFeaturesTab
        v-if="activeTab === 'features'"
        :actor="actor"
        :is-edit-mode="isEditMode"
        :is-drag-over="props.isFeatureDragOver"
        @update:actor="handleUpdate"
        @immediate-save="emit('immediate-save')"
      />

      <ActorEffectsTab
        v-if="activeTab === 'effects'"
        :actor="actor"
        :is-edit-mode="isEditMode"
        @update:actor="handleUpdate"
        @immediate-save="emit('immediate-save')"
      />

      <ActorNotesTab
        v-if="activeTab === 'notes'"
        :actor="actor"
        :is-edit-mode="isEditMode"
        @update:actor="handleUpdate"
      />

      <!-- Вкладки от модулей -->
      <component
        :is="activeExtension.component"
        v-if="activeExtension"
        v-bind="getExtensionProps(activeExtension)"
        @update:actor="handleUpdate"
      />
    </div>
  </div>
</template>
