<script setup lang="ts">
  import type { CreatureHitPoints, HitDie } from '@vtt/shared/system/dnd.js';

  import { computed, reactive, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  /** Доступные размеры костей хитов */
  const HIT_DIE_OPTIONS: HitDie[] = [6, 8, 10, 12];

  interface Props {
    open: boolean;
    hitPoints: CreatureHitPoints;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [data: Partial<CreatureHitPoints>];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const editHp = reactive({
    current: 0,
    max: 1,
    temp: 0,
    hitDie: 8 as HitDie,
    hitDiceCount: 1,
    bonus: 0,
  });

  // При открытии — подставляем текущие значения
  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        editHp.current =
          props.hitPoints.current ?? props.hitPoints.average ?? 0;

        editHp.max = props.hitPoints.max ?? props.hitPoints.average ?? 1;
        editHp.temp = props.hitPoints.temp ?? 0;
        editHp.hitDie = props.hitPoints.hitDie ?? 8;
        editHp.hitDiceCount = props.hitPoints.hitDiceCount ?? 1;
        editHp.bonus = props.hitPoints.bonus ?? 0;
      }
    },
  );

  /** Генерирует формулу из текущих значений */
  function generateFormula(): string {
    const dicePart = `${editHp.hitDiceCount}к${editHp.hitDie}`;

    if (editHp.bonus === 0) {
      return dicePart;
    }

    const sign = editHp.bonus > 0 ? '+' : '-';

    return `${dicePart} ${sign} ${Math.abs(editHp.bonus)}`;
  }

  /** Вычисляет среднее значение из формулы */
  function calculateAverage(): number {
    const dieAvg = (editHp.hitDie + 1) / 2;

    return Math.floor(editHp.hitDiceCount * dieAvg) + editHp.bonus;
  }

  /** Применяет изменения очков здоровья */
  function applyHitPoints() {
    emit('apply', {
      current: editHp.current,
      max: editHp.max,
      temp: editHp.temp,
      hitDie: editHp.hitDie,
      hitDiceCount: editHp.hitDiceCount,
      bonus: editHp.bonus,
      formula: generateFormula(),
      average: calculateAverage(),
    });

    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="380"
    :min-height="200"
    title="Очки здоровья и кости хитов"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Текущие / Максимум -->
        <div class="flex items-center gap-4">
          <div class="flex flex-1 flex-col gap-1">
            <span
              class="text-[10px] font-bold tracking-wider text-muted uppercase"
              >Сейчас</span
            >

            <UInput
              :model-value="editHp.current"
              type="number"
              :min="0"
              size="lg"
              @update:model-value="editHp.current = Number($event)"
            />
          </div>

          <span class="mt-5 text-2xl font-light text-dimmed">/</span>

          <div class="flex flex-1 flex-col gap-1">
            <span
              class="text-[10px] font-bold tracking-wider text-muted uppercase"
              >Всего</span
            >

            <UInput
              :model-value="editHp.max"
              type="number"
              :min="1"
              size="lg"
              @update:model-value="editHp.max = Number($event)"
            />
          </div>

          <div class="flex flex-1 flex-col gap-1">
            <span
              class="text-[10px] font-bold tracking-wider text-muted uppercase"
              >Врем.</span
            >

            <UInput
              :model-value="editHp.temp"
              type="number"
              :min="0"
              size="lg"
              @update:model-value="editHp.temp = Math.max(0, Number($event))"
            />
          </div>
        </div>

        <div class="border-t border-muted" />

        <!-- Кости хитов -->
        <div class="flex flex-col gap-2">
          <span
            class="text-[10px] font-bold tracking-wider text-muted uppercase"
          >
            Формула хитов
          </span>

          <div class="flex items-center gap-2 rounded bg-elevated/40 p-2">
            <!-- Количество костей -->
            <div class="flex flex-col gap-0.5">
              <span
                class="text-[9px] font-medium tracking-wider text-dimmed uppercase"
              >
                Количество
              </span>

              <UInput
                :model-value="editHp.hitDiceCount"
                type="number"
                :min="1"
                size="sm"
                class="w-16"
                @update:model-value="
                  editHp.hitDiceCount = Math.max(1, Number($event))
                "
              />
            </div>

            <span class="mt-4 font-light text-dimmed">к</span>

            <!-- Размер кости -->
            <div class="flex flex-1 flex-col gap-0.5">
              <span
                class="text-[9px] font-medium tracking-wider text-dimmed uppercase"
              >
                Кость
              </span>

              <USelect
                :model-value="editHp.hitDie"
                :items="
                  HIT_DIE_OPTIONS.map((hitDie) => ({
                    label: String(hitDie),
                    value: hitDie,
                  }))
                "
                size="sm"
                @update:model-value="editHp.hitDie = Number($event) as HitDie"
              />
            </div>

            <span class="mt-4 font-light text-dimmed">+</span>

            <!-- Бонус -->
            <div class="flex flex-col gap-0.5">
              <span
                class="text-[9px] font-medium tracking-wider text-dimmed uppercase"
              >
                Бонус
              </span>

              <UInput
                :model-value="editHp.bonus"
                type="number"
                size="sm"
                class="w-16"
                @update:model-value="editHp.bonus = Number($event)"
              />
            </div>
          </div>

          <div
            class="mt-1 flex items-center justify-between text-xs text-dimmed"
          >
            <span>Формула: {{ generateFormula() }}</span>

            <span>Среднее: {{ calculateAverage() }}</span>
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
            @click.left.exact.prevent="applyHitPoints"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
