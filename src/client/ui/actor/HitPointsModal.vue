<script setup lang="ts">
  import type {
    ActorClassEntry,
    HitDie,
    ManualHitDieGroup,
  } from '@vtt/shared/system/dnd.js';

  import { getHitDiceGroups } from '@vtt/shared/system/dnd.js';
  import { computed, reactive, ref, watch } from 'vue';

  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { Z_INDEX } from '@/shared_ui/consts';

  /** Доступные размеры костей хитов */
  const HIT_DIE_OPTIONS: HitDie[] = [6, 8, 10, 12];

  interface HitPointsData {
    current: number;
    max: number;
    temp: number;
    classes?: ActorClassEntry[];
    manualHitDice?: ManualHitDieGroup[];
  }

  interface Props {
    open: boolean;
    currentHitPoints: number;
    maxHitPoints: number;
    tempHitPoints: number;
    classes?: ActorClassEntry[];
    manualHitDice?: ManualHitDieGroup[];
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'apply': [data: HitPointsData];
  }>();

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value),
  });

  const editHp = reactive<HitPointsData>({
    current: 0,
    max: 1,
    temp: 0,
  });

  const editClasses = ref<ActorClassEntry[]>([]);
  const editManualHitDice = ref<ManualHitDieGroup[]>([]);

  /** Есть ли классы с костями хитов у актора */
  const hasClassHitDice = computed(() =>
    editClasses.value.some((cls) => Boolean(cls.hitDie)),
  );

  // При открытии — подставляем текущие значения
  watch(
    () => props.open,
    (opened) => {
      if (opened) {
        editHp.current = props.currentHitPoints;
        editHp.max = props.maxHitPoints;
        editHp.temp = props.tempHitPoints;
        editClasses.value = JSON.parse(JSON.stringify(props.classes ?? []));

        editManualHitDice.value = JSON.parse(
          JSON.stringify(props.manualHitDice ?? []),
        );
      }
    },
  );

  // Группируем только классовые кости — ручные показываются отдельным блоком
  const hitDiceGroups = computed(() => getHitDiceGroups(editClasses.value));

  function adjustHitDieUsed(die: number, delta: number) {
    let remainingDelta = Math.abs(delta);

    const targetClasses = editClasses.value.filter((cls) => cls.hitDie === die);

    if (delta > 0) {
      // Тратим кость
      for (const cls of targetClasses) {
        const available = cls.level - (cls.hitDiceUsed ?? 0);

        if (available > 0) {
          const spend = Math.min(available, remainingDelta);

          cls.hitDiceUsed = (cls.hitDiceUsed ?? 0) + spend;
          remainingDelta -= spend;

          if (remainingDelta <= 0) {
            break;
          }
        }
      }
    } else {
      // Восстанавливаем кость
      for (const cls of targetClasses) {
        const used = cls.hitDiceUsed ?? 0;

        if (used > 0) {
          const restore = Math.min(used, remainingDelta);

          cls.hitDiceUsed = used - restore;
          remainingDelta -= restore;

          if (remainingDelta <= 0) {
            break;
          }
        }
      }
    }
  }

  /** Добавляет новую группу ручных костей хитов */
  function addManualHitDieGroup() {
    editManualHitDice.value.push({ die: 8, total: 1, used: 0 });
  }

  /** Удаляет группу ручных костей хитов по индексу */
  function removeManualHitDieGroup(index: number) {
    editManualHitDice.value.splice(index, 1);
  }

  /** Применяет изменения очков здоровья и костей хитов */
  function applyHitPoints() {
    emit('apply', {
      current: editHp.current,
      max: editHp.max,
      temp: editHp.temp,
      classes: editClasses.value,
      manualHitDice: editManualHitDice.value,
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
    :min-height="250"
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

        <!-- Кости хитов (из классов) -->
        <div
          v-if="hasClassHitDice"
          class="flex flex-col gap-2"
        >
          <span
            class="text-[10px] font-bold tracking-wider text-muted uppercase"
          >
            Кости хитов (из классов)
          </span>

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
            </div>

            <div class="flex items-center gap-3">
              <span class="text-sm">
                Доступно:
                <span class="font-bold text-highlighted">{{
                  group.available
                }}</span>

                <span class="text-dimmed"> / {{ group.total }}</span>
              </span>

              <div class="flex items-center gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="tabler:minus"
                  :disabled="group.used === 0"
                  @click.left.exact.prevent="adjustHitDieUsed(group.die, -1)"
                />

                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="tabler:plus"
                  :disabled="group.available === 0"
                  @click.left.exact.prevent="adjustHitDieUsed(group.die, 1)"
                />
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="hasClassHitDice && editManualHitDice.length > 0"
          class="border-t border-muted"
        />

        <!-- Кости хитов (ручной ввод) -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span
              class="text-[10px] font-bold tracking-wider text-muted uppercase"
            >
              {{
                hasClassHitDice ? 'Дополнительные кости хитов' : 'Кости хитов'
              }}
            </span>

            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="tabler:plus"
              @click.left.exact.prevent="addManualHitDieGroup"
            >
              Добавить
            </UButton>
          </div>

          <div
            v-if="editManualHitDice.length === 0 && !hasClassHitDice"
            class="text-sm text-dimmed"
          >
            Нет доступных костей хитов.
          </div>

          <div
            v-for="(group, groupIndex) in editManualHitDice"
            :key="groupIndex"
            class="flex items-center gap-2 rounded bg-elevated/40 p-2"
          >
            <!-- Сейчас (доступно) -->
            <div class="flex flex-col gap-0.5">
              <span
                class="text-[9px] font-medium tracking-wider text-dimmed uppercase"
              >
                Сейчас
              </span>

              <UInput
                :model-value="group.total - group.used"
                type="number"
                :min="0"
                :max="group.total"
                size="sm"
                class="w-16"
                @update:model-value="
                  group.used =
                    group.total
                    - Math.max(0, Math.min(group.total, Number($event)))
                "
              />
            </div>

            <span class="mt-4 font-light text-dimmed">/</span>

            <!-- Всего -->
            <div class="flex flex-col gap-0.5">
              <span
                class="text-[9px] font-medium tracking-wider text-dimmed uppercase"
              >
                Всего
              </span>

              <UInput
                :model-value="group.total"
                type="number"
                :min="1"
                size="sm"
                class="w-16"
                @update:model-value="
                  group.total = Math.max(1, Number($event));
                  group.used = Math.min(group.used, group.total);
                "
              />
            </div>

            <!-- Размер кости -->
            <div class="flex flex-1 flex-col gap-0.5">
              <span
                class="text-[9px] font-medium tracking-wider text-dimmed uppercase"
              >
                Кость
              </span>

              <USelect
                :model-value="group.die"
                :items="
                  HIT_DIE_OPTIONS.map((hitDie) => ({
                    label: `к${hitDie}`,
                    value: hitDie,
                  }))
                "
                size="sm"
                @update:model-value="group.die = Number($event) as HitDie"
              />
            </div>

            <!-- Удалить -->
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="tabler:trash"
              class="mt-4"
              @click.left.exact.prevent="removeManualHitDieGroup(groupIndex)"
            />
          </div>
        </div>

        <div class="border-t border-muted" />

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
