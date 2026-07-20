<script setup lang="ts">
  import type {
    ActorCounterState,
    ClassCounterDefinition,
    CounterRecovery,
  } from '@vtt/shared/system/dnd.js';

  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  import { findCounterDefinition } from './utils/classCounters';

  interface Props {
    open: boolean;
    counters: ActorCounterState[];
    counterDefinitions: ClassCounterDefinition[];
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [counters: ActorCounterState[]];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const recoveryOptions: Array<{ label: string; value: CounterRecovery }> = [
    { label: 'Короткий отдых', value: 'short' },
    { label: 'Продолжительный отдых', value: 'long' },
  ];

  const localCounters = ref<ActorCounterState[]>([]);

  const hasInvalidCounters = computed(() => {
    return localCounters.value.some(
      (counter) =>
        !resolveCounterName(counter)
        || !resolveCounterShortName(counter)
        || counter.max < 1
        || counter.current < 0,
    );
  });

  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        localCounters.value = props.counters.map((counter) => ({
          ...counter,
        }));
      }
    },
  );

  function createCounterId(counter: ActorCounterState): string {
    return [
      counter.classKey,
      counter.subclassKey ?? 'class',
      counter.counterKey,
    ].join(':');
  }

  function resolveCounterName(counter: ActorCounterState): string {
    return (
      counter.name?.trim()
      || findCounterDefinition(counter, props.counterDefinitions)?.name
      || ''
    );
  }

  function resolveCounterShortName(counter: ActorCounterState): string {
    return (
      counter.shortName?.trim()
      || findCounterDefinition(counter, props.counterDefinitions)?.shortName
      || ''
    );
  }

  function resolveCounterRecovery(counter: ActorCounterState): CounterRecovery {
    return (
      counter.recovery
      || findCounterDefinition(counter, props.counterDefinitions)?.recovery
      || 'long'
    );
  }

  function toTextInputValue(value: string | number): string {
    return String(value);
  }

  function toNumberInputValue(value: string | number): number {
    const numericValue = Number(value);

    return Number.isNaN(numericValue) ? 0 : numericValue;
  }

  function isCounterRecovery(value: string): value is CounterRecovery {
    return value === 'short' || value === 'long';
  }

  function updateCounter(
    targetCounter: ActorCounterState,
    updates: Partial<ActorCounterState>,
  ): void {
    const targetCounterId = createCounterId(targetCounter);

    localCounters.value = localCounters.value.map((counter) =>
      createCounterId(counter) === targetCounterId
        ? { ...counter, ...updates }
        : counter,
    );
  }

  function updateCounterName(
    counter: ActorCounterState,
    value: string | number,
  ): void {
    updateCounter(counter, { name: toTextInputValue(value) });
  }

  function updateCounterShortName(
    counter: ActorCounterState,
    value: string | number,
  ): void {
    updateCounter(counter, { shortName: toTextInputValue(value) });
  }

  function updateCounterCurrent(
    counter: ActorCounterState,
    value: string | number,
  ): void {
    const current = Math.max(0, toNumberInputValue(value));

    updateCounter(counter, {
      current: Math.min(current, counter.max),
    });
  }

  function updateCounterMax(
    counter: ActorCounterState,
    value: string | number,
  ): void {
    const max = Math.max(1, toNumberInputValue(value));

    updateCounter(counter, {
      current: Math.min(counter.current, max),
      max,
    });
  }

  function updateCounterRecovery(
    counter: ActorCounterState,
    value: string,
  ): void {
    if (!isCounterRecovery(value)) {
      return;
    }

    updateCounter(counter, { recovery: value });
  }

  function createCustomCounterKey(): string {
    const existingKeys = new Set(
      localCounters.value.map((counter) => counter.counterKey),
    );

    let counterIndex = localCounters.value.length + 1;
    let counterKey = `custom-counter-${counterIndex}`;

    while (existingKeys.has(counterKey)) {
      counterIndex += 1;
      counterKey = `custom-counter-${counterIndex}`;
    }

    return counterKey;
  }

  function addCounter(): void {
    localCounters.value = [
      ...localCounters.value,
      {
        counterKey: createCustomCounterKey(),
        classKey: 'custom',
        name: 'Новый счётчик',
        shortName: 'НС',
        recovery: 'long',
        current: 1,
        max: 1,
      },
    ];
  }

  function removeCounter(targetCounter: ActorCounterState): void {
    const targetCounterId = createCounterId(targetCounter);

    localCounters.value = localCounters.value.filter(
      (counter) => createCounterId(counter) !== targetCounterId,
    );
  }

  function normalizeCounter(counter: ActorCounterState): ActorCounterState {
    const max = Math.max(1, counter.max);

    return {
      ...counter,
      name: resolveCounterName(counter),
      shortName: resolveCounterShortName(counter),
      recovery: resolveCounterRecovery(counter),
      current: Math.min(Math.max(0, counter.current), max),
      max,
    };
  }

  function applyCounters(): void {
    emit('apply', localCounters.value.map(normalizeCounter));
    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="620"
    :min-height="420"
    title="Счётчики ресурсов"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-muted">
            {{ localCounters.length }} шт.
          </span>

          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="tabler:plus"
            @click.left.exact.prevent="addCounter"
          >
            Добавить
          </UButton>
        </div>

        <div
          v-if="localCounters.length === 0"
          class="rounded-lg border border-dashed border-muted p-4 text-center text-sm text-dimmed"
        >
          Нет счётчиков
        </div>

        <div class="flex max-h-[460px] flex-col gap-2 overflow-y-auto pr-1">
          <div
            v-for="counter in localCounters"
            :key="createCounterId(counter)"
            class="relative rounded-lg border border-default/50 bg-elevated/20 p-4 transition-all duration-200 hover:border-gold/30 hover:bg-elevated/30"
          >
            <!-- Кнопка удаления в правом верхнем углу -->
            <div class="absolute top-4 right-4 z-10">
              <UTooltip
                :delay-duration="300"
                text="Удалить счётчик"
              >
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="tabler:trash"
                  class="rounded opacity-60 transition-all duration-200 hover:bg-error/10 hover:opacity-100"
                  @click.left.exact.prevent="removeCounter(counter)"
                />
              </UTooltip>
            </div>

            <!-- Контентная часть карточки с отступом справа под кнопку -->
            <div class="flex flex-col gap-3 pr-8">
              <!-- Первый ряд: Название и Краткое имя -->
              <div class="grid grid-cols-[1fr_6rem] gap-3">
                <label class="flex flex-col gap-1">
                  <span
                    class="text-[10px] font-bold tracking-wider text-toned/80 uppercase"
                  >
                    Название
                  </span>

                  <UInput
                    :model-value="resolveCounterName(counter)"
                    size="sm"
                    class="w-full"
                    placeholder="Например, Очки чародейства"
                    @update:model-value="updateCounterName(counter, $event)"
                  />
                </label>

                <label class="flex flex-col gap-1">
                  <span
                    class="text-[10px] font-bold tracking-wider text-toned/80 uppercase"
                  >
                    Кратко
                  </span>

                  <UInput
                    :model-value="resolveCounterShortName(counter)"
                    size="sm"
                    placeholder="ОЧ"
                    class="w-full"
                    @update:model-value="
                      updateCounterShortName(counter, $event)
                    "
                  />
                </label>
              </div>

              <!-- Второй ряд: Восстановление, Текущее значение, Максимум -->
              <div class="grid grid-cols-[1fr_6rem_6rem] gap-3">
                <label class="flex flex-col gap-1">
                  <span
                    class="text-[10px] font-bold tracking-wider text-toned/80 uppercase"
                  >
                    Восстановление
                  </span>

                  <USelect
                    :model-value="resolveCounterRecovery(counter)"
                    :items="recoveryOptions"
                    size="sm"
                    class="w-full"
                    @update:model-value="updateCounterRecovery(counter, $event)"
                  />
                </label>

                <label class="flex flex-col gap-1">
                  <span
                    class="text-[10px] font-bold tracking-wider text-toned/80 uppercase"
                  >
                    Сейчас
                  </span>

                  <UInput
                    :model-value="counter.current"
                    type="number"
                    :min="0"
                    size="sm"
                    class="w-full"
                    @update:model-value="updateCounterCurrent(counter, $event)"
                  />
                </label>

                <label class="flex flex-col gap-1">
                  <span
                    class="text-[10px] font-bold tracking-wider text-toned/80 uppercase"
                  >
                    Максимум
                  </span>

                  <UInput
                    :model-value="counter.max"
                    type="number"
                    :min="1"
                    size="sm"
                    class="w-full"
                    @update:model-value="updateCounterMax(counter, $event)"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          @click.left.exact.prevent="isOpen = false"
        >
          Отмена
        </UButton>

        <UButton
          color="primary"
          :disabled="hasInvalidCounters"
          @click.left.exact.prevent="applyCounters"
        >
          Сохранить
        </UButton>
      </div>
    </template>
  </UDraggableModal>
</template>
