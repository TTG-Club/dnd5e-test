<script setup lang="ts">
  import type {
    ActiveEffect,
    Actor,
    ConditionKey,
    GameItem,
  } from '@vtt/shared/system/dnd.js';

  import {
    buildConditionActiveEffect,
    CONDITIONS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import { useModalManager } from '@/shared_ui/composables/useModalManager';

  import ActiveEffectFormModal from './ActiveEffectFormModal.vue';

  interface Props {
    actor: Actor;
    isEditMode: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
    'immediate-save': [];
  }>();

  // Инициализация локального стейта модалки
  const effectModalId = 'active-effect-form-modal';
  const isEffectModalOpen = ref(false);
  const effectModalZIndex = ref<number | undefined>(undefined);
  const { getNextZIndex } = useModalManager();

  const editingEffect = ref<ActiveEffect | undefined>(undefined);

  /** Вычисляет список кастомных эффектов (не состояния) */
  const customEffects = computed(() => {
    return (props.actor.activeEffects || []).filter(
      (effect) => effect.origin !== 'condition',
    );
  });

  /** Эффект от экипированного предмета с указанием источника */
  interface EquipmentEffectEntry {
    /** Эффект предмета */
    effect: ActiveEffect;
    /** Название предмета-источника */
    itemName: string;
  }

  /** Собирает активные эффекты от экипированных предметов */
  const equipmentEffects = computed<EquipmentEffectEntry[]>(() => {
    const entries: EquipmentEffectEntry[] = [];
    const equipment: GameItem[] = props.actor.equipment ?? [];

    for (const item of equipment) {
      if (!item.equipped || !item.activeEffects) {
        continue;
      }

      for (const itemEffect of item.activeEffects) {
        if (itemEffect.disabled) {
          continue;
        }

        entries.push({
          effect: itemEffect,
          itemName: item.name,
        });
      }
    }

    return entries;
  });

  function createCustomEffect() {
    editingEffect.value = undefined;
    isEffectModalOpen.value = true;
    effectModalZIndex.value = getNextZIndex();
  }

  function editCustomEffect(effect: ActiveEffect) {
    editingEffect.value = effect;
    isEffectModalOpen.value = true;
    effectModalZIndex.value = getNextZIndex();
  }

  function deleteCustomEffect(effectId: string) {
    const currentEffects = props.actor.activeEffects || [];

    emit('update:actor', {
      activeEffects: currentEffects.filter((effect) => effect.id !== effectId),
    });

    if (!props.isEditMode) {
      setTimeout(() => emit('immediate-save'), 0);
    }
  }

  function saveCustomEffect(effect: ActiveEffect) {
    const currentEffects = props.actor.activeEffects || [];

    const index = currentEffects.findIndex(
      (existing) => existing.id === effect.id,
    );

    if (index !== -1) {
      const newEffects = [...currentEffects];

      newEffects[index] = effect;
      emit('update:actor', { activeEffects: newEffects });
    } else {
      emit('update:actor', { activeEffects: [...currentEffects, effect] });
    }

    if (!props.isEditMode) {
      setTimeout(() => emit('immediate-save'), 0);
    }
  }

  function toggleEffectStatus(effect: ActiveEffect) {
    saveCustomEffect({ ...effect, disabled: !effect.disabled });
  }

  /** Набор активных ключей состояний для быстрого поиска по nameRu/nameEn */
  const activeConditionKeys = computed<Set<ConditionKey>>(() => {
    const keys = new Set<ConditionKey>();

    for (const effect of props.actor.activeEffects || []) {
      // Ауры с applyToSelf=false не действуют на источника — не показываем их как активные
      if (effect.aura && !effect.aura.applyToSelf) {
        continue;
      }

      if (effect.origin === 'condition') {
        const condition = CONDITIONS.find(
          (conditionEntry) =>
            conditionEntry.nameRu === effect.name
            || conditionEntry.nameEn === effect.name,
        );

        if (condition) {
          keys.add(condition.key);
        }
      }
    }

    return keys;
  });

  /**
   * Проверяет, активно ли состояние
   *
   * @param key - ключ состояния
   * @returns true, если состояние активно
   */
  function isConditionActive(key: ConditionKey): boolean {
    return activeConditionKeys.value.has(key);
  }

  /**
   * Переключает состояние: добавляет или убирает из списка активных эффектов
   *
   * @param key - ключ состояния для переключения
   */
  function toggleCondition(key: ConditionKey): void {
    const condition = CONDITIONS.find((entry) => entry.key === key);

    if (!condition) {
      return;
    }

    const currentEffects = props.actor.activeEffects || [];

    if (isConditionActive(key)) {
      const filteredEffects = currentEffects.filter(
        (effect) =>
          !(
            effect.origin === 'condition'
            && (effect.name === condition.nameRu
              || effect.name === condition.nameEn)
          ),
      );

      emit('update:actor', { activeEffects: filteredEffects });
    } else {
      // Единый источник правды: builder проставляет conditionKey,
      // conditionImmunities и динамические changes Истощения.
      const newEffect = buildConditionActiveEffect(key);

      if (!newEffect) {
        return;
      }

      emit('update:actor', {
        activeEffects: [...currentEffects, newEffect],
      });
    }

    if (!props.isEditMode) {
      setTimeout(() => emit('immediate-save'), 0);
    }
  }

  /**
   * CSS-классы для карточки состояния
   *
   * @param key - ключ состояния
   * @returns строка с классами
   */
  function conditionCardClass(key: ConditionKey): string {
    const base =
      'flex items-center gap-2 p-2 rounded-lg transition-all duration-200 w-full cursor-pointer';

    const active = isConditionActive(key);

    if (active) {
      return `${base} bg-primary/20 ring-1 ring-primary/40 hover:bg-primary/30`;
    }

    return `${base} bg-accented/30 hover:bg-accented/50`;
  }

  /**
   * CSS-классы для иконки состояния
   *
   * @param key - ключ состояния
   * @returns строка с классами
   */
  function conditionIconClass(key: ConditionKey): string {
    const base = 'size-5 shrink-0 transition-colors duration-200';

    if (isConditionActive(key)) {
      return `${base} text-primary`;
    }

    return `${base} text-dimmed`;
  }
</script>

<template>
  <!-- Custom Effects Section -->
  <div class="flex flex-col gap-2">
    <div
      v-if="customEffects.length === 0"
      class="rounded-lg border border-dashed border-default p-3 text-center text-xs text-dimmed italic"
    >
      Нет пользовательских эффектов
    </div>

    <div
      v-else
      class="space-y-1"
    >
      <div
        v-for="effect in customEffects"
        :key="effect.id"
        class="group flex min-h-[44px] items-center gap-2 rounded-lg bg-elevated/50 p-2 transition-colors hover:bg-accented/50"
        :class="{ 'opacity-50 grayscale': effect.disabled }"
      >
        <UIcon
          :name="effect.icon || 'tabler:bolt'"
          class="size-5 shrink-0"
          :class="effect.disabled ? 'text-dimmed' : 'text-gold'"
        />

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-sm leading-none font-medium">
            <span class="truncate">{{ effect.name }}</span>
          </div>

          <div
            v-if="effect.description"
            class="mt-0.5 text-[10px] wrap-break-word text-dimmed"
          >
            {{ effect.description }}
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <USwitch
            :model-value="!effect.disabled"
            size="sm"
            checked-icon="tabler:check"
            unchecked-icon="tabler:x"
            @update:model-value="toggleEffectStatus(effect)"
          />

          <div
            v-if="isEditMode"
            class="ml-1 flex gap-1"
          >
            <UButton
              icon="tabler:pencil"
              size="xs"
              variant="ghost"
              color="gray"
              class="px-1.5"
              @click.left.exact.prevent="editCustomEffect(effect)"
            />

            <UButton
              icon="tabler:trash"
              size="xs"
              variant="ghost"
              color="red"
              class="px-1.5"
              @click.left.exact.prevent="deleteCustomEffect(effect.id)"
            />
          </div>
        </div>
      </div>
    </div>

    <UButton
      v-if="isEditMode"
      size="sm"
      color="primary"
      variant="soft"
      icon="tabler:plus"
      block
      class="mt-1"
      @click.left.exact.prevent="createCustomEffect"
    >
      Добавить Эффект
    </UButton>
  </div>

  <!-- Эффекты от снаряжения -->
  <div
    v-if="equipmentEffects.length > 0"
    class="flex flex-col"
  >
    <h3
      class="mt-5 mb-1 text-xs font-semibold tracking-wider text-muted uppercase"
    >
      От снаряжения
    </h3>

    <div class="space-y-1">
      <div
        v-for="entry in equipmentEffects"
        :key="`${entry.itemName}-${entry.effect.id}`"
        class="flex min-h-[44px] items-center gap-2 rounded-lg bg-elevated/50 p-2"
      >
        <UIcon
          :name="entry.effect.icon || 'tabler:bolt'"
          class="size-5 shrink-0 text-source"
        />

        <div class="min-w-0 flex-1">
          <div class="truncate text-sm leading-none font-medium">
            {{ entry.effect.name }}
          </div>

          <div class="mt-0.5 truncate text-[10px] text-dimmed">
            {{ entry.itemName }}
          </div>
        </div>

        <span
          class="shrink-0 rounded-full bg-source/10 px-2 py-0.5 text-[10px] text-source"
        >
          Предмет
        </span>
      </div>
    </div>
  </div>

  <div class="flex flex-col">
    <div class="flex items-center">
      <h3
        class="mt-5 mb-1 text-xs font-semibold tracking-wider text-muted uppercase"
      >
        Состояния
      </h3>
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <UPopover
        v-for="condition in CONDITIONS"
        :key="condition.key"
        mode="hover"
        :open-delay="300"
        :close-delay="100"
      >
        <button
          :class="conditionCardClass(condition.key)"
          type="button"
          @click.left.exact.prevent="toggleCondition(condition.key)"
        >
          <span
            v-if="condition.customImage"
            :class="conditionIconClass(condition.key)"
            :style="{
              maskImage: `url('${condition.customImage}')`,
              WebkitMaskImage: `url('${condition.customImage}')`,
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskPosition: 'center',
              WebkitMaskPosition: 'center',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              backgroundColor: 'currentColor',
            }"
          />

          <UIcon
            v-else
            :name="condition.icon"
            :class="conditionIconClass(condition.key)"
          />

          <div class="min-w-0 flex-1 text-left">
            <p class="truncate text-xs leading-tight font-medium">
              {{ condition.nameRu }}
            </p>

            <p class="truncate text-[10px] leading-tight opacity-50">
              {{ condition.nameEn }}
            </p>
          </div>
        </button>

        <template #content>
          <div class="max-w-xs p-3">
            <p class="mb-1 text-xs font-semibold">
              {{ condition.nameRu }}
            </p>

            <p class="text-xs leading-relaxed text-muted">
              {{ condition.description }}
            </p>
          </div>
        </template>
      </UPopover>
    </div>
  </div>

  <ActiveEffectFormModal
    v-model:open="isEffectModalOpen"
    :modal-id="effectModalId"
    :z-index="effectModalZIndex"
    :effect="editingEffect"
    @save="saveCustomEffect"
  />
</template>
