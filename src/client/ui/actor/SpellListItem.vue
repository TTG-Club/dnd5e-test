<script setup lang="ts">
  import type { Actor, GameItem, Spell } from '@vtt/shared/system/dnd.js';

  import {
    formatConditionalDamageDisplay,
    getSpellDamageParts,
    resolveActorStats,
    resolveSpellDamageFormula,
    SPELL_USES_RECOVERY_LABELS,
    stripDamageTypeTokens,
    stripFormulaVariables,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import { startHotbarDrag } from '@/core/utils/hotbarDrag';
  import { ContextMenuDangerItem } from '@/shared_ui/components';
  import FieldGroupReset from '@/shared_ui/components/FieldGroupReset.vue';

  import { SPELL_MIME } from './constants';
  import { extractSpellFromGameItem } from './utils/extractSpellFromGameItem';

  defineOptions({ inheritAttrs: false });

  const props = defineProps<{
    /** Данные заклинания или предмет-заклинание */
    item: Spell | GameItem;
    /** Показывать «Скопировать» в контекстном меню */
    showCopy?: boolean;
    /** Показывать «Редактировать» в контекстном меню */
    showEdit?: boolean;
    /** Показывать «Удалить» в контекстном меню */
    showDelete?: boolean;
    /** Показывать «Применить» в контекстном меню */
    showCast?: boolean;
    /** Показывать чекбокс подготовки */
    showPrepare?: boolean;
    /** ID актора-владельца (для перетаскивания на хотбар) */
    actorId?: string;
    /**
     * ID существа-владельца. Если задан — перетаскивание на хотбар создаёт
     * макрос `creature-spell` (вместо `spell-cast` актора).
     */
    creatureId?: string;
    /** Актор-владелец — для подстановки @-переменных в формуле урона при показе */
    actor?: Actor;
    /** Проп для режима редактирования: показывает inline-иконки */
    isEditMode?: boolean;
  }>();

  const emit = defineEmits<{
    /** Клик по строке (открыть детальник) */
    'click': [];
    /** Скопировать */
    'copy': [];
    /** Редактировать */
    'edit': [];
    /** Удалить */
    'delete': [];
    /** Применить */
    'cast': [];
    /** Изменить подготовку */
    'update:prepared': [value: boolean];
    /** Отправить в чат */
    'share': [];
  }>();

  const spellObject = computed<Spell>(() => {
    if (
      'type' in props.item
      && props.item.type === 'spell'
      && 'spellData' in props.item
      && props.item.spellData
    ) {
      return extractSpellFromGameItem(props.item as GameItem);
    }

    return props.item as Spell;
  });

  /**
   * Формула урона для отображения: при известном акторе подставляет
   * @-переменные конкретным числом; без актора (глобальный список предметов)
   * убирает @-токены, оставляя только кубиковую часть. Затем переводит кости
   * d→к для русского вида.
   */
  const damageFormulaDisplay = computed(() => {
    const stats = props.actor ? resolveActorStats(props.actor) : null;

    const parts = getSpellDamageParts(spellObject.value)
      .map((part) => {
        // Инлайн-токены @dmg.<type> — это метки типа, не переменные роллера;
        // убираем их до подстановки @-переменных (иначе resolveVariable падает).
        // Условные ветки @target.* показываем через «или» (formatConditional...).
        const resolveTerm = (subFormula: string): string => {
          const baseFormula = stripDamageTypeTokens(subFormula);

          return props.actor && stats
            ? resolveSpellDamageFormula(
                spellObject.value,
                props.actor,
                baseFormula,
                stats,
              )
            : stripFormulaVariables(baseFormula);
        };

        return formatConditionalDamageDisplay(
          part.formula,
          resolveTerm,
        ).replace(/(\d+)d(\d+)/gi, '$1к$2');
      })
      .filter((formula) => formula.length > 0);

    return parts.join(' + ');
  });

  /**
   * Начинает перетаскивание заклинания на хотбар.
   *
   * @param event - событие dragstart
   */
  function handleDragStart(event: DragEvent): void {
    const spell = spellObject.value;

    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(SPELL_MIME, JSON.stringify(spell));

    if (props.creatureId) {
      startHotbarDrag(event, {
        id: `${props.creatureId}-spell-${spell.id}`,
        type: 'creature-spell',
        label: spell.name,
        icon: 'tabler:wand',
        ref: spell.id,
        actorId: props.creatureId,
      });

      return;
    }

    startHotbarDrag(event, {
      id: spell.id,
      type: 'spell-cast',
      label: spell.name,
      icon: 'tabler:wand',
      ref: spell.id,
      actorId: props.actorId,
    });
  }

  /** Заряды заклинания для отображения (current/max + способ отката) */
  const usesBadge = computed<{ text: string; title: string } | null>(() => {
    const uses = spellObject.value.uses;

    if (!uses || uses.recovery === 'atWill') {
      return null;
    }

    return {
      text: `${uses.current}/${uses.max}`,
      title: SPELL_USES_RECOVERY_LABELS[uses.recovery],
    };
  });

  // --- Контекстное меню ---
  const isMenuOpen = ref(false);
  const menuX = ref(0);
  const menuY = ref(0);

  /** Есть ли пункты для контекстного меню */
  const hasContextMenu = computed(
    () =>
      props.showCopy || props.showEdit || props.showDelete || props.showCast,
  );

  /**
   * Показывает контекстное меню
   *
   * @param event - событие contextmenu
   */
  function openContextMenu(event: MouseEvent): void {
    if (!hasContextMenu.value) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    menuX.value = event.clientX;
    menuY.value = event.clientY;
    isMenuOpen.value = true;
  }

  /**
   * Обработчик выбора пункта меню
   *
   * @param action - действие
   */
  function handleAction(
    action: 'copy' | 'edit' | 'delete' | 'cast' | 'share',
  ): void {
    isMenuOpen.value = false;

    if (action === 'copy') {
      emit('copy');
    } else if (action === 'edit') {
      emit('edit');
    } else if (action === 'delete') {
      emit('delete');
    } else if (action === 'cast') {
      emit('cast');
    } else if (action === 'share') {
      emit('share');
    }
  }

  /** Закрывает меню при клике снаружи */
  function closeMenu(): void {
    isMenuOpen.value = false;
  }

  /** Обработка клика по чекбоксу подготовки */
  function togglePrepared(): void {
    emit('update:prepared', !spellObject.value.prepared);
  }
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Чекбокс подготовки -->
    <button
      v-if="showPrepare && spellObject.level > 0"
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
      :class="[
        spellObject.prepared || spellObject.alwaysPrepared
          ? 'border-success bg-success/20 text-healing'
          : 'border-accented text-transparent hover:border-accented',
      ]"
      :title="
        spellObject.alwaysPrepared ? 'Всегда подготовлено' : 'Подготовить'
      "
      :disabled="spellObject.alwaysPrepared"
      @click.left.exact.prevent.stop="togglePrepared"
    >
      <UIcon
        v-if="spellObject.prepared || spellObject.alwaysPrepared"
        name="tabler:check"
        class="h-3 w-3"
      />
    </button>

    <UFieldGroup
      size="lg"
      class="group flex min-w-0 flex-1"
    >
      <!-- Быстрое применение заклинания -->
      <UTooltip
        v-if="showCast"
        text="Применить"
      >
        <UButton
          icon="tabler:wand"
          color="primary"
          variant="soft"
          @click.left.exact.prevent.stop="emit('cast')"
        />
      </UTooltip>

      <!-- Основная часть: имя + бейджи (клик = детальник) -->
      <UButton
        color="neutral"
        variant="soft"
        class="min-w-0 flex-1 justify-start gap-2 bg-elevated/30 hover:bg-accented/40"
        draggable="true"
        @click.left.exact.prevent="emit('click')"
        @contextmenu="openContextMenu"
        @dragstart="handleDragStart($event)"
      >
        <!-- Сброс контекста группы, чтобы бейджи сохранили скругление -->
        <FieldGroupReset>
          <!-- Иконка школы (когда нет кнопки применения) -->
          <UIcon
            v-if="!showCast"
            name="tabler:wand"
            class="h-4 w-4 shrink-0 text-muted"
          />

          <!-- Название -->
          <span
            class="min-w-0 flex-1 truncate text-left text-sm font-medium text-highlighted"
          >
            {{ spellObject.name }}
          </span>

          <!-- Бейджи -->
          <UBadge
            v-if="spellObject.concentration"
            color="warning"
            variant="subtle"
            size="xs"
          >
            К
          </UBadge>

          <UBadge
            v-if="spellObject.ritual"
            color="info"
            variant="subtle"
            size="xs"
          >
            Р
          </UBadge>

          <!-- Урон -->
          <UBadge
            v-if="damageFormulaDisplay"
            color="neutral"
            variant="subtle"
            size="sm"
            class="shrink-0 font-mono"
          >
            {{ damageFormulaDisplay }}
          </UBadge>

          <!-- Заряды (current/max + способ отката) -->
          <UBadge
            v-if="usesBadge"
            :title="usesBadge.title"
            color="warning"
            variant="subtle"
            size="sm"
            class="shrink-0 font-mono"
          >
            {{ usesBadge.text }}
          </UBadge>
        </FieldGroupReset>
      </UButton>

      <!-- Кнопки редактирования (видны только в режиме редактирования) -->
      <template v-if="isEditMode">
        <UTooltip text="Редактировать">
          <UButton
            icon="tabler:edit"
            color="neutral"
            variant="soft"
            @click.left.exact.prevent.stop="emit('edit')"
          />
        </UTooltip>

        <UButton
          icon="tabler:trash"
          color="error"
          variant="soft"
          @click.left.exact.prevent.stop="emit('delete')"
        />
      </template>
    </UFieldGroup>
  </div>

  <!-- Контекстное меню -->
  <Teleport to="body">
    <div
      v-if="isMenuOpen"
      class="fixed inset-0 z-10000"
      @click.left.exact.prevent="closeMenu"
      @contextmenu.prevent="closeMenu"
    >
      <div
        class="absolute min-w-[180px] rounded-lg border border-default bg-default py-1 shadow-xl"
        :style="{ left: `${menuX}px`, top: `${menuY}px` }"
        @click.stop
      >
        <!-- Применить -->
        <button
          v-if="showCast"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleAction('cast')"
        >
          <UIcon
            name="tabler:wand"
            class="h-4 w-4 text-muted"
          />
          Применить
        </button>

        <!-- Скопировать -->
        <button
          v-if="showCopy"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleAction('copy')"
        >
          <UIcon
            name="tabler:copy"
            class="h-4 w-4 text-muted"
          />
          Скопировать
        </button>

        <!-- Редактировать -->
        <button
          v-if="showEdit"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleAction('edit')"
        >
          <UIcon
            name="tabler:edit"
            class="h-4 w-4 text-muted"
          />
          Редактировать
        </button>

        <!-- Разделитель -->
        <div
          v-if="showCopy || showEdit || showCast"
          class="mx-2 my-1 border-t border-default/50"
        />

        <!-- Поделиться в чат -->
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleAction('share')"
        >
          <UIcon
            name="tabler:message-share"
            class="h-4 w-4 text-muted"
          />
          Поделиться в чат
        </button>

        <!-- Удалить -->
        <ContextMenuDangerItem
          v-if="showDelete"
          icon="tabler:trash"
          @click="handleAction('delete')"
        >
          Удалить
        </ContextMenuDangerItem>
      </div>
    </div>
  </Teleport>
</template>
