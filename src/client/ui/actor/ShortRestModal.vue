<script setup lang="ts">
  import type {
    ActorClassEntry,
    ManualHitDieGroup,
    ShortRestHitDiceResult,
  } from '@vtt/shared/system/dnd.js';

  import { getHitDiceGroups, spendHitDice } from '@vtt/shared/system/dnd.js';
  import { computed, reactive, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';
  import { useChatStore } from '@/stores/chatStore';
  import { useDiceRollerStore } from '@/stores/diceRollerStore';

  interface Props {
    open: boolean;
    /** Классы актора (источник костей хитов и счётчика потраченных) */
    classes?: ActorClassEntry[];
    /** Ручные кости хитов (для актёров без классов / NPC) */
    manualHitDice?: ManualHitDieGroup[];
    currentHitPoints: number;
    maxHitPoints: number;
    /** Модификатор Телосложения (прибавляется к каждой потраченной кости) */
    conMod: number;
  }

  const props = withDefaults(defineProps<Props>(), {
    classes: () => [],
    manualHitDice: () => [],
  });

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [result: ShortRestHitDiceResult];
  }>();

  const diceRollerStore = useDiceRollerStore();
  const chatStore = useChatStore();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  /** Сколько костей каждого размера игрок собирается потратить в этот отдых */
  const pending = reactive<Record<number, number>>({});

  /** Сводные группы костей хитов (классы + ручные) по размеру */
  const hitDiceGroups = computed(() =>
    getHitDiceGroups(props.classes, props.manualHitDice),
  );

  /** Есть ли вообще кости хитов */
  const hasHitDice = computed(() =>
    hitDiceGroups.value.some((group) => group.total > 0),
  );

  /** Форматированный модификатор Телосложения (напр. «+2», «−1») */
  const conModLabel = computed(() =>
    props.conMod >= 0 ? `+${props.conMod}` : `−${Math.abs(props.conMod)}`,
  );

  /** Суммарно выбрано костей к трате */
  const totalPending = computed(() =>
    hitDiceGroups.value.reduce(
      (sum, group) => sum + (pending[group.die] ?? 0),
      0,
    ),
  );

  /** Текст кнопки завершения отдыха (зависит от выбора костей) */
  const finishButtonLabel = computed(() =>
    totalPending.value > 0 ? 'Бросить и завершить отдых' : 'Завершить отдых',
  );

  /** Формула броска выбранных костей (напр. «2к10 + 1к8 + 4») */
  const rollFormula = computed(() => {
    const diceParts = hitDiceGroups.value
      .filter((group) => (pending[group.die] ?? 0) > 0)
      .map((group) => `${pending[group.die]}к${group.die}`);

    if (diceParts.length === 0) {
      return '';
    }

    const conTotal = totalPending.value * props.conMod;

    let formula = diceParts.join(' + ');

    if (conTotal > 0) {
      formula += ` + ${conTotal}`;
    } else if (conTotal < 0) {
      formula += ` - ${Math.abs(conTotal)}`;
    }

    return formula;
  });

  // При открытии — обнуляем выбор
  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        for (const key of Object.keys(pending)) {
          delete pending[Number(key)];
        }

        for (const group of hitDiceGroups.value) {
          pending[group.die] = 0;
        }
      }
    },
  );

  /** Изменяет количество костей к трате, не выходя за доступные */
  function adjustPending(die: number, delta: number) {
    const group = hitDiceGroups.value.find((item) => item.die === die);

    if (!group) {
      return;
    }

    const next = (pending[die] ?? 0) + delta;

    pending[die] = Math.max(0, Math.min(group.available, next));
  }

  /**
   * Бросает выбранные кости хитов, лечит актора, пишет результат в чат и
   * завершает короткий отдых (восстановление ресурсов делается выше по дереву).
   */
  function finishRest() {
    let updatedClasses: ActorClassEntry[] = props.classes;
    let updatedManualHitDice: ManualHitDieGroup[] = props.manualHitDice;
    let newCurrent = props.currentHitPoints;

    if (totalPending.value > 0 && rollFormula.value) {
      const rollData = diceRollerStore.parseAndRoll(rollFormula.value);

      const healed = Math.max(0, rollData.total);

      newCurrent = Math.min(
        props.maxHitPoints,
        props.currentHitPoints + healed,
      );

      rollData.label = `Короткий отдых — кости хитов (+${
        newCurrent - props.currentHitPoints
      } HP)`;

      chatStore.sendMessage(rollFormula.value, 'roll', rollData);

      // Иммутабельно списываем выбранные кости каждого размера по очереди
      for (const group of hitDiceGroups.value) {
        const count = pending[group.die] ?? 0;

        if (count > 0) {
          const spent = spendHitDice(
            group.die,
            count,
            updatedClasses,
            updatedManualHitDice,
          );

          updatedClasses = spent.classes;
          updatedManualHitDice = spent.manualHitDice;
        }
      }
    }

    emit('apply', {
      hitPointsCurrent: newCurrent,
      classes: updatedClasses,
      manualHitDice: updatedManualHitDice,
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
    :min-height="240"
    title="Короткий отдых"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Текущие хиты -->
        <div
          class="flex items-center justify-between rounded-lg bg-elevated/50 p-3"
        >
          <span class="text-xs tracking-wider text-muted uppercase">Хиты</span>

          <span class="font-bold text-highlighted">
            {{ currentHitPoints }}
            <span class="text-dimmed"> / {{ maxHitPoints }}</span>
          </span>
        </div>

        <!-- Кости хитов -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span
              class="text-[10px] font-bold tracking-wider text-muted uppercase"
            >
              Потратить кости хитов
            </span>

            <span class="text-xs text-dimmed">
              мод. ТЕЛ:
              <span class="font-bold text-highlighted">
                {{ conModLabel }}
              </span>
            </span>
          </div>

          <div
            v-if="!hasHitDice"
            class="text-sm text-dimmed"
          >
            Нет доступных костей хитов.
          </div>

          <div
            v-for="group in hitDiceGroups"
            :key="group.die"
            class="flex items-center justify-between rounded bg-elevated/40 p-2"
          >
            <div class="flex items-center gap-2">
              <UIcon
                name="tabler:dice-5"
                class="h-4 w-4 text-healing"
              />

              <span class="font-bold text-highlighted">к{{ group.die }}</span>

              <span class="text-xs text-dimmed">
                доступно {{ group.available }} / {{ group.total }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="tabler:minus"
                :disabled="(pending[group.die] ?? 0) === 0"
                @click.left.exact.prevent="adjustPending(group.die, -1)"
              />

              <span class="w-6 text-center font-bold text-highlighted">
                {{ pending[group.die] ?? 0 }}
              </span>

              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="tabler:plus"
                :disabled="(pending[group.die] ?? 0) >= group.available"
                @click.left.exact.prevent="adjustPending(group.die, 1)"
              />
            </div>
          </div>
        </div>

        <!-- Формула -->
        <div
          v-if="totalPending > 0"
          class="rounded-lg bg-elevated/50 p-3 text-center"
        >
          <span class="text-xs tracking-wider text-muted uppercase"
            >Формула</span
          >

          <div class="mt-1 font-mono text-lg font-bold text-white">
            {{ rollFormula }}
          </div>
        </div>

        <div class="border-t border-muted" />

        <!-- Кнопки -->
        <div class="flex justify-end gap-2 pt-1">
          <UButton
            variant="ghost"
            color="neutral"
            size="md"
            @click.left.exact.prevent="isOpen = false"
          >
            Отмена
          </UButton>

          <UButton
            color="primary"
            size="md"
            @click.left.exact.prevent="finishRest"
          >
            <UIcon
              name="tabler:campfire"
              class="mr-1 h-4 w-4"
            />
            {{ finishButtonLabel }}
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
