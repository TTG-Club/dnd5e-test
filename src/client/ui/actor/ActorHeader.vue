<script setup lang="ts">
  import type { Actor } from '@vtt/shared/system/dnd.js';

  import { getAssetUrl } from '@vtt/shared';
  import {
    calculateExperienceForNextLevel,
    getTotalLevel,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import { useImageFallback } from '@/shared_ui/composables';

  import { CREATURE_SIZE_LABELS, CREATURE_TYPE_LABELS } from './constants';
  import LevelUpModal from './LevelUpModal.vue';

  interface Props {
    actor: Actor;
    isEditMode: boolean;
    isCreating?: boolean;
    canEdit?: boolean;
    /** Является ли текущий пользователь ГМ (может менять вдохновение) */
    isAdmin?: boolean;
    worldPort?: number;
  }

  const props = withDefaults(defineProps<Props>(), {
    isCreating: false,
    canEdit: true,
    isAdmin: false,
    worldPort: undefined,
  });

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
    'toggle-edit-mode': [];
    'open-settings': [];
    'short-rest': [];
    'long-rest': [];
    'save': [];
    'close': [];
    'start-wizard': [
      data: {
        queue: Array<{ classKey: string; targetLevel: number }>;
        experience: number;
        forceApplies: import('@vtt/shared').ActorClassEntry[];
      },
    ];
    'remove-class': [classKey: string];
  }>();

  // Вычисляемые свойства

  const tokenFrame = computed(() => {
    const frameUrl = props.actor.token?.frameUrl;

    if (!frameUrl) {
      return null;
    }

    return getAssetUrl(frameUrl, props.worldPort);
  });

  // Показ аватара с фолбэком на иконку при пустом/битом пути
  const { showImage: showTokenImage, handleImageError: onTokenImageError } =
    useImageFallback(() => props.actor.token?.imageUrl || props.actor.avatar);

  const tokenImageStyle = computed(() => {
    const token = props.actor.token;
    const textureScale = token?.textureScale ?? 1;
    const textureX = token?.textureX ?? 0.5;
    const textureY = token?.textureY ?? 0.5;
    const rotation = token?.rotation ?? 0;

    // Порядок: translate → scale → rotate (CSS читает справа налево)
    return {
      transform: `translate(${(textureX - 0.5) * 100}%, ${(textureY - 0.5) * 100}%) scale(${textureScale}) rotate(${rotation}deg)`,
      transformOrigin: 'center center',
    };
  });

  /** Описание одного типа зрения для бейджа-тултипа */
  interface VisionEntry {
    /** Иконка типа зрения (Tabler) */
    icon: string;
    /** Название типа зрения */
    label: string;
    /** Дальность в футах (0 = без ограничений) */
    range: number;
  }

  /**
   * Доступные типы зрения актёра из `token.vision`.
   * Расширяемо: при появлении новых типов зрения достаточно добавить запись.
   */
  const visionEntries = computed<VisionEntry[]>(() => {
    const vision = props.actor.token?.vision;

    if (!vision?.enabled) {
      return [];
    }

    const entries: VisionEntry[] = [];

    // Обычное зрение (range === 0 трактуется как без ограничений)
    entries.push({
      icon: 'tabler:eye',
      label: 'Обычное зрение',
      range: vision.range,
    });

    // Тёмное зрение
    if (vision.darkvision > 0) {
      entries.push({
        icon: 'tabler:moon',
        label: 'Тёмное зрение',
        range: vision.darkvision,
      });
    }

    return entries;
  });

  /**
   * Форматирует дальность зрения для отображения.
   * @param range - дальность в футах (0 = без ограничений)
   * @returns строка вида "60 фт." или "без ограничений"
   */
  function formatVisionRange(range: number): string {
    return range > 0 ? `${range} фт.` : 'без ограничений';
  }

  /** Суммарный уровень из всех классов */
  const totalLevel = computed(() => {
    return getTotalLevel(props.actor.system.classes);
  });

  /** Лейбл основного класса: "Воин 5" или "Класс не выбран" */
  const mainClassLabel = computed(() => {
    const classes = props.actor.system.classes;

    if (!classes || classes.length === 0) {
      return '';
    }

    return classes
      .map((entry) => `${entry.className} ${entry.level}`)
      .join(' / ');
  });

  /** Лейбл предыстории: "Послушник" или "" */
  const backgroundLabel = computed(() => {
    return props.actor.system.background?.backgroundName ?? '';
  });

  const nextLevelXP = computed(() => {
    return calculateExperienceForNextLevel(totalLevel.value);
  });

  const xpProgress = computed(() => {
    if (nextLevelXP.value === 0) {
      return 100;
    }

    return Math.min(
      100,
      Math.max(0, (props.actor.system.experience / nextLevelXP.value) * 100),
    );
  });

  /**
   * Обновляет поле актёра (name, description — корневые поля)
   */
  function updateField(field: keyof Actor, value: Actor[keyof Actor]) {
    emit('update:actor', { [field]: value });
  }

  /** Есть ли у персонажа вдохновение (у старых актёров поле отсутствует → нет) */
  const hasInspiration = computed(
    () => props.actor.system.inspiration === true,
  );

  /**
   * Даёт или забирает вдохновение (только ГМ). По правилам D&D оно либо есть,
   * либо нет — поэтому просто переключаем.
   */
  function toggleInspiration() {
    if (!props.isAdmin) {
      return;
    }

    emit('update:actor', {
      system: {
        ...props.actor.system,
        inspiration: !hasInspiration.value,
      },
    });
  }

  /** Подсказка для блока вдохновения (зависит от роли и текущего состояния) */
  const inspirationTooltip = computed(() => {
    if (!props.isAdmin) {
      return hasInspiration.value
        ? 'У персонажа есть вдохновение'
        : 'У персонажа нет вдохновения';
    }

    return hasInspiration.value ? 'Забрать вдохновение' : 'Дать вдохновение';
  });

  /** Классы блока вдохновения: активный (золотой) или приглушённый */
  const inspirationClass = computed(() => {
    const interactive = props.isAdmin
      ? 'cursor-pointer hover:border-gold/70'
      : 'cursor-default';

    const state = hasInspiration.value
      ? 'border-gold/60 bg-gold/15 text-gold'
      : 'border-default/50 bg-elevated/30 text-muted';

    return `${interactive} ${state}`;
  });

  // Модалка повышения уровня
  const isLevelUpOpen = ref(false);

  /**
   * Открывает модалку повышения уровня
   */
  function addExperience() {
    isLevelUpOpen.value = true;
  }

  /**
   * Применяет изменения уровня (по классам) и опыта
   */
  function onLevelUpApply(data: {
    classes: import('@vtt/shared').ActorClassEntry[];
    experience: number;
  }) {
    emit('update:actor', {
      system: {
        ...props.actor.system,
        classes: data.classes,
        experience: data.experience,
      },
    });
  }

  /**
   * Скрывает элемент при ошибке загрузки изображения
   */
  function handleImageError(event: Event) {
    if (event.target) {
      (event.target as HTMLImageElement).style.display = 'none';
    }
  }
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
        <!-- Маска аватара под рамку (как в ActorSettingsModal) -->
        <div
          class="relative h-full w-full bg-elevated"
          style="clip-path: circle(44% at 50% 50%); overflow: hidden"
        >
          <img
            v-if="showTokenImage"
            :src="
              getAssetUrl(actor.token?.imageUrl || actor.avatar, worldPort)
              || undefined
            "
            :alt="actor.name"
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
              name="tabler:user"
              class="h-1/2 w-1/2"
            />
          </div>
        </div>

        <!-- Рамка токена -->
        <img
          v-if="tokenFrame"
          :src="tokenFrame"
          alt="Token frame"
          class="pointer-events-none absolute inset-0 h-full w-full object-contain drop-shadow-xl select-none"
          draggable="false"
          @error="handleImageError"
        />

        <!-- Бейдж зрения (глазик с тултипом о типах зрения актёра) -->
        <UTooltip
          v-if="visionEntries.length > 0"
          :delay-duration="150"
          :content="{ side: 'bottom' }"
          class="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2"
        >
          <div
            class="flex h-6 w-6 cursor-help items-center justify-center rounded-full border border-gold/40 bg-elevated/95 text-gold shadow-md transition-colors hover:border-gold/80"
          >
            <UIcon
              name="tabler:eye"
              class="h-4 w-4"
            />
          </div>

          <!-- Тултип со списком типов зрения -->
          <template #content>
            <div class="flex flex-col gap-1 px-1 py-0.5 text-[11px]">
              <div
                v-for="entry in visionEntries"
                :key="entry.label"
                class="flex items-center gap-1.5 whitespace-nowrap"
              >
                <UIcon
                  :name="entry.icon"
                  class="h-3.5 w-3.5 shrink-0 text-gold"
                />

                <span class="font-medium">{{ entry.label }}:</span>

                <span class="ml-auto text-dimmed">
                  {{ formatVisionRange(entry.range) }}
                </span>
              </div>
            </div>
          </template>
        </UTooltip>
      </div>

      <!-- Основная информация -->
      <div class="flex min-w-0 flex-1 items-center justify-between">
        <div class="w-full min-w-0 flex-1 space-y-1 pr-4">
          <!-- Имя -->
          <div class="flex min-h-[44px] items-center">
            <UInput
              v-if="isEditMode"
              :model-value="actor.name"
              placeholder="Имя персонажа"
              variant="none"
              size="xl"
              class="w-full"
              :ui="{
                base: 'bg-white/5 text-3xl font-serif text-highlighted placeholder-gray-600 rounded-lg px-3 py-1 focus:bg-white/10 transition-colors',
              }"
              @update:model-value="updateField('name', $event)"
            />

            <h2
              v-else
              class="font-serif text-3xl tracking-wide text-highlighted"
            >
              {{ actor.name }}
            </h2>
          </div>

          <!-- Раса и класс -->
          <div
            class="flex min-h-[28px] flex-wrap items-center gap-x-2 gap-y-1 text-toned"
          >
            <span
              v-if="actor.system.species?.speciesName"
              class="text-toned"
              >{{ actor.system.species.speciesName }}
              <span
                v-if="
                  actor.system.species.creatureType || actor.system.species.size
                "
                class="text-dimmed"
              >
                ({{
                  [
                    actor.system.species.creatureType
                      ? CREATURE_TYPE_LABELS[actor.system.species.creatureType]
                        || actor.system.species.creatureType
                      : '',
                    actor.system.species.size
                      ? CREATURE_SIZE_LABELS[actor.system.species.size]
                        || actor.system.species.size
                      : '',
                  ]
                    .filter(Boolean)
                    .join(', ')
                }})
              </span>
            </span>

            <span
              v-else
              class="text-dimmed italic"
              >Вид не выбран</span
            >

            <span class="text-dimmed">—</span>

            <span
              v-if="mainClassLabel"
              class="text-toned"
              >{{ mainClassLabel }}</span
            >

            <span
              v-else
              class="text-dimmed italic"
              >Класс не выбран</span
            >

            <span class="text-dimmed">—</span>

            <span
              v-if="backgroundLabel"
              class="text-toned"
              >{{ backgroundLabel }}</span
            >

            <span
              v-else
              class="text-dimmed italic"
              >Предыстория не выбрана</span
            >
          </div>

          <!-- Уровень и опыт -->
          <div
            class="flex max-w-xl items-center gap-4 pt-1 text-xs font-medium text-muted"
          >
            <div class="whitespace-nowrap">Уровень {{ totalLevel }}</div>

            <!-- Прогресс-бар опыта -->
            <div class="relative mx-2 flex-1">
              <div
                class="h-[2px] w-full overflow-hidden rounded-full bg-elevated"
              >
                <div
                  class="h-full bg-linear-to-r from-gold/60 to-gold transition-all duration-300"
                  :style="{ width: `${xpProgress}%` }"
                />
              </div>

              <div
                class="absolute inset-0 mt-4 flex items-center justify-center text-[10px] tracking-widest text-dimmed"
              >
                {{ actor.system.experience }} / {{ nextLevelXP }} XP
              </div>
            </div>

            <div class="flex items-center gap-1 whitespace-nowrap">
              Уровень {{ totalLevel + 1 }}
              <UButton
                v-if="isEditMode"
                icon="tabler:circle-plus"
                variant="ghost"
                color="neutral"
                size="2xs"
                :ui="{
                  base: 'text-gold hover:text-gold hover:bg-gold/20',
                }"
                title="Добавить опыт"
                @click.left.exact.prevent="addExperience"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Кнопки управления (правый верхний угол) -->
    <div class="absolute top-4 right-4 z-20 flex items-center gap-2">
      <!-- Кнопка Создать (при создании нового персонажа) -->
      <button
        v-if="isCreating"
        class="flex h-8 items-center gap-1.5 rounded-full border border-success/50 bg-success/80 px-3 text-sm font-medium text-white transition-colors hover:bg-success/70"
        title="Создать персонажа"
        @click.left.exact.prevent="emit('save')"
      >
        <UIcon
          name="tabler:check"
          class="h-4 w-4"
        />
        Создать
      </button>

      <!-- Toggle Edit Mode (только для существующих персонажей) -->
      <button
        v-else-if="canEdit"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-default/50 bg-elevated/30 transition-colors hover:bg-accented/50"
        :class="isEditMode ? 'text-gold' : 'text-muted hover:text-highlighted'"
        title="Режим редактирования"
        @click.left.exact.prevent="emit('toggle-edit-mode')"
      >
        <UIcon
          :name="isEditMode ? 'tabler:lock-open' : 'tabler:lock-filled'"
          class="h-4 w-4"
        />
      </button>

      <!-- Settings Button -->
      <button
        v-if="canEdit && !isCreating"
        class="flex h-8 w-8 items-center justify-center rounded-full border border-default/50 bg-elevated/30 text-muted transition-colors hover:bg-accented/50 hover:text-highlighted"
        title="Настройки токена и прав"
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

    <!-- Кнопки отдыха и вдохновение (второй ряд, у золотой линии) -->
    <div
      v-if="!isCreating"
      class="absolute right-4 bottom-10 z-20 flex items-center gap-2"
    >
      <!-- Вдохновение: есть/нет, даёт и забирает только ГМ -->
      <UTooltip :text="inspirationTooltip">
        <component
          :is="isAdmin ? 'button' : 'div'"
          class="flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors"
          :class="inspirationClass"
          @click.left.exact.prevent="toggleInspiration"
        >
          <UIcon
            name="tabler:sparkles"
            class="h-4 w-4"
          />

          Вдохновение
        </component>
      </UTooltip>

      <UTooltip
        v-if="canEdit"
        text="Короткий отдых"
      >
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

      <UTooltip
        v-if="canEdit"
        text="Продолжительный отдых"
      >
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

  <!-- Модалка повышения уровня -->
  <LevelUpModal
    v-model:open="isLevelUpOpen"
    :classes="actor.system.classes"
    :experience="actor.system.experience"
    @apply="onLevelUpApply"
    @start-wizard="(data) => emit('start-wizard', data)"
    @remove-class="(classKey) => emit('remove-class', classKey)"
  />
</template>
