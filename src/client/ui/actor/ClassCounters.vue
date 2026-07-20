<!--
  Компонент отображения счётчиков классовых ресурсов (очки чародейства,
  кости превосходства, очки духа, ярость и т.д.).

  Показывает для каждого счётчика:
  - Иконку и название
  - Текущее / максимальное значение
  - Кнопки +/- для ручного управления
  - Тип восстановления (короткий / продолжительный отдых)
-->
<script setup lang="ts">
  import type {
    Actor,
    ActorCounterState,
    ClassCounterDefinition,
  } from '@vtt/shared/system/dnd.js';

  import { computed, ref } from 'vue';

  import FieldsetLabel from '@/shared_ui/components/FieldsetLabel.vue';

  import ClassCountersModal from './ClassCountersModal.vue';
  import { findCounterDefinition } from './utils/classCounters';

  defineOptions({ inheritAttrs: false });

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
  }>();

  const isSettingsOpen = ref(false);

  interface Props {
    actor: Actor;
    /** Определения счётчиков из компендиума (для получения name, icon, recovery) */
    counterDefinitions: ClassCounterDefinition[];
    isEditMode: boolean;
  }

  // ── Состояния счётчиков ────────────────────────────────────────

  const counters = computed<ActorCounterState[]>(() => {
    return props.actor.system.classCounters ?? [];
  });

  /**
   * Возвращает итоговые данные для отображения счётчика на основе его состояния
   * и базового определения из компендиума/fallback.
   */
  function getDisplayDefinition(
    counter: ActorCounterState,
    baseDef: ReturnType<typeof findCounterDefinition>,
  ) {
    if (baseDef) {
      return {
        ...baseDef,
        ...counter,
      };
    }

    if (counter.name?.trim()) {
      return {
        name: counter.name,
        shortName: counter.shortName,
        recovery: counter.recovery ?? 'long',
      };
    }

    return undefined;
  }

  const displayCounters = computed(() => {
    return counters.value.map((counter) => ({
      counter,
      definition: getDisplayDefinition(
        counter,
        findCounterDefinition(counter, props.counterDefinitions),
      ),
    }));
  });

  // ── Вспомогательные функции ────────────────────────────────────

  /** Лейбл типа восстановления */
  function recoveryLabel(recovery: string): string {
    return recovery === 'short' ? 'Короткий отдых' : 'Продолжительный отдых';
  }

  /** Увеличить текущее значение счётчика */
  function incrementCounter(counter: ActorCounterState): void {
    if (counter.current >= counter.max) {
      return;
    }

    const updatedCounters = counters.value.map((entry) =>
      entry.counterKey === counter.counterKey
      && entry.classKey === counter.classKey
        ? { ...entry, current: entry.current + 1 }
        : entry,
    );

    emit('update:actor', {
      system: {
        ...props.actor.system,
        classCounters: updatedCounters,
      },
    });
  }

  /** Уменьшить текущее значение счётчика */
  function decrementCounter(counter: ActorCounterState): void {
    if (counter.current <= 0) {
      return;
    }

    const updatedCounters = counters.value.map((entry) =>
      entry.counterKey === counter.counterKey
      && entry.classKey === counter.classKey
        ? { ...entry, current: entry.current - 1 }
        : entry,
    );

    emit('update:actor', {
      system: {
        ...props.actor.system,
        classCounters: updatedCounters,
      },
    });
  }

  /** Применить список счётчиков из модалки настройки */
  function applyCounters(updatedCounters: ActorCounterState[]): void {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        classCounters: updatedCounters,
      },
    });
  }
</script>

<template>
  <FieldsetLabel
    label="Ресурсы класса"
    class="class-counters-fieldset w-full max-w-full border-muted bg-default/20"
  >
    <div class="relative flex max-w-full min-w-0 flex-col gap-1 px-2 pb-2">
      <!-- Шестерёнка настроек (абсолютно позиционирована) -->
      <div
        v-if="isEditMode"
        class="absolute top-1.5 right-3 z-10"
      >
        <UTooltip
          :delay-duration="300"
          text="Настроить счётчики"
          class="outline-none focus:ring-0 focus:outline-none"
        >
          <UIcon
            name="tabler:settings-filled"
            class="h-4 w-4 cursor-pointer text-dimmed transition-colors outline-none hover:text-white focus:ring-0 focus:outline-none"
            @click.left.exact.prevent="isSettingsOpen = true"
          />
        </UTooltip>
      </div>

      <div
        v-if="counters.length === 0"
        class="px-1.5 py-1 text-sm text-dimmed"
      >
        Нет ресурсов
      </div>

      <div
        v-for="{ counter, definition } in displayCounters"
        :key="`${counter.classKey}-${counter.counterKey}`"
        class="flex max-w-full min-w-0 items-center gap-2 rounded p-1.5"
      >
        <!-- Название -->
        <UTooltip
          :delay-duration="300"
          :text="definition?.name ?? counter.counterKey"
        >
          <span
            class="w-8 shrink-0 truncate text-center text-sm font-bold tracking-wider text-toned"
          >
            {{
              definition?.shortName ?? definition?.name ?? counter.counterKey
            }}
          </span>
        </UTooltip>

        <!-- Значение -->
        <div class="flex shrink-0 items-center gap-1">
          <!-- Кнопка минус -->
          <button
            class="hover:border-toned flex h-6 w-6 items-center justify-center rounded border border-muted bg-elevated/60 text-sm font-extrabold text-white transition-all hover:scale-105 hover:bg-elevated active:scale-95 disabled:pointer-events-none disabled:opacity-20"
            :disabled="counter.current <= 0"
            @click.left.exact.prevent="decrementCounter(counter)"
          >
            −
          </button>

          <!-- Текущее / Макс -->
          <span class="min-w-[3rem] text-center text-sm font-bold tabular-nums">
            <span
              class="text-white"
              :class="counter.current === 0 ? 'text-dimmed' : ''"
            >
              {{ counter.current }}
            </span>

            <span class="font-light text-dimmed">/{{ counter.max }}</span>
          </span>

          <!-- Кнопка плюс -->
          <button
            class="hover:border-toned flex h-6 w-6 items-center justify-center rounded border border-muted bg-elevated/60 text-sm font-extrabold text-white transition-all hover:scale-105 hover:bg-elevated active:scale-95 disabled:pointer-events-none disabled:opacity-20"
            :disabled="counter.current >= counter.max"
            @click.left.exact.prevent="incrementCounter(counter)"
          >
            +
          </button>
        </div>

        <!-- Индикатор восстановления -->
        <UTooltip
          :delay-duration="300"
          :text="recoveryLabel(definition?.recovery ?? 'long')"
        >
          <UIcon
            :name="
              definition?.recovery === 'short'
                ? 'tabler:campfire'
                : 'tabler:sun'
            "
            class="h-5.5 w-5.5 shrink-0 text-dimmed transition-colors hover:text-white"
          />
        </UTooltip>
      </div>
    </div>
  </FieldsetLabel>

  <ClassCountersModal
    v-model:open="isSettingsOpen"
    :counters="counters"
    :counter-definitions="counterDefinitions"
    @apply="applyCounters"
  />
</template>

<style scoped>
  .class-counters-fieldset {
    min-inline-size: 0;
  }
</style>
