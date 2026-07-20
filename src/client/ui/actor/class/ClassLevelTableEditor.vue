<script setup lang="ts">
  import type {
    ColumnPreset,
    EditableClassFeature,
    EditableLevelRow,
    EditableTableColumn,
    EditableTableColumnChild,
  } from './classEditorTypes';

  import { generateId } from '@vtt/shared';
  import { computed, ref } from 'vue';

  import {
    buildPresetColumn,
    collectLeafColumnKeys,
    COLUMN_PRESETS,
    defaultProficiencyBonus,
    isReservedColumnKey,
    presetKeys,
  } from './classEditorTypes';

  const props = defineProps<{
    /** Особенности — для предпросмотра «что выдаётся на уровне» (только чтение). */
    features: EditableClassFeature[];
    /** Заклинатель ли класс/подкласс (показывать колонки выбора заклинаний). */
    isCaster: boolean;
  }>();

  /** Строки таблицы прогрессии (20 уровней). */
  const rows = defineModel<EditableLevelRow[]>('rows', {
    required: true,
  });

  /** Колонки таблицы прогрессии (лист/группа). */
  const columns = defineModel<EditableTableColumn[]>('columns', {
    required: true,
  });

  // ── Перетаскивание колонок (порядок задаёт порядок столбцов в таблице) ──
  /** Индекс перетаскиваемой колонки. */
  const dragIndex = ref<number | null>(null);
  /** Индекс колонки, над которой сейчас курсор перетаскивания. */
  const dragOverIndex = ref<number | null>(null);

  /** Начинает перетаскивание колонки. */
  function onColumnDragStart(index: number, event: DragEvent): void {
    dragIndex.value = index;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // Без данных Firefox не инициирует перетаскивание.
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  /** Запоминает колонку-цель под курсором. */
  function onColumnDragEnter(index: number): void {
    if (dragIndex.value !== null && dragIndex.value !== index) {
      dragOverIndex.value = index;
    }
  }

  /** Переносит перетаскиваемую колонку на позицию цели. */
  function onColumnDrop(index: number): void {
    const from = dragIndex.value;

    if (from !== null && from !== index) {
      const [moved] = columns.value.splice(from, 1);

      if (moved) {
        columns.value.splice(index, 0, moved);
      }
    }

    onColumnDragEnd();
  }

  /** Завершает перетаскивание (сброс состояния). */
  function onColumnDragEnd(): void {
    dragIndex.value = null;
    dragOverIndex.value = null;
  }

  /**
   * Плоский список листовых колонок (раскрытые группы) для ячеек таблицы.
   * Зарезервированные ключи пропускаются — для них есть встроенные колонки.
   */
  const flatLeafColumns = computed(() => {
    const cols: { key: string; label: string }[] = [];

    for (const column of columns.value) {
      if (column.children.length > 0) {
        for (const child of column.children) {
          const key = child.key.trim();

          if (key && !isReservedColumnKey(key)) {
            cols.push({ key, label: child.label || child.key });
          }
        }
      } else {
        const key = column.key.trim();

        if (key && !isReservedColumnKey(key)) {
          cols.push({ key, label: column.label || column.key });
        }
      }
    }

    return cols;
  });

  /** Ключи всех уже добавленных колонок — для дедупа пресетов. */
  const existingKeys = computed(
    () => new Set(collectLeafColumnKeys(columns.value)),
  );

  /**
   * Уже добавлен ли пресет. Для ГРУППЫ считаем добавленной, если есть хотя бы
   * один её ключ (SRD-подклассы несут усечённые группы — напр. Мистический
   * рыцарь ставит spellSlots1..4, а пресет объявляет 1..9; иначе кнопку можно
   * нажать второй раз и получить дубль). Для листа — точное наличие ключа.
   */
  function isPresetAdded(preset: ColumnPreset): boolean {
    const keys = presetKeys(preset);

    if (keys.length === 0) {
      return false;
    }

    return preset.children
      ? keys.some((key) => existingKeys.value.has(key))
      : keys.every((key) => existingKeys.value.has(key));
  }

  /** Добавляет колонку-пресет, если её ещё нет. */
  function addPreset(preset: ColumnPreset): void {
    if (isPresetAdded(preset)) {
      return;
    }

    columns.value.push(buildPresetColumn(preset));
  }

  /** Имена особенностей, выдаваемых на каждом уровне (предпросмотр). */
  const featureNamesByLevel = computed(() => {
    const map = new Map<number, string[]>();

    for (const feature of props.features) {
      if (!feature.name.trim()) {
        continue;
      }

      const level = Math.max(1, Math.round(feature.level || 1));
      const list = map.get(level) ?? [];

      list.push(feature.name.trim());
      map.set(level, list);
    }

    return map;
  });

  /** Текст предпросмотра особенностей уровня (с пометкой ASI). */
  function levelFeaturePreview(level: number, hasAsi: boolean): string {
    const names = [...(featureNamesByLevel.value.get(level) ?? [])];

    if (hasAsi) {
      names.push('Улучшение характеристик');
    }

    return names.join(', ') || '—';
  }

  /** Заполняет бонус мастерства по стандартной прогрессии для всех уровней. */
  function autofillProficiency(): void {
    for (const row of rows.value) {
      row.proficiencyBonus = defaultProficiencyBonus(row.level);
    }
  }

  /** Добавляет произвольную листовую колонку (редактируемую). */
  function addLeafColumn(): void {
    columns.value.push({
      uid: generateId('tc'),
      key: '',
      label: '',
      children: [],
      locked: false,
    });
  }

  /** Добавляет произвольную колонку-группу (редактируемую). */
  function addGroupColumn(): void {
    columns.value.push({
      uid: generateId('tc'),
      key: '',
      label: '',
      children: [{ uid: generateId('tcc'), key: '', label: '' }],
      locked: false,
    });
  }

  /** Краткое описание ключей залоченной колонки (для справки). */
  function lockedKeyHint(column: {
    key: string;
    children: { key: string }[];
  }): string {
    if (column.children.length > 0) {
      return column.children.map((child) => child.key).join(', ');
    }

    return column.key;
  }

  /** Удаляет колонку по индексу. */
  function removeColumn(index: number): void {
    columns.value.splice(index, 1);
  }

  /** Добавляет подзаголовок в группу. */
  function addChild(column: EditableTableColumn): void {
    const child: EditableTableColumnChild = {
      uid: generateId('tcc'),
      key: '',
      label: '',
    };

    column.children.push(child);
  }

  /** Удаляет подзаголовок по индексу. */
  function removeChild(column: EditableTableColumn, index: number): void {
    column.children.splice(index, 1);
  }
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Дизайнер колонок -->
    <div
      class="flex flex-col gap-2 rounded-lg border border-default bg-elevated/20 p-3"
    >
      <div class="flex items-center justify-between gap-2">
        <span
          class="text-xs font-semibold tracking-wider text-dimmed uppercase"
        >
          Динамические колонки
        </span>

        <div class="flex gap-2">
          <UButton
            icon="tabler:plus"
            label="Колонка"
            color="neutral"
            variant="soft"
            size="xs"
            @click.left.exact.prevent="addLeafColumn"
          />

          <UButton
            icon="tabler:plus"
            label="Группа"
            color="neutral"
            variant="soft"
            size="xs"
            @click.left.exact.prevent="addGroupColumn"
          />
        </div>
      </div>

      <!-- Стандартные DND-колонки: добавляются залоченными (ключ/название вшиты) -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[11px] text-dimmed">Стандартные:</span>

        <UButton
          v-for="preset in COLUMN_PRESETS"
          :key="preset.id"
          :label="preset.button"
          :icon="isPresetAdded(preset) ? 'tabler:check' : 'tabler:plus'"
          :color="isPresetAdded(preset) ? 'success' : 'primary'"
          variant="soft"
          size="xs"
          :disabled="isPresetAdded(preset)"
          @click.left.exact.prevent="addPreset(preset)"
        />
      </div>

      <div
        v-if="columns.length === 0"
        class="text-xs text-dimmed italic"
      >
        Колонок нет. «Стандартные» выше — кнопкой (ключ/название вшиты, не
        меняются); «Колонка»/«Группа» — своя уникальная с любым
        ключом/названием.
      </div>

      <div
        v-for="(column, columnIndex) in columns"
        :key="column.uid"
        class="flex items-start gap-2 rounded-md border bg-default/30 p-2 transition-colors"
        :class="[
          dragOverIndex === columnIndex
            ? 'border-primary'
            : 'border-default/60',
          dragIndex === columnIndex ? 'opacity-50' : '',
        ]"
        @dragover.prevent
        @dragenter.prevent="onColumnDragEnter(columnIndex)"
        @drop.prevent="onColumnDrop(columnIndex)"
      >
        <!-- Ручка перетаскивания: задаёт порядок колонки в таблице -->
        <button
          type="button"
          class="mt-1.5 shrink-0 cursor-grab text-dimmed transition-colors hover:text-highlighted active:cursor-grabbing"
          draggable="true"
          aria-label="Перетащите, чтобы изменить порядок колонки"
          @dragstart="onColumnDragStart(columnIndex, $event)"
          @dragend="onColumnDragEnd"
        >
          <UIcon
            name="tabler:grip-vertical"
            class="h-4 w-4"
          />
        </button>

        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <!-- Залоченная стандартная колонка: только просмотр + удаление -->
          <div
            v-if="column.locked"
            class="flex items-center gap-2"
          >
            <UIcon
              name="tabler:lock"
              class="h-4 w-4 shrink-0 text-dimmed"
            />

            <span class="truncate text-sm font-medium text-highlighted">
              {{ column.label }}
            </span>

            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
              class="shrink-0 font-mono"
            >
              {{ lockedKeyHint(column) }}
            </UBadge>

            <UButton
              icon="tabler:trash"
              color="error"
              variant="ghost"
              size="xs"
              class="ml-auto shrink-0"
              aria-label="Удалить колонку"
              @click.left.exact.prevent="removeColumn(columnIndex)"
            />
          </div>

          <!-- Произвольная колонка: редактируемая -->
          <template v-else>
            <div class="flex items-center gap-2">
              <UInput
                v-model="column.label"
                placeholder="Заголовок колонки"
                class="flex-1"
              />

              <UInput
                v-if="column.children.length === 0"
                v-model="column.key"
                placeholder="ключ (напр. sneakAttack)"
                :color="isReservedColumnKey(column.key) ? 'error' : undefined"
                class="flex-1"
              />

              <span
                v-else
                class="text-[11px] text-dimmed"
              >
                группа
              </span>

              <UButton
                icon="tabler:trash"
                color="error"
                variant="ghost"
                size="xs"
                aria-label="Удалить колонку"
                @click.left.exact.prevent="removeColumn(columnIndex)"
              />
            </div>

            <p
              v-if="
                column.children.length === 0 && isReservedColumnKey(column.key)
              "
              class="text-[11px] text-error"
            >
              Ключ «{{ column.key.trim() }}» зарезервирован встроенной колонкой
              — задайте другой (эта колонка будет проигнорирована).
            </p>

            <!-- Подзаголовки группы -->
            <div
              v-if="column.children.length > 0"
              class="flex flex-col gap-1.5 pl-3"
            >
              <div
                v-for="(child, childIndex) in column.children"
                :key="child.uid"
                class="flex items-center gap-2"
              >
                <UInput
                  v-model="child.label"
                  placeholder="Подзагол. (напр. 1)"
                  class="w-[140px]"
                />

                <UInput
                  v-model="child.key"
                  placeholder="ключ (напр. spellSlots1)"
                  :color="isReservedColumnKey(child.key) ? 'error' : undefined"
                  class="flex-1"
                />

                <UButton
                  icon="tabler:trash"
                  color="error"
                  variant="ghost"
                  size="xs"
                  aria-label="Удалить подзаголовок"
                  @click.left.exact.prevent="removeChild(column, childIndex)"
                />
              </div>

              <UButton
                icon="tabler:plus"
                label="Подзаголовок"
                color="neutral"
                variant="ghost"
                size="xs"
                class="self-start"
                @click.left.exact.prevent="addChild(column)"
              />
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Таблица 20 уровней -->
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-semibold tracking-wider text-dimmed uppercase">
        Прогрессия по уровням
      </span>

      <UButton
        icon="tabler:wand"
        label="Авто-бонус мастерства"
        color="neutral"
        variant="soft"
        size="xs"
        @click.left.exact.prevent="autofillProficiency"
      />
    </div>

    <div
      class="custom-scroll w-full overflow-x-auto rounded-lg border border-default/50"
    >
      <table class="w-full min-w-[640px] text-xs">
        <thead>
          <tr class="bg-elevated/50 text-muted">
            <th class="px-2 py-1.5 text-left">Ур.</th>

            <th class="px-2 py-1.5 text-left">Мас.</th>

            <th class="px-2 py-1.5 text-center">ASI</th>

            <th
              v-if="isCaster"
              class="px-2 py-1.5 text-center"
            >
              Заговоры+
            </th>

            <th
              v-if="isCaster"
              class="px-2 py-1.5 text-center"
            >
              Закл.+
            </th>

            <th
              v-for="col in flatLeafColumns"
              :key="col.key"
              class="px-1 py-1.5 text-center"
            >
              {{ col.label }}
            </th>

            <th class="px-2 py-1.5 text-left">Особенности</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="row in rows"
            :key="row.level"
            class="border-t border-default/30"
          >
            <td class="px-2 py-1 text-toned">{{ row.level }}</td>

            <td class="px-1 py-1">
              <UInputNumber
                v-model="row.proficiencyBonus"
                :min="0"
                :max="9"
                size="xs"
                :ui="{ base: 'w-[64px]' }"
              />
            </td>

            <td class="px-1 py-1 text-center">
              <UCheckbox v-model="row.hasAsi" />
            </td>

            <td
              v-if="isCaster"
              class="px-1 py-1"
            >
              <UInputNumber
                v-model="row.newCantrips"
                :min="0"
                :max="20"
                size="xs"
                :ui="{ base: 'w-[64px]' }"
              />
            </td>

            <td
              v-if="isCaster"
              class="px-1 py-1"
            >
              <UInputNumber
                v-model="row.newSpells"
                :min="0"
                :max="20"
                size="xs"
                :ui="{ base: 'w-[64px]' }"
              />
            </td>

            <td
              v-for="col in flatLeafColumns"
              :key="col.key"
              class="px-1 py-1"
            >
              <UInput
                v-model="row.columns[col.key]"
                size="xs"
                placeholder="—"
                :ui="{ base: 'w-[56px]' }"
              />
            </td>

            <td class="px-2 py-1 text-dimmed">
              {{ levelFeaturePreview(row.level, row.hasAsi) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-[11px] text-dimmed">
      «Особенности» уровня выводятся автоматически из уровня каждой особенности
      (вкладка «Особенности»). Пустая ячейка колонки = «—». Бонус мастерства
      можно проставить кнопкой авто-заполнения.
    </p>
  </div>
</template>
