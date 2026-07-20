<script setup lang="ts">
  import type { ActorMovement, MovementType } from '@vtt/shared';

  import { DISTANCE_UNIT_OPTIONS } from '@vtt/shared';
  import { computed, reactive, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  interface Props {
    open: boolean;
    movement: ActorMovement;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [movement: ActorMovement];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  /** Порядок типов движения = приоритет отображения */
  const movementTypes: Array<{ key: MovementType; label: string }> = [
    { key: 'burrow', label: 'Копание' },
    { key: 'climb', label: 'Лазание' },
    { key: 'fly', label: 'Полёт' },
    { key: 'swim', label: 'Плавание' },
    { key: 'walk', label: 'Ходьба' },
  ];

  const editMovement = reactive<ActorMovement>({
    walk: 0,
    swim: 0,
    fly: 0,
    climb: 0,
    burrow: 0,
    hover: false,
    units: 'ft',
  });

  // При открытии — подставляем текущие значения
  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        Object.assign(editMovement, props.movement);
      }
    },
  );

  /**
   * Применяет изменения передвижения
   */
  function applyMovement() {
    emit('apply', { ...editMovement });
    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="400"
    :min-height="300"
    title="Передвижение"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Типы движения -->
        <div class="space-y-3">
          <div
            v-for="movementType in movementTypes"
            :key="movementType.key"
            class="flex items-center gap-3"
          >
            <span class="w-24 text-sm text-toned">{{
              movementType.label
            }}</span>

            <UInput
              :model-value="editMovement[movementType.key]"
              type="number"
              :min="0"
              size="sm"
              class="flex-1"
              @update:model-value="
                editMovement[movementType.key] = Number($event)
              "
            />

            <template v-if="movementType.key === 'fly'">
              <label
                class="flex cursor-pointer items-center gap-1.5 text-sm text-muted"
              >
                <input
                  v-model="editMovement.hover"
                  type="checkbox"
                  class="rounded border-accented bg-elevated text-gold focus:ring-gold/30"
                />
                Парение
              </label>
            </template>
          </div>
        </div>

        <!-- Разделитель -->
        <div class="border-t border-muted" />

        <!-- Единицы -->
        <div class="flex items-center gap-3">
          <span class="w-24 text-sm text-toned">Единицы</span>

          <USelect
            v-model="editMovement.units"
            :items="DISTANCE_UNIT_OPTIONS"
            value-key="value"
            label-key="label"
            class="flex-1"
          />
        </div>

        <!-- Кнопки -->
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            @click.left.exact.prevent="isOpen = false"
          >
            Отмена
          </UButton>

          <UButton
            color="primary"
            size="sm"
            @click.left.exact.prevent="applyMovement"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
