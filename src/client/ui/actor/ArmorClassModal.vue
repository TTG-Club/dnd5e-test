<script setup lang="ts">
  import type { ActorArmorClass } from '@vtt/shared';

  import { computed, reactive, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  interface Props {
    open: boolean;
    armorClass: ActorArmorClass;
    /** Модификатор ловкости актора (для превью AC) */
    dexModifier: number;
    /** Флаг существа: природная броня не прибавляет модификатор ловкости */
    isCreatureMode?: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [armorClass: ActorArmorClass];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const calculationOptions = [
    { label: 'По умолчанию', value: 'default' },
    { label: 'Природная броня', value: 'natural' },
    { label: 'Фиксированный', value: 'flat' },
  ];

  const editArmorClass = reactive<ActorArmorClass>({
    value: 10,
    calculation: 'default',
    formula: '',
    flat: null,
  });

  // При открытии — подставляем текущие значения
  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        Object.assign(editArmorClass, props.armorClass);
      }
    },
  );

  // При смене типа расчёта — сбрасываем value на корректное значение
  watch(
    () => editArmorClass.calculation,
    (newCalc, oldCalc) => {
      if (newCalc === oldCalc) {
        return;
      }

      if (newCalc === 'default') {
        // Для «По умолчанию» value фиксирован = 10 (формула 10 + DEX)
        editArmorClass.value = 10;
      }
    },
  );

  /**
   * Превью итогового AC (с учётом формулы) для отображения в шапке модалки
   */
  const previewAC = computed(() => {
    switch (editArmorClass.calculation) {
      case 'default':
        return 10 + props.dexModifier;
      case 'natural':
        return props.isCreatureMode
          ? editArmorClass.value
          : editArmorClass.value + props.dexModifier;
      case 'flat':
        return editArmorClass.value;
      default:
        return editArmorClass.value;
    }
  });

  /**
   * Применяет изменения класса доспеха
   */
  function applyArmorClass() {
    emit('apply', { ...editArmorClass });
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
    :min-height="280"
    title="Класс доспеха"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Текущее значение КД (превью) -->
        <div class="text-center">
          <span class="text-4xl font-bold text-highlighted tabular-nums">{{
            previewAC
          }}</span>
        </div>

        <!-- Разделитель -->
        <div class="border-t border-muted" />

        <!-- Формула -->
        <div class="space-y-3">
          <span
            class="text-[10px] font-bold tracking-wider text-muted uppercase"
            >Формула</span
          >

          <!-- Тип расчёта -->
          <div class="flex items-center gap-3">
            <span class="w-28 text-sm text-toned">Расчёт</span>

            <USelect
              v-model="editArmorClass.calculation"
              :items="calculationOptions"
              value-key="value"
              label-key="label"
              class="flex-1"
            />
          </div>

          <!-- Значение — по умолчанию -->
          <div
            v-if="editArmorClass.calculation === 'default'"
            class="rounded border border-info-border/30 bg-info-subtle/10 px-3 py-2"
          >
            <div class="flex items-center gap-2 text-sm text-toned">
              <span class="font-mono text-lg font-bold text-info-muted">
                10
              </span>

              <span class="text-muted"
                >+ мод. Ловкости ({{ dexModifier >= 0 ? '+' : ''
                }}{{ dexModifier }})</span
              >
            </div>

            <p class="mt-1 text-xs leading-relaxed text-dimmed">
              Без доспеха КД всегда равен 10 + модификатор Ловкости.
            </p>
          </div>

          <!-- Значение — природная броня -->
          <div
            v-else-if="editArmorClass.calculation === 'natural'"
            class="space-y-2"
          >
            <div class="flex items-center gap-3">
              <span class="w-28 text-sm text-toned">Базовый КД</span>

              <UInput
                :model-value="editArmorClass.value"
                type="number"
                :min="0"
                size="sm"
                class="flex-1"
                @update:model-value="editArmorClass.value = Number($event)"
              />
            </div>

            <div
              class="rounded border border-success/30 bg-success-subtle/10 px-3 py-2"
            >
              <div class="flex items-center gap-2 text-sm text-toned">
                <span class="font-mono text-lg font-bold text-healing">
                  {{ editArmorClass.value }}
                </span>

                <span
                  v-if="!isCreatureMode"
                  class="text-muted"
                  >+ мод. Ловкости ({{ dexModifier >= 0 ? '+' : ''
                  }}{{ dexModifier }})</span
                >
              </div>

              <p class="mt-1 text-xs leading-relaxed text-dimmed">
                <template v-if="isCreatureMode">
                  Природная броня: фиксированное значение для существа.
                  Модификатор Ловкости обычно уже учтён в значении.
                </template>

                <template v-else>
                  Природная броня: базовое значение + модификатор Ловкости.
                </template>
              </p>
            </div>
          </div>

          <!-- Значение — фиксированный -->
          <div
            v-else
            class="space-y-2"
          >
            <div class="flex items-center gap-3">
              <span class="w-28 text-sm text-toned">Значение</span>

              <UInput
                :model-value="editArmorClass.value"
                type="number"
                :min="0"
                size="sm"
                class="flex-1"
                @update:model-value="editArmorClass.value = Number($event)"
              />
            </div>

            <div class="flex items-center gap-3 py-1">
              <UCheckbox
                :model-value="editArmorClass.formula === 'природный доспех'"
                label="Природная броня (приписка)"
                @update:model-value="
                  editArmorClass.formula = $event ? 'природный доспех' : ''
                "
              />
            </div>

            <p class="text-[11px] leading-relaxed text-dimmed">
              Фиксированное значение КД. Модификатор Ловкости не учитывается.
              Позволяет указать, что это значение является природной броней.
            </p>
          </div>
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
            @click.left.exact.prevent="applyArmorClass"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
