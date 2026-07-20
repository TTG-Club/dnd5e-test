<script setup lang="ts">
  import type {
    AbilityType,
    Feature,
    SkillType,
    TypedWebSocketClient,
  } from '@vtt/shared';
  import type {
    ActiveEffect,
    BackgroundDefinition,
    GameItem,
    GrantedSpellRef,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type { EditableFeatGrants } from '../feat/featEditorTypes';
  import type { SpellOption } from '../grantedSpellsEditorTypes';

  import { generateId } from '@vtt/shared';
  import {
    ABILITY_OPTIONS,
    SKILLS_LIST,
    TOOLS_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import { loadCompendiumKind } from '@/core/compendiumDataClient';
  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { useItemsStore } from '@/stores/itemsStore';
  import {
    buildSpellLinkIndex,
    findSpellInPacks,
    linkGrantedSpellRefs,
    loadSpellPacks,
  } from '@/systems/dnd5e/composables/spellCompendium';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import {
    buildFeatData,
    createEmptyFeatGrants,
    featDataToGrants,
  } from '../feat/featEditorTypes';
  import FeatGrantsFields from '../feat/FeatGrantsFields.vue';
  import FormSection from '../FormSection.vue';
  import GrantedSpellsEditor from '../GrantedSpellsEditor.vue';
  import ActiveEffectFormModal from '../tabs/ActiveEffectFormModal.vue';
  import { slugify } from '../utils/slugify';

  const props = defineProps<{
    open: boolean;
    /** Редактируемая предыстория (GameItem мира). */
    item?: BackgroundDefinition | null;
    /** Совместимость: тот же объект под именем background. */
    background?: BackgroundDefinition | null;
    zIndex?: number;
    positionOffset?: number;
    allowMultiple?: boolean;
    modalId?: string;
    savedPosition?: unknown;
    savedSize?: unknown;
    /** WebSocket-клиент: загрузка черт и заклинаний компендиума. */
    socket?: TypedWebSocketClient | null;
  }>();

  const emit = defineEmits<{
    'close': [];
    'save': [background: GameItem];
    'bring-to-front': [];
  }>();

  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  const itemsStore = useItemsStore();
  const systemDataStore = useSystemDataStore();
  const { openModal, getNextZIndex } = useModalManager();

  const abilitiesOptions = ABILITY_OPTIONS.map((ability) => ({
    value: ability.value,
    label: ability.label,
  }));

  const skillsOptions = SKILLS_LIST.map((skill) => ({
    value: skill.key,
    label: skill.label,
  }));

  const toolsOptions = Object.entries(TOOLS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const sourceOptions = computed(() => [
    { label: 'Свой источник', value: 'local' },
    ...systemDataStore.sources.map((source) => ({
      label: `${source.name} (${source.abbreviation})`,
      value: source.key,
    })),
  ]);

  const tabItems = [
    { label: 'Основное', slot: 'basic' as const },
    { label: 'Параметры', slot: 'params' as const },
    { label: 'Снаряжение', slot: 'equipment' as const },
    { label: 'Владения', slot: 'grants' as const },
    { label: 'Заклинания', slot: 'spells' as const },
    { label: 'Эффекты', slot: 'effects' as const },
  ];

  // ── Состояние формы ──────────────────────────────────────────
  const name = ref('');
  const nameEn = ref('');
  const description = ref('');
  const sourceKey = ref('local');
  const isSRD = ref(false);

  // Канонические дары предыстории (2024).
  const selectedAbilities = ref<AbilityType[]>([]);
  const selectedSkills = ref<SkillType[]>([]);
  const selectedFixedTools = ref<string[]>([]);
  const choicesToolsCount = ref(0);
  const selectedChoicesTools = ref<string[]>([]);

  const featSelectionType = ref<'fixed' | 'choice'>('fixed');
  const selectedFeatId = ref<string>('');
  const selectedFeatChoices = ref<string[]>([]);

  const equipmentDescription = ref('');
  const equipmentGold = ref(50);

  // Расширенные «дары что угодно» (как у черты).
  const grants = ref<EditableFeatGrants>(createEmptyFeatGrants());
  const grantedSpells = ref<GrantedSpellRef[]>([]);
  const effects = ref<ActiveEffect[]>([]);

  const existingId = ref<string | null>(null);
  const existingKey = ref<string | null>(null);

  const canSave = computed(() => name.value.trim().length > 0);

  /**
   * Генерирует уникальный машинный ключ предыстории из английского (или
   * русского) названия. При совпадении с уже существующей предысторией
   * добавляет порядковый номер: `wanderer`, `wanderer-2`, `wanderer-3`…
   * Текущая редактируемая предыстория из проверки исключается.
   */
  function generateBackgroundKey(): string {
    const base = slugify(nameEn.value || name.value) || 'background';

    const taken = new Set<string>();

    for (const background of itemsStore.itemsByType('background')) {
      if (
        background.id !== existingId.value
        && typeof background.key === 'string'
        && background.key.length > 0
      ) {
        taken.add(background.key);
      }
    }

    if (!taken.has(base)) {
      return base;
    }

    let counter = 2;

    while (taken.has(`${base}-${counter}`)) {
      counter += 1;
    }

    return `${base}-${counter}`;
  }

  /** Предпросмотр машинного ключа, который получит предыстория при сохранении. */
  const keyPreview = computed(
    () => existingKey.value ?? generateBackgroundKey(),
  );

  // ── Черты компендиума (для выбора черты-происхождения) ───────
  const compendiumFeats = ref<Feature[]>([]);

  function isFeature(value: unknown): value is Feature {
    return (
      typeof value === 'object'
      && value !== null
      && 'id' in value
      && 'name' in value
      && 'description' in value
    );
  }

  /** Загружает черты компендиума (бандл + скачиваемые + модули). */
  async function loadCompendiumFeats(): Promise<void> {
    if (!props.socket) {
      return;
    }

    const entries = await loadCompendiumKind(props.socket, 'feat');

    compendiumFeats.value = entries.filter(isFeature);
  }

  /** Опции выбора черт: пользовательские из items.db + черты компендиума. */
  const featOptions = computed(() => {
    const featsMap = new Map<string, string>();

    for (const feat of itemsStore.itemsByType('feat')) {
      featsMap.set(feat.id, feat.name || feat.id);
    }

    for (const feat of compendiumFeats.value) {
      if (!featsMap.has(feat.id)) {
        featsMap.set(feat.id, feat.name || feat.id);
      }
    }

    return Array.from(featsMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Находит черту по id (сначала в items.db, затем в компендиуме). */
  function findFeat(featId: string): { name: string; nameEn?: string } | null {
    return (
      itemsStore.itemsByType('feat').find((feat) => feat.id === featId)
      ?? compendiumFeats.value.find((feat) => feat.id === featId)
      ?? null
    );
  }

  // ── Заклинания компендиума (подсказки связывания + просмотр) ─
  const availableSpells = ref<SpellOption[]>([]);

  const spellPacks = ref<
    { packId: string; packName: string; spells: Spell[] }[]
  >([]);

  async function loadAvailableSpells(): Promise<void> {
    if (!props.socket) {
      availableSpells.value = [];
      spellPacks.value = [];

      return;
    }

    const { packs, options } = await loadSpellPacks(props.socket);

    spellPacks.value = packs;
    availableSpells.value = options;
    linkGrantedSpellRefs(grantedSpells.value, buildSpellLinkIndex(options));
  }

  function openSpellDetail(spellId: string, packId?: string): void {
    const spell = findSpellInPacks(spellPacks.value, spellId, packId);

    if (spell) {
      openModal('SpellDetailModal', { spell });
    }
  }

  // ── Редактор активных эффектов ───────────────────────────────
  const isEffectModalOpen = ref(false);
  const effectModalZIndex = ref<number | undefined>(undefined);
  const editingEffect = ref<ActiveEffect | undefined>(undefined);

  function createEffect(): void {
    editingEffect.value = undefined;
    effectModalZIndex.value = getNextZIndex();
    isEffectModalOpen.value = true;
  }

  function editEffect(effect: ActiveEffect): void {
    editingEffect.value = effect;
    effectModalZIndex.value = getNextZIndex();
    isEffectModalOpen.value = true;
  }

  function deleteEffect(effectId: string): void {
    effects.value = effects.value.filter((effect) => effect.id !== effectId);
  }

  function saveEffect(effect: ActiveEffect): void {
    const index = effects.value.findIndex(
      (existing) => existing.id === effect.id,
    );

    if (index !== -1) {
      const updated = [...effects.value];

      updated[index] = effect;
      effects.value = updated;
    } else {
      effects.value = [...effects.value, effect];
    }
  }

  // ── Инициализация при открытии ───────────────────────────────
  function resetForm(): void {
    name.value = '';
    nameEn.value = '';
    description.value = '';
    sourceKey.value = 'local';
    isSRD.value = false;
    selectedAbilities.value = [];
    selectedSkills.value = [];
    selectedFixedTools.value = [];
    choicesToolsCount.value = 0;
    selectedChoicesTools.value = [];
    featSelectionType.value = 'fixed';
    selectedFeatId.value = '';
    selectedFeatChoices.value = [];
    equipmentDescription.value = '';
    equipmentGold.value = 50;
    grants.value = createEmptyFeatGrants();
    grantedSpells.value = [];
    effects.value = [];
    existingId.value = null;
    existingKey.value = null;
  }

  function hydrateFromBackground(bg: BackgroundDefinition): void {
    name.value = bg.name || '';
    nameEn.value = bg.nameEn || '';
    description.value = bg.description || '';
    sourceKey.value = bg.sourceKey ?? 'local';
    isSRD.value = bg.isSRD || false;

    selectedAbilities.value = [...(bg.abilityGrant?.abilities ?? [])];
    selectedSkills.value = [...(bg.skillGrant?.skills ?? [])];
    selectedFixedTools.value = [...(bg.toolGrant?.items ?? [])];

    if (bg.toolGrant?.choices) {
      choicesToolsCount.value = bg.toolGrant.choices.count || 0;
      selectedChoicesTools.value = [...(bg.toolGrant.choices.from ?? [])];
    }

    if (bg.featGrant?.featChoices?.length) {
      featSelectionType.value = 'choice';
      selectedFeatChoices.value = [...bg.featGrant.featChoices];
    } else {
      featSelectionType.value = 'fixed';
      selectedFeatId.value = bg.featGrant?.featId ?? '';
    }

    if (bg.equipmentOptions?.length) {
      equipmentDescription.value = bg.equipmentOptions[0]?.description ?? '';

      const goldOption = bg.equipmentOptions.find(
        (option) => typeof option.goldAlternative === 'number',
      );

      equipmentGold.value = goldOption?.goldAlternative ?? 50;
    }

    grants.value = featDataToGrants(bg.featData);

    grantedSpells.value = (bg.featData?.grantedSpells ?? []).map((spell) => ({
      name: spell.name,
      spellId: spell.spellId,
      packId: spell.packId,
    }));

    effects.value = (bg.activeEffects ?? []).map((effect) => ({ ...effect }));

    existingId.value = 'id' in bg && typeof bg.id === 'string' ? bg.id : null;
    existingKey.value = bg.key || null;
  }

  watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) {
        return;
      }

      resetForm();

      const bg = props.item ?? props.background;

      if (bg) {
        hydrateFromBackground(bg);
      }

      if (compendiumFeats.value.length === 0) {
        void loadCompendiumFeats();
      }

      void loadAvailableSpells();
    },
    { immediate: true },
  );

  /** Резолвит выбранную черту-происхождение в имя для записи. */
  function resolveFeatNames(): { featName: string; featNameEn: string } {
    const featId =
      featSelectionType.value === 'fixed'
        ? selectedFeatId.value
        : selectedFeatChoices.value[0];

    const feat = featId ? findFeat(featId) : null;

    return {
      featName: feat?.name ?? '',
      featNameEn: feat?.nameEn ?? '',
    };
  }

  function handleSave(): void {
    if (!canSave.value) {
      return;
    }

    const { featName, featNameEn } = resolveFeatNames();
    const featData = buildFeatData(grants.value, grantedSpells.value);

    const bg: GameItem = {
      id: existingId.value || `item_${generateId('bg')}`,
      key: existingKey.value ?? generateBackgroundKey(),
      type: 'background',
      name: name.value.trim(),
      nameEn: nameEn.value.trim() || undefined,
      description: description.value.trim(),
      sourceKey: sourceKey.value,
      isSRD: isSRD.value,

      quantity: 1,
      weight: 0,
      cost: '',
      rarity: 'common',
      equipped: false,
      isReadOnly: false,

      abilityGrant: {
        abilities: [...selectedAbilities.value],
      },
      skillGrant: {
        skills: [...selectedSkills.value],
      },
      toolGrant: {
        items: [...selectedFixedTools.value],
        choices:
          choicesToolsCount.value > 0
            ? {
                count: choicesToolsCount.value,
                from: [...selectedChoicesTools.value],
              }
            : undefined,
      },
      featGrant: {
        featId:
          featSelectionType.value === 'fixed'
            ? selectedFeatId.value || undefined
            : undefined,
        featChoices:
          featSelectionType.value === 'choice'
            ? [...selectedFeatChoices.value]
            : undefined,
        featName,
        featNameEn,
      },
      equipmentOptions: [
        { description: equipmentDescription.value.trim() },
        {
          description: `${equipmentGold.value} зм`,
          goldAlternative: equipmentGold.value,
        },
      ],

      activeEffects: effects.value.length > 0 ? effects.value : undefined,
      featData,
    };

    emit('save', bg);
    emit('close');
  }

  function handleOpenChange(value: boolean): void {
    if (!value) {
      emit('close');
    }
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="
      item || background ? 'Редактировать предысторию' : 'Создать предысторию'
    "
    :subtitle="nameEn || undefined"
    :initial-width="720"
    :min-width="560"
    :resizable="false"
    :z-index="zIndex"
    :saved-position="initialPosition"
    @update:open="handleOpenChange"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #body>
      <UTabs
        :items="tabItems"
        variant="pill"
        class="flex flex-col"
        :ui="{
          list: 'mb-3',
          trigger: 'flex-1 justify-center',
          content: 'overflow-y-auto max-h-[600px]',
        }"
      >
        <!-- ОСНОВНОЕ -->
        <template #basic>
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Название">
                <UInput
                  v-model="name"
                  placeholder="Послушник"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Английское название">
                <UInput
                  v-model="nameEn"
                  placeholder="Acolyte"
                  class="w-full"
                />
              </UFormField>
            </div>

            <p class="-mt-2 text-xs text-dimmed">
              Машинный ключ:
              <span class="font-mono text-muted">{{ keyPreview }}</span>
              — присваивается автоматически, при совпадении добавляется номер.
            </p>

            <UFormField label="Описание (Markdown)">
              <RichTextEditor v-model="description" />
            </UFormField>

            <FormSection
              title="Источник"
              title-color="source"
            >
              <USelect
                v-model="sourceKey"
                :items="sourceOptions"
                value-key="value"
                placeholder="Выберите источник..."
                class="w-full"
              />

              <UCheckbox
                v-model="isSRD"
                label="SRD контент"
                class="mt-2"
              />
            </FormSection>
          </div>
        </template>

        <!-- ПАРАМЕТРЫ (канонические дары 2024) -->
        <template #params>
          <div class="flex flex-col gap-4">
            <FormSection
              title="Характеристики и навыки"
              title-color="healing"
            >
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <UFormField label="Повышение характеристик (обычно 3)">
                  <USelectMenu
                    v-model="selectedAbilities"
                    :items="abilitiesOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Выберите характеристики..."
                  />
                </UFormField>

                <UFormField label="Навыки (обычно 2)">
                  <USelectMenu
                    v-model="selectedSkills"
                    :items="skillsOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    class="w-full"
                    placeholder="Выберите навыки..."
                  />
                </UFormField>
              </div>

              <p class="mt-2 text-xs text-dimmed">
                Игрок распределяет +2/+1 или +1/+1/+1 между этими тремя
                характеристиками в мастере применения.
              </p>
            </FormSection>

            <FormSection
              title="Инструменты"
              title-color="healing"
            >
              <UFormField label="Фиксированные инструменты">
                <USelectMenu
                  v-model="selectedFixedTools"
                  :items="toolsOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  class="w-full"
                  placeholder="Даются всегда..."
                />
              </UFormField>

              <div class="mt-3 flex items-start gap-3">
                <UFormField
                  label="Кол-во на выбор"
                  class="w-1/3"
                >
                  <UInputNumber
                    v-model="choicesToolsCount"
                    :min="0"
                    :max="10"
                  />
                </UFormField>

                <UFormField
                  label="Доступно для выбора"
                  class="flex-1"
                >
                  <USelectMenu
                    v-model="selectedChoicesTools"
                    :items="toolsOptions"
                    value-key="value"
                    label-key="label"
                    multiple
                    :disabled="choicesToolsCount === 0"
                    placeholder="Инструменты для выбора..."
                    class="w-full"
                  />
                </UFormField>
              </div>
            </FormSection>

            <FormSection
              title="Черта-происхождение"
              title-color="healing"
            >
              <URadioGroup
                v-model="featSelectionType"
                :items="[
                  { value: 'fixed', label: 'Фиксированная черта' },
                  { value: 'choice', label: 'Выбор из нескольких' },
                ]"
                class="mb-3"
              />

              <UFormField
                v-if="featSelectionType === 'fixed'"
                label="Черта (необязательно)"
              >
                <USelectMenu
                  v-model="selectedFeatId"
                  :items="featOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="Выберите черту..."
                  class="w-full"
                />
              </UFormField>

              <UFormField
                v-else
                label="Связка черт (для выбора)"
              >
                <USelectMenu
                  v-model="selectedFeatChoices"
                  :items="featOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="Отметьте черты для выбора..."
                  class="w-full"
                />
              </UFormField>
            </FormSection>
          </div>
        </template>

        <!-- СНАРЯЖЕНИЕ -->
        <template #equipment>
          <FormSection
            title="Стартовое снаряжение"
            title-color="healing"
          >
            <div class="flex flex-col gap-4">
              <UFormField label="Предметы снаряжения (Вариант А)">
                <UInput
                  v-model="equipmentDescription"
                  placeholder="Комплект отличной одежды, кошель..."
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Альтернативное золото (Вариант Б)">
                <UInputNumber
                  v-model="equipmentGold"
                  :min="0"
                  :max="999"
                />
              </UFormField>
            </div>
          </FormSection>
        </template>

        <!-- ВЛАДЕНИЯ (дары что угодно) -->
        <template #grants>
          <div class="flex flex-col gap-2">
            <p class="text-xs text-dimmed">
              Дополнительные владения и дары, которые предыстория выдаёт сверх
              канонических характеристик/навыков (доспехи, оружие, языки,
              защиты, тёмное зрение, предусловия). Применяются при выборе
              предыстории.
            </p>

            <FeatGrantsFields
              v-model="grants"
              hide-ability-score-increase
              hide-skill-proficiencies
            />
          </div>
        </template>

        <!-- ЗАКЛИНАНИЯ -->
        <template #spells>
          <div class="flex flex-col gap-2">
            <p class="text-xs text-dimmed">
              Заклинания, которые предыстория выдаёт автоматически (всегда
              подготовлены). Совпавшее с компендиумом выдаётся при применении.
            </p>

            <GrantedSpellsEditor
              v-model="grantedSpells"
              :available-spells="availableSpells"
              @open-spell="openSpellDetail"
            />
          </div>
        </template>

        <!-- ЭФФЕКТЫ -->
        <template #effects>
          <div class="flex flex-col gap-2">
            <p class="text-xs text-dimmed">
              Активные эффекты (бонусы к характеристикам, КД, флаги и т.п.).
              Переносятся на персонажа при применении предыстории.
            </p>

            <div
              v-if="effects.length === 0"
              class="rounded-lg border border-dashed border-default p-3 text-center text-xs text-dimmed italic"
            >
              Эффектов пока нет.
            </div>

            <div
              v-else
              class="space-y-1"
            >
              <div
                v-for="effect in effects"
                :key="effect.id"
                class="flex min-h-[44px] items-center gap-2 rounded-lg bg-elevated/50 p-2 transition-colors hover:bg-accented/50"
                :class="{ 'opacity-50 grayscale': effect.disabled }"
              >
                <UIcon
                  :name="effect.icon || 'tabler:bolt'"
                  class="size-5 shrink-0 text-gold"
                />

                <div class="min-w-0 flex-1">
                  <span class="truncate text-sm font-medium">
                    {{ effect.name }}
                  </span>

                  <div
                    v-if="effect.description"
                    class="mt-0.5 truncate text-[10px] text-dimmed"
                  >
                    {{ effect.description }}
                  </div>
                </div>

                <div class="flex shrink-0 items-center gap-1">
                  <UButton
                    icon="tabler:pencil"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click.left.exact.prevent="editEffect(effect)"
                  />

                  <UButton
                    icon="tabler:trash"
                    size="xs"
                    variant="ghost"
                    color="error"
                    @click.left.exact.prevent="deleteEffect(effect.id)"
                  />
                </div>
              </div>
            </div>

            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="tabler:plus"
              block
              class="mt-1"
              @click.left.exact.prevent="createEffect"
            >
              Добавить эффект
            </UButton>
          </div>
        </template>
      </UTabs>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <span
          v-if="!canSave"
          class="text-xs text-dimmed"
        >
          Укажите название
        </span>

        <div class="ml-auto flex gap-3">
          <UButton
            label="Отмена"
            color="neutral"
            variant="ghost"
            @click.left.exact.prevent="emit('close')"
          />

          <UButton
            :label="item || background ? 'Сохранить' : 'Создать'"
            color="primary"
            :disabled="!canSave"
            @click.left.exact.prevent="handleSave"
          />
        </div>
      </div>
    </template>
  </UDraggableModal>

  <!-- Редактор активного эффекта -->
  <ActiveEffectFormModal
    v-model:open="isEffectModalOpen"
    modal-id="background-effect-form-modal"
    :z-index="effectModalZIndex"
    :effect="editingEffect"
    hide-aura
    @save="saveEffect"
  />
</template>
