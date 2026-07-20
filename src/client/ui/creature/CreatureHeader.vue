<script setup lang="ts">
  import type { Creature, CreatureSystem } from '@vtt/shared/system/dnd.js';

  import { getAssetUrl } from '@vtt/shared';
  import {
    CR_OPTIONS,
    CREATURE_ALIGNMENT_OPTIONS,
    CREATURE_CATEGORY_OPTIONS,
    CREATURE_SIZE_OPTIONS,
    getAlignmentLabel,
  } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import { useImageFallback } from '@/shared_ui/composables';
  import {
    getTokenTransformStyle,
    handleImageError,
  } from '@/shared_ui/utils/domUtils';
  import {
    CREATURE_SIZE_LABELS,
    CREATURE_TYPE_LABELS,
  } from '@/systems/dnd5e/ui/actor/constants';

  interface Props {
    creature: Creature;
    isEditMode: boolean;
    isCreating?: boolean;
    canEdit?: boolean;
    worldPort?: number;
  }

  const props = withDefaults(defineProps<Props>(), {
    isCreating: false,
    canEdit: true,
    worldPort: undefined,
  });

  const emit = defineEmits<{
    'update': [updates: Partial<Creature>];
    'update:system': [updates: Partial<CreatureSystem>];
    'toggle-edit-mode': [];
    'open-settings': [];
    'short-rest': [];
    'long-rest': [];
    'close': [];
    'save': [];
  }>();

  // Вычисляемые свойства для аватара/токена
  const tokenFrame = computed(() => {
    const frameUrl = props.creature.token?.frameUrl;

    if (!frameUrl) {
      return null;
    }

    return getAssetUrl(frameUrl, props.worldPort);
  });

  const tokenImageStyle = computed(() =>
    getTokenTransformStyle(props.creature.token),
  );

  // Показ картинки токена с фолбэком на иконку при пустом/битом пути
  const { showImage: showTokenImage, handleImageError: onTokenImageError } =
    useImageFallback(() => props.creature.token?.imageUrl);

  function updateField(field: keyof Creature, value: Creature[keyof Creature]) {
    emit('update', { [field]: value });
  }

  /**
   * Возвращает скрытый экземпляр существа в список бестиария: снимает флаг
   * isInstance, после чего копия перестаёт быть «эфемерной» (не удалится при
   * удалении токена) и снова показывается в списке существ.
   */
  function restoreInstanceToList(): void {
    emit('update', { isInstance: false });
  }

  function updateSystemField<K extends keyof CreatureSystem>(
    field: K,
    value: CreatureSystem[K],
  ) {
    emit('update:system', { [field]: value });
  }

  const sizeLabel = computed(() => {
    return CREATURE_SIZE_LABELS[props.creature.system.size];
  });

  const typeLabel = computed(() => {
    return CREATURE_TYPE_LABELS[props.creature.system.type];
  });

  const challengeRatingLabel = computed(() => {
    const crValue = props.creature.system.challengeRating;
    const option = CR_OPTIONS.find((opt) => opt.value === crValue);

    return option ? option.label : crValue;
  });
</script>

<template>
  <header
    class="relative overflow-hidden rounded-t-2xl"
    :style="{ cursor: canEdit ? 'move' : 'default', userSelect: 'none' }"
  >
    <div class="relative z-10 flex w-full items-center gap-6 px-6 pt-8 pb-10">
      <!-- Аватар и Рамка -->
      <div
        class="relative -my-2 flex h-28 w-28 shrink-0 items-center justify-center"
      >
        <div
          class="relative h-full w-full bg-elevated"
          style="clip-path: circle(44% at 50% 50%); overflow: hidden"
        >
          <img
            v-if="showTokenImage"
            :src="getAssetUrl(creature.token?.imageUrl, worldPort) || undefined"
            :alt="creature.name"
            class="absolute inset-0 h-full w-full max-w-none object-contain transition-none select-none"
            :style="tokenImageStyle"
            draggable="false"
            @error="onTokenImageError"
          />

          <div
            v-else
            class="absolute inset-0 flex items-center justify-center text-dimmed"
          >
            <UIcon
              name="tabler:alien"
              class="h-1/2 w-1/2"
            />
          </div>
        </div>

        <img
          v-if="tokenFrame"
          :src="tokenFrame"
          alt="Token frame"
          class="pointer-events-none absolute inset-0 h-full w-full object-contain drop-shadow-xl select-none"
          draggable="false"
          @error="handleImageError"
        />
      </div>

      <!-- Основная информация -->
      <div class="flex min-w-0 flex-1 items-center justify-between">
        <div class="w-full min-w-0 flex-1 space-y-1 pr-4">
          <!-- Имя -->
          <div class="flex min-h-[44px] items-center">
            <div
              v-if="isEditMode"
              class="flex w-full items-center gap-2"
            >
              <UInput
                :model-value="creature.name"
                placeholder="Имя существа"
                variant="none"
                size="xl"
                class="flex-1"
                :ui="{
                  base: 'bg-white/5 text-3xl font-serif text-highlighted placeholder-muted rounded-lg px-3 py-1 focus:bg-white/10 transition-colors',
                }"
                @update:model-value="updateField('name', $event)"
              />

              <span class="text-2xl text-muted">/</span>

              <UInput
                :model-value="creature.nameEn"
                placeholder="English Name"
                variant="none"
                size="xl"
                class="flex-1"
                :ui="{
                  base: 'bg-white/5 text-2xl font-serif text-highlighted placeholder-muted rounded-lg px-3 py-1 focus:bg-white/10 transition-colors',
                }"
                @update:model-value="updateField('nameEn', $event)"
              />
            </div>

            <h2
              v-else
              class="font-serif text-3xl tracking-wide text-highlighted"
            >
              {{ creature.name }}
              <span
                v-if="creature.nameEn"
                class="text-2xl text-muted"
              >
                / {{ creature.nameEn }}
              </span>
            </h2>
          </div>

          <!-- Размер, Вид, Мировоззрение -->
          <div
            v-if="isEditMode"
            class="mt-2 grid grid-cols-3 gap-2"
          >
            <USelect
              :model-value="creature.system.size"
              :items="CREATURE_SIZE_OPTIONS"
              value-key="value"
              label-key="label"
              placeholder="Размер"
              size="xs"
              @update:model-value="updateSystemField('size', $event)"
            />

            <USelect
              :model-value="creature.system.type"
              :items="CREATURE_CATEGORY_OPTIONS"
              value-key="value"
              label-key="label"
              placeholder="Вид"
              size="xs"
              @update:model-value="updateSystemField('type', $event)"
            />

            <USelect
              :model-value="creature.system.alignment"
              :items="CREATURE_ALIGNMENT_OPTIONS"
              value-key="value"
              label-key="label"
              placeholder="Мировоззрение"
              size="xs"
              @update:model-value="updateSystemField('alignment', $event)"
            />
          </div>

          <div
            v-else
            class="flex min-h-[28px] flex-wrap items-center gap-x-2 gap-y-1 text-toned"
          >
            <span class="text-toned">{{ sizeLabel }}</span>

            <span class="text-dimmed">—</span>

            <span class="text-toned">{{ typeLabel }}</span>

            <span class="text-dimmed">—</span>

            <span class="text-toned">{{
              getAlignmentLabel(creature.system.alignment)
              || creature.system.alignment
              || 'Без мировоззрения'
            }}</span>
          </div>

          <!-- Уровень (ПО) -->
          <div
            class="flex items-center gap-2 pt-1 text-xs font-medium text-muted"
          >
            <div class="whitespace-nowrap">Уровень (ПО)</div>

            <div class="flex items-center whitespace-nowrap">
              <USelect
                v-if="isEditMode"
                :model-value="creature.system.challengeRating"
                :items="CR_OPTIONS"
                value-key="value"
                label-key="label"
                size="2xs"
                class="w-32"
                @update:model-value="
                  updateSystemField('challengeRating', $event)
                "
              />

              <span
                v-else
                class="font-bold text-highlighted"
                >{{ challengeRatingLabel }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Кнопки управления (правый верхний угол) -->
    <div class="absolute top-4 right-4 z-20 flex items-center gap-2">
      <!-- Кнопка Создать (только при создании нового существа) -->
      <button
        v-if="isCreating"
        class="flex h-8 items-center gap-1.5 rounded-full border border-success/50 bg-success/80 px-3 text-sm font-medium text-white transition-colors hover:bg-success/70"
        title="Создать существо"
        @click.left.exact.prevent="emit('save')"
      >
        <UIcon
          name="tabler:check"
          class="h-4 w-4"
        />
        Создать
      </button>

      <!-- Toggle Edit Mode -->
      <button
        v-else-if="canEdit"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-default/50 bg-elevated/30 transition-colors hover:bg-accented/50"
        :class="
          isEditMode ? 'text-primary' : 'text-muted hover:text-highlighted'
        "
        title="Режим редактирования"
        @click.left.exact.prevent="emit('toggle-edit-mode')"
      >
        <UIcon
          :name="isEditMode ? 'tabler:lock-open' : 'tabler:lock-filled'"
          class="h-4 w-4"
        />
      </button>

      <!-- Вернуть скрытый экземпляр в список существ -->
      <button
        v-if="canEdit && !isCreating && creature.isInstance"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-default/50 bg-elevated/30 text-muted transition-colors hover:bg-accented/50 hover:text-highlighted"
        title="Вернуть в список существ"
        @click.left.exact.prevent="restoreInstanceToList"
      >
        <UIcon
          name="tabler:list-search"
          class="h-4 w-4"
        />
      </button>

      <!-- Settings Button -->
      <button
        v-if="canEdit && !isCreating"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-default/50 bg-elevated/30 text-muted transition-colors hover:bg-accented/50 hover:text-highlighted"
        title="Настройки токена"
        @click.left.exact.prevent="emit('open-settings')"
      >
        <UIcon
          name="tabler:settings-filled"
          class="h-4 w-4"
        />
      </button>

      <!-- Close Button -->
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full border border-default/50 bg-elevated/30 text-muted transition-colors hover:bg-accented/50 hover:text-highlighted"
        @click.left.exact.prevent="emit('close')"
      >
        <svg
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <!-- Кнопки отдыха (второй ряд, у золотой линии) -->
    <div
      v-if="canEdit && !isCreating"
      class="absolute right-4 bottom-10 z-20 flex items-center gap-2"
    >
      <UTooltip text="Короткий отдых">
        <UButton
          icon="tabler:campfire"
          color="neutral"
          variant="ghost"
          size="md"
          square
          class="border border-default/50 bg-elevated/30 text-muted hover:bg-accented/50 hover:text-highlighted"
          @click.left.exact.prevent="emit('short-rest')"
        />
      </UTooltip>

      <UTooltip text="Продолжительный отдых">
        <UButton
          icon="tabler:moon"
          color="neutral"
          variant="ghost"
          size="md"
          square
          class="border border-default/50 bg-elevated/30 text-muted hover:bg-accented/50 hover:text-highlighted"
          @click.left.exact.prevent="emit('long-rest')"
        />
      </UTooltip>
    </div>

    <!-- Golden Divider -->
    <div class="absolute bottom-0 left-0 mb-1 flex w-full items-center gap-3">
      <div class="h-px flex-1 bg-gold/50" />

      <div class="h-3 w-3 rotate-45 border border-gold opacity-80" />

      <div class="h-px flex-1 bg-gold/50" />
    </div>
  </header>
</template>
