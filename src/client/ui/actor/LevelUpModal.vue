<script setup lang="ts">
  import type { ActorClassEntry } from '@vtt/shared/system/dnd.js';

  import {
    calculateExperienceForNextLevel,
    getTotalLevel,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  interface Props {
    open: boolean;
    classes: ActorClassEntry[];
    experience: number;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [data: { classes: ActorClassEntry[]; experience: number }];
    'start-wizard': [
      data: {
        queue: Array<{ classKey: string; targetLevel: number }>;
        experience: number;
        forceApplies: ActorClassEntry[];
      },
    ];
    'remove-class': [classKey: string];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const editClasses = ref<ActorClassEntry[]>([]);
  const editExperience = ref(0);
  const forceLevelUp = ref(false);

  /** Ключ класса, ожидающего подтверждения удаления */
  const pendingRemoveKey = ref<string | null>(null);

  const editTotalLevel = computed(() => {
    return getTotalLevel(editClasses.value);
  });

  const editNextLevelXP = computed(() => {
    return calculateExperienceForNextLevel(editTotalLevel.value);
  });

  // При открытии — подставляем текущие значения
  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        editClasses.value = JSON.parse(JSON.stringify(props.classes || []));
        editExperience.value = props.experience;
        forceLevelUp.value = false;
        pendingRemoveKey.value = null;
      }
    },
  );

  function incrementClassLevel(index: number) {
    if (editTotalLevel.value < 20) {
      editClasses.value[index].level += 1;
    }
  }

  function decrementClassLevel(index: number) {
    if (editClasses.value[index].level > 1) {
      editClasses.value[index].level -= 1;
    }
  }

  /**
   * Запрашивает подтверждение удаления класса
   */
  function requestRemoveClass(classKey: string) {
    pendingRemoveKey.value = classKey;
  }

  /**
   * Отменяет запрос на удаление класса
   */
  function cancelRemove() {
    pendingRemoveKey.value = null;
  }

  /**
   * Подтверждает удаление класса у актёра и всех связанных данных
   */
  function confirmRemoveClass() {
    if (!pendingRemoveKey.value) {
      return;
    }

    emit('remove-class', pendingRemoveKey.value);
    pendingRemoveKey.value = null;
    isOpen.value = false;
  }

  /**
   * Применяет изменения уровня и опыта
   */
  function applyLevelUp() {
    const xp =
      typeof editExperience.value === 'string'
        ? Number.parseInt(editExperience.value, 10)
        : editExperience.value;

    const safeXp = Number.isNaN(xp) ? 0 : Math.max(0, xp);

    if (forceLevelUp.value) {
      emit('apply', {
        classes: JSON.parse(JSON.stringify(editClasses.value)),
        experience: safeXp,
      });
    } else {
      // Собираем очередь уровней "пройти через мастер"
      const queue: Array<{ classKey: string; targetLevel: number }> = [];

      for (const editCls of editClasses.value) {
        const origCls = props.classes.find(
          (classEntry) => classEntry.classKey === editCls.classKey,
        );

        const origLevel = origCls ? origCls.level : 0;

        // Добавляем по одному таску на каждый полученный уровень
        if (editCls.level > origLevel) {
          for (let lvl = origLevel + 1; lvl <= editCls.level; lvl++) {
            queue.push({
              classKey: editCls.classKey,
              targetLevel: lvl,
            });
          }
        }
      }

      if (queue.length > 0) {
        // Мы НЕ передаём новые `classes` напрямую (они добавятся через мастер),
        // но надо отдать старые + всё остальное, что нужно. Мастер будет сам апдейтить актора.
        emit('start-wizard', {
          queue,
          experience: safeXp,
          forceApplies: props.classes, // Если есть, вернем исходные, а опыт обновится
        });
      } else {
        // Если уровни не менялись или только уменьшались - просто применяем как форс
        emit('apply', {
          classes: JSON.parse(JSON.stringify(editClasses.value)),
          experience: safeXp,
        });
      }
    }

    isOpen.value = false;
  }
</script>

<template>
  <UDraggableModal
    v-model:open="isOpen"
    :draggable="false"
    :resizable="false"
    :blocking="true"
    :min-width="360"
    :min-height="200"
    title="Повышение уровня"
    :z-index="Z_INDEX.MODAL_ELEVATED"
  >
    <template #body>
      <div class="space-y-5">
        <!-- Классы -->
        <div
          v-if="editClasses.length > 0"
          class="space-y-3"
        >
          <div
            v-for="(cls, index) in editClasses"
            :key="index"
            class="space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-highlighted">{{
                cls.className || 'Класс'
              }}</span>

              <div class="flex items-center gap-3">
                <UButton
                  icon="tabler:minus"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  :disabled="cls.level <= 1"
                  @click.left.exact.prevent="decrementClassLevel(index)"
                />

                <span
                  class="w-8 text-center text-xl font-bold text-highlighted tabular-nums"
                  >{{ cls.level }}</span
                >

                <UButton
                  icon="tabler:plus"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  :disabled="editTotalLevel >= 20 || cls.level >= 20"
                  @click.left.exact.prevent="incrementClassLevel(index)"
                />

                <UButton
                  icon="tabler:trash"
                  variant="ghost"
                  color="error"
                  size="xs"
                  title="Удалить класс и все связанные данные"
                  @click.left.exact.prevent="requestRemoveClass(cls.classKey)"
                />
              </div>
            </div>

            <!-- Инлайн-подтверждение удаления -->
            <div
              v-if="pendingRemoveKey === cls.classKey"
              class="flex items-center justify-between rounded-md bg-danger-subtle/30 px-3 py-1.5"
            >
              <span class="text-xs text-danger">
                Все особенности класса будут утеряны
              </span>

              <div class="flex items-center gap-3">
                <button
                  class="text-xs text-muted transition-colors hover:text-highlighted"
                  @click.left.exact.prevent="cancelRemove"
                >
                  Отмена
                </button>

                <button
                  class="text-xs font-medium text-danger transition-colors hover:text-danger-muted"
                  @click.left.exact.prevent="confirmRemoveClass"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else
          class="py-2 text-center text-sm text-muted italic"
        >
          У персонажа пока нет классов
        </div>

        <div class="h-px w-full bg-elevated"></div>

        <!-- Опыт -->
        <div class="space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted">Опыт (XP)</span>

              <span class="text-xs text-dimmed"
                >Следующий уровень: {{ editNextLevelXP }} XP</span
              >
            </div>

            <UInput
              v-model="editExperience"
              type="number"
              variant="none"
              :min="0"
              size="lg"
              class="w-full"
              :ui="{
                base: 'bg-white/5 text-highlighted rounded-lg px-3 py-2 focus:bg-white/10 transition-colors tabular-nums',
              }"
            />
          </div>

          <div class="flex items-center gap-2">
            <UCheckbox
              id="force-levelup-checkbox"
              v-model="forceLevelUp"
            />

            <label
              for="force-levelup-checkbox"
              class="cursor-pointer text-sm leading-none text-muted select-none"
            >
              Принудительное поднятие уровня (без мастера)
            </label>
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
            @click.left.exact.prevent="applyLevelUp"
          >
            Применить
          </UButton>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
