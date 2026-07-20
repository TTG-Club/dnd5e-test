<script setup lang="ts">
  import type {
    ClassDefinition,
    ClassFeature,
    ClassLevelEntry,
  } from '@vtt/shared/system/dnd.js';

  import { computed, nextTick, ref } from 'vue';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useSourceLabels } from '@/systems/dnd5e/composables/useSourceLabel';

  import {
    ABILITY_LABELS,
    ARMOR_PROF_SHORT_LABELS,
    CASTER_TYPE_LABELS,
    SKILL_LABELS,
    TOOL_PROF_LABELS,
    WEAPON_PROF_SHORT_LABELS,
  } from '../constants';

  /** Проверяет, является ли особенность генеричной заглушкой подкласса («Умение подкласса», «Подкласс воина») */
  function isSubclassPlaceholder(feature: ClassFeature): boolean {
    return (
      feature.name === 'Умение подкласса'
      || feature.name.startsWith('Подкласс ')
    );
  }

  /** Извлекает значение динамической колонки из строки таблицы уровней */
  function getCellValue(row: ClassLevelEntry, key: string): string | number {
    const value = row[key];

    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }

    return '—';
  }

  const props = defineProps<{
    /** Открыто ли модальное окно */
    open: boolean;
    /** Определение класса для отображения */
    classDefinition: ClassDefinition | null;
    /** Z-index модалки */
    zIndex?: number;
    /** Смещение позиции для каскадного расположения */
    positionOffset?: number;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'bring-to-front': [];
  }>();

  const { getSourceLabel } = useSourceLabels();

  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  /** Выбранный подкласс для просмотра в таблице (строка) */
  const selectedSubclassName = ref<string | null>(null);

  /** Все особенности базового класса сгруппированные по уровню */
  const featuresByLevel = computed(() => {
    const classDef = props.classDefinition;

    if (!classDef) {
      return new Map<number, ClassFeature[]>();
    }

    const map = new Map<number, ClassFeature[]>();

    // Особенности ТОЛЬКО базового класса
    for (const feature of classDef.features) {
      if (selectedSubclassName.value && isSubclassPlaceholder(feature)) {
        continue;
      }

      const level = feature.level;
      const existing = map.get(level) ?? [];

      existing.push(feature);
      map.set(level, existing);
    }

    // Особенности выбранного подкласса
    if (selectedSubclassName.value) {
      const subclass = classDef.subclasses.find(
        (subclass) => subclass.name === selectedSubclassName.value,
      );

      if (subclass && subclass.features) {
        for (const feature of subclass.features) {
          const level = feature.level;
          const existing = map.get(level) ?? [];

          existing.push(feature);
          map.set(level, existing);
        }
      }
    }

    // Сортируем фичи внутри одного уровня (сначала базовые, потом подкласса)
    for (const [level, features] of map.entries()) {
      features.sort((a, b) => {
        if (a.subclassKey && !b.subclassKey) {
          return 1;
        }

        if (!a.subclassKey && b.subclassKey) {
          return -1;
        }

        return 0;
      });

      map.set(level, features);
    }

    return map;
  });

  /** Активная таблица уровней — базовые данные, дополненные колонками подкласса */
  const activeLevelTable = computed(() => {
    const baseTable = props.classDefinition?.levelTable ?? [];

    if (selectedSubclassName.value) {
      const subclass = props.classDefinition?.subclasses.find(
        (sc) => sc.name === selectedSubclassName.value,
      );

      if (subclass?.levelTable) {
        // Мержим строки: базовые данные + данные подкласса для каждого уровня
        return baseTable.map((baseRow) => {
          const subclassRow = subclass.levelTable!.find(
            (subRow) => subRow.level === baseRow.level,
          );

          return subclassRow ? { ...baseRow, ...subclassRow } : baseRow;
        });
      }
    }

    return baseTable;
  });

  /** Активные колонки таблицы — базовые + колонки подкласса (если есть) */
  const activeTableColumns = computed(() => {
    const baseColumns = props.classDefinition?.tableColumns ?? [];

    if (selectedSubclassName.value) {
      const subclass = props.classDefinition?.subclasses.find(
        (sc) => sc.name === selectedSubclassName.value,
      );

      if (subclass?.tableColumns) {
        return [...baseColumns, ...subclass.tableColumns];
      }
    }

    return baseColumns;
  });

  /** Активная заклинательная конфигурация — подкласса (если выбран и имеет свою) или базового класса */
  const activeSpellcasting = computed(() => {
    if (selectedSubclassName.value) {
      const subclass = props.classDefinition?.subclasses.find(
        (sc) => sc.name === selectedSubclassName.value,
      );

      if (subclass?.spellcasting) {
        return subclass.spellcasting;
      }
    }

    return props.classDefinition?.spellcasting ?? null;
  });

  /** Есть ли у таблицы колонки с группировкой (двухуровневая шапка) */
  const hasGroupedColumns = computed(() => {
    return activeTableColumns.value.some((column) => !!column.children?.length);
  });

  /** Плоский список всех колонок (раскрытые группы) для рендера ячеек */
  const flatColumns = computed(() => {
    const cols: Array<{ key: string; widthClass: string }> = [];

    for (const column of activeTableColumns.value) {
      if (column.children?.length) {
        for (const child of column.children) {
          cols.push({ key: child.key, widthClass: 'w-[26px]' });
        }
      } else if (column.key) {
        cols.push({ key: column.key, widthClass: 'w-16' });
      }
    }

    return cols;
  });

  /** Строка владений доспехами */
  const armorProfLabel = computed(() => {
    const classDef = props.classDefinition;

    if (!classDef || classDef.armorProficiencies.length === 0) {
      return 'Нет';
    }

    return classDef.armorProficiencies
      .map((armor) => ARMOR_PROF_SHORT_LABELS[armor] ?? armor)
      .join(', ');
  });

  /** Строка владений оружием */
  const weaponProfLabel = computed(() => {
    const classDef = props.classDefinition;

    if (!classDef || classDef.weaponProficiencies.length === 0) {
      return 'Нет';
    }

    return classDef.weaponProficiencies
      .map((weapon) => WEAPON_PROF_SHORT_LABELS[weapon] ?? weapon)
      .join(', ');
  });

  /** Отсортированные особенности класса по уровню */
  const sortedFeatures = computed(() => {
    if (!props.classDefinition) {
      return [];
    }

    return [...props.classDefinition.features].sort(
      (a, b) => a.level - b.level,
    );
  });

  /** Хранит ID развернутых подклассов */
  const expandedSubclasses = ref<Set<string>>(new Set());

  /** Опции для выбора подкласса (простые строки) */
  const subclassOptions = computed(() => {
    const classDef = props.classDefinition;

    if (!classDef || !classDef.subclasses) {
      return [];
    }

    return classDef.subclasses.map((subclass) => subclass.name);
  });

  function toggleSubclass(key: string) {
    if (expandedSubclasses.value.has(key)) {
      expandedSubclasses.value.delete(key);
    } else {
      expandedSubclasses.value.add(key);
    }
  }

  /** Прокрутка до конкретной способности */
  function scrollToFeature(feature: ClassFeature) {
    if (
      feature.subclassKey
      && !expandedSubclasses.value.has(feature.subclassKey)
    ) {
      expandedSubclasses.value.add(feature.subclassKey);

      nextTick(() => {
        document
          .getElementById(`feature-${feature.key}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      return;
    }

    document
      .getElementById(`feature-${feature.key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="classDefinition?.name ?? 'Класс'"
    :subtitle="classDefinition?.nameEn || undefined"
    :initial-width="1000"
    :initial-height="700"
    :min-width="600"
    :min-height="400"
    :resizable="true"
    :z-index="zIndex"
    :saved-position="initialPosition"
    @update:open="emit('update:open', $event)"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #header-actions>
      <UBadge
        v-if="getSourceLabel(classDefinition?.sourceKey)"
        :label="getSourceLabel(classDefinition?.sourceKey)"
        color="neutral"
        variant="subtle"
        size="sm"
      />

      <UBadge
        v-if="classDefinition?.isSRD !== false"
        label="SRD"
        color="primary"
        variant="subtle"
        size="sm"
      />
    </template>

    <template #body>
      <div
        v-if="classDefinition"
        class="flex flex-col gap-4"
      >
        <!-- Описание -->
        <ItemDescriptionRenderer :content="classDefinition.description ?? ''" />

        <!-- Базовая механика -->
        <div class="flex flex-wrap gap-2">
          <!-- Кость хитов -->
          <div
            class="min-w-20 flex-1 rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Кость хитов</span
            >

            <p class="mt-0.5 font-mono text-base font-bold text-warning">
              к{{ classDefinition.hitDie }}
            </p>
          </div>

          <!-- Спасброски -->
          <div
            class="min-w-28 flex-1 rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Спасброски</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{
                classDefinition.savingThrowProficiencies
                  .map((ability) => ABILITY_LABELS[ability] ?? ability)
                  .join(', ')
              }}
            </p>
          </div>

          <!-- Заклинательная характеристика (для заклинателей и подклассов с магией) -->
          <div
            v-if="activeSpellcasting"
            class="min-w-28 flex-1 rounded-lg border border-magic-border/40 bg-magic-subtle/10 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-magic/80 uppercase"
              >Магия ·
              {{
                CASTER_TYPE_LABELS[activeSpellcasting.type]
                ?? activeSpellcasting.type
              }}</span
            >

            <p class="mt-0.5 text-sm font-semibold text-magic-muted">
              {{
                ABILITY_LABELS[activeSpellcasting.ability]
                ?? activeSpellcasting.ability
              }}
            </p>
          </div>

          <!-- Доспехи -->
          <div
            class="min-w-20 flex-1 rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Владение снаряжением</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{ armorProfLabel }}
            </p>
          </div>

          <!-- Оружие -->
          <div
            class="min-w-20 flex-1 rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Владение оружием</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{ weaponProfLabel }}
            </p>
          </div>

          <!-- Инструменты (если есть) -->
          <div
            v-if="classDefinition.toolProficiencies?.length"
            class="min-w-24 flex-1 rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Инструменты</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{
                classDefinition.toolProficiencies
                  ?.map((tool) => TOOL_PROF_LABELS[tool] ?? tool)
                  .join(', ')
              }}
            </p>
          </div>
        </div>

        <!-- Навыки -->
        <div>
          <span
            class="mb-1.5 block text-xs font-semibold tracking-wider text-dimmed uppercase"
          >
            Можно выбрать {{ classDefinition.skillChoices.count }} навыка
          </span>

          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="skill in classDefinition.skillChoices.from"
              :key="skill"
              :label="SKILL_LABELS[skill] ?? skill"
              color="neutral"
              variant="soft"
              size="md"
            />
          </div>
        </div>

        <!-- Снаряжение -->
        <div
          v-if="classDefinition.startingEquipment?.length"
          class="mt-4"
        >
          <span
            class="mb-1.5 block text-xs font-semibold tracking-wider text-dimmed uppercase"
          >
            Начальное снаряжение (на 1-ом уровне)
          </span>

          <div class="flex flex-col gap-2">
            <div
              v-for="eq in classDefinition.startingEquipment"
              :key="eq.key"
              class="rounded-md border border-default/50 bg-elevated/30 p-2 text-sm text-toned"
            >
              <span class="mr-1.5 font-bold text-muted">{{ eq.key }})</span>

              <span>{{ eq.description }}</span>
            </div>
          </div>
        </div>

        <!-- Выбор подкласса для таблицы -->
        <div
          v-if="classDefinition.subclasses?.length > 0"
          class="mt-4 flex w-64 items-center rounded-lg border border-default/50 bg-elevated/30 p-1"
        >
          <span class="pl-2 text-xs font-medium text-muted">Подкласс:</span>

          <USelectMenu
            v-model="selectedSubclassName"
            :items="subclassOptions"
            placeholder="Выбрать..."
            variant="none"
            class="min-w-0 flex-1"
            :searchable="false"
          >
            <template #label>
              <span class="truncate">
                {{ selectedSubclassName || 'Выбрать...' }}
              </span>
            </template>
          </USelectMenu>

          <UButton
            v-if="selectedSubclassName"
            icon="tabler:x"
            color="gray"
            variant="ghost"
            size="2xs"
            class="mr-1"
            :padded="false"
            @click.left.exact.prevent="selectedSubclassName = null"
          />
        </div>

        <!-- Таблица уровней (компактная) -->
        <div>
          <div
            class="custom-scroll w-full overflow-hidden overflow-x-auto rounded-lg border border-default/50"
          >
            <table class="w-full min-w-[700px] table-fixed text-xs">
              <colgroup>
                <col class="w-10" />

                <col class="w-12" />

                <col />

                <col
                  v-for="col in flatColumns"
                  :key="'colgroup_' + col.key"
                  :class="col.widthClass"
                />
              </colgroup>

              <thead>
                <tr class="bg-elevated/50">
                  <th
                    class="w-10 px-2 py-1.5 text-left align-middle text-muted"
                    :rowspan="hasGroupedColumns ? 2 : 1"
                  >
                    Ур.
                  </th>

                  <th
                    class="w-12 px-2 py-1.5 text-left align-middle text-muted"
                    :rowspan="hasGroupedColumns ? 2 : 1"
                  >
                    Мас.
                  </th>

                  <th
                    class="px-2 py-1.5 text-left align-middle text-muted"
                    :rowspan="hasGroupedColumns ? 2 : 1"
                  >
                    Особенности
                  </th>

                  <!-- Динамические колонки (Верхний уровень) -->
                  <th
                    v-for="col in activeTableColumns"
                    :key="col.key || col.label"
                    class="px-1 py-1.5 text-center align-middle text-muted"
                    :class="col.children ? 'border-b border-default/50' : ''"
                    :colspan="col.children ? col.children.length : 1"
                    :rowspan="col.children ? 1 : hasGroupedColumns ? 2 : 1"
                  >
                    {{ col.label }}
                  </th>
                </tr>

                <tr
                  v-if="hasGroupedColumns"
                  class="bg-elevated/50"
                >
                  <template
                    v-for="col in activeTableColumns"
                    :key="col.label + '_group'"
                  >
                    <th
                      v-for="child in col.children || []"
                      :key="child.key"
                      class="px-0 py-1.5 text-center text-[11px] font-medium text-muted"
                    >
                      {{ child.label }}
                    </th>
                  </template>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="row in activeLevelTable"
                  :key="row.level"
                  class="border-t border-default/30"
                >
                  <td class="px-2 py-1 align-top text-toned">
                    {{ row.level }}
                  </td>

                  <td class="px-2 py-1 align-top text-muted">
                    +{{ row.proficiencyBonus }}
                  </td>

                  <td
                    class="px-2 py-1 align-top wrap-break-word whitespace-normal text-toned"
                  >
                    <template v-if="featuresByLevel.get(row.level)?.length">
                      <span
                        v-for="(feature, index) in featuresByLevel.get(
                          row.level,
                        )!"
                        :key="feature.key"
                      >
                        <button
                          class="transition-colors hover:underline focus:outline-none"
                          :class="
                            feature.subclassKey
                              ? 'text-primary-400 hover:text-primary-300'
                              : 'text-toned hover:text-primary-400'
                          "
                          @click.left.exact.prevent="scrollToFeature(feature)"
                        >
                          {{ feature.name }}
                        </button>

                        <span
                          v-if="
                            index < featuresByLevel.get(row.level)!.length - 1
                          "
                          >,
                        </span>
                      </span>
                    </template>

                    <span
                      v-else
                      class="text-dimmed"
                      >—</span
                    >
                  </td>

                  <td
                    v-for="col in flatColumns"
                    :key="col.key"
                    class="px-0 py-1 text-center align-top font-mono text-[11px] text-muted"
                  >
                    {{ getCellValue(row, col.key) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Особенности класса -->
        <div
          v-if="classDefinition.features.length > 0"
          class="pt-2"
        >
          <span
            class="mb-1.5 block text-xs font-semibold tracking-wider text-dimmed uppercase"
          >
            Особенности класса
          </span>

          <div class="flex flex-col gap-2">
            <div
              v-for="feature in sortedFeatures"
              :id="`feature-${feature.key}`"
              :key="feature.key"
              class="rounded-lg border border-default/50 bg-elevated/30 p-3"
            >
              <div class="mb-1.5 flex items-center gap-2">
                <span class="text-sm font-medium text-healing">{{
                  feature.name
                }}</span>

                <UBadge
                  size="sm"
                  color="gray"
                  variant="subtle"
                  >{{ feature.level }} ур.</UBadge
                >
              </div>

              <ItemDescriptionRenderer :content="feature.description" />
            </div>
          </div>
        </div>

        <!-- Подклассы -->
        <div
          v-if="classDefinition.subclasses.length > 0"
          class="pt-2"
        >
          <span
            class="mb-1.5 block text-xs font-semibold tracking-wider text-dimmed uppercase"
          >
            {{ classDefinition.subclassLabel }} ({{
              classDefinition.subclassLevel
            }}
            ур.)
          </span>

          <div class="flex flex-col gap-2">
            <div
              v-for="subclass in classDefinition.subclasses"
              :key="subclass.key"
              class="flex flex-col overflow-hidden rounded-lg border border-default/50 bg-elevated/30 transition-colors"
            >
              <button
                class="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-accented/30"
                @click.left.exact.prevent="toggleSubclass(subclass.key)"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-highlighted">{{
                    subclass.name
                  }}</span>

                  <span class="text-xs text-dimmed">{{ subclass.nameEn }}</span>

                  <UBadge
                    v-if="getSourceLabel(subclass.sourceKey)"
                    size="sm"
                    color="primary"
                    variant="subtle"
                    class="ml-2"
                  >
                    {{ getSourceLabel(subclass.sourceKey) }}
                  </UBadge>
                </div>

                <UIcon
                  :name="
                    expandedSubclasses.has(subclass.key)
                      ? 'tabler:chevron-down'
                      : 'tabler:chevron-right'
                  "
                  class="h-5 w-5 text-dimmed"
                />
              </button>

              <div
                v-if="expandedSubclasses.has(subclass.key)"
                class="border-t border-default/50 p-3"
              >
                <ItemDescriptionRenderer
                  :content="subclass.description"
                  class="text-muted"
                />

                <!-- Особенности подкласса -->
                <div
                  v-if="subclass.features?.length"
                  class="mt-3 grid grid-cols-2 gap-2 border-t border-default/50 pt-3"
                >
                  <div
                    v-for="feature in subclass.features"
                    :id="`feature-${feature.key}`"
                    :key="feature.key"
                    class="flex flex-col rounded-md bg-default/50 p-2"
                  >
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-healing">{{
                        feature.name
                      }}</span>

                      <UBadge
                        size="sm"
                        color="gray"
                        variant="subtle"
                        >{{ feature.level }} ур.</UBadge
                      >
                    </div>

                    <ItemDescriptionRenderer
                      :content="feature.description"
                      class="mt-1 line-clamp-3 text-sm text-muted"
                      :title="feature.description"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
