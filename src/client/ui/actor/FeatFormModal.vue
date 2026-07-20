<script setup lang="ts">
  import type { TypedWebSocketClient } from '@vtt/shared';
  import type {
    ActiveEffect,
    GameItem,
    GrantedSpellRef,
    Spell,
  } from '@vtt/shared/system/dnd.js';

  import type { EditableFeatGrants } from './feat/featEditorTypes';
  import type { SpellOption } from './grantedSpellsEditorTypes';

  import { computed, ref, watch } from 'vue';

  import RichTextEditor from '@/shared_ui/components/RichTextEditor.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
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
  } from './feat/featEditorTypes';
  import FeatGrantsFields from './feat/FeatGrantsFields.vue';
  import FormSection from './FormSection.vue';
  import GrantedSpellsEditor from './GrantedSpellsEditor.vue';
  import ActiveEffectFormModal from './tabs/ActiveEffectFormModal.vue';

  const props = defineProps<{
    /** Открыто ли модальное окно */
    open: boolean;
    /** Скрытые пропсы от useModalManager чтобы не было ворнингов */
    allowMultiple?: boolean;
    modalId?: string;
    savedPosition?: unknown;
    savedSize?: unknown;
    /** Редактируемая черта (null = создание) */
    feat: GameItem | null;
    /** Сокет — для загрузки заклинаний компендиума (подсказки связывания). */
    socket?: TypedWebSocketClient | null;
    /** Z-index (управляется родителем для bring-to-front) */
    zIndex?: number;
    /** Смещение позиции для каскадного расположения */
    positionOffset?: number;
  }>();

  const emit = defineEmits<{
    'close': [];
    'save': [feat: GameItem];
    'bring-to-front': [];
  }>();

  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  const systemDataStore = useSystemDataStore();
  const { openModal, getNextZIndex } = useModalManager();

  const sourceOptions = computed(() => [
    { label: 'Свой источник', value: 'local' },
    ...systemDataStore.sources.map((source) => ({
      label: `${source.name} (${source.abbreviation})`,
      value: source.key,
    })),
  ]);

  const tabItems = [
    { label: 'Основное', slot: 'basic' as const },
    { label: 'Заклинания', slot: 'spells' as const },
    { label: 'Эффекты', slot: 'effects' as const },
    { label: 'Владения', slot: 'grants' as const },
  ];

  // ── Состояние формы ──────────────────────────────────────────
  const name = ref('');
  const nameEn = ref('');
  const description = ref('');
  const sourceKey = ref('local');
  const isSRD = ref(false);
  const repeatable = ref(false);
  const repeatableText = ref('');

  /** Выдаваемые заклинания (имя + опц. связь с компендиумом). */
  const grantedSpells = ref<GrantedSpellRef[]>([]);

  /** Активные эффекты черты. */
  const effects = ref<ActiveEffect[]>([]);

  /** «Дары» черты (вкладка «Владения»). */
  const grants = ref<EditableFeatGrants>(createEmptyFeatGrants());

  /** Заклинания компендиума по пакам (имя, источник, пак) — для подсказок. */
  const availableSpells = ref<SpellOption[]>([]);

  /** Полные заклинания по пакам — для просмотра по клику. */
  const spellPacks = ref<
    { packId: string; packName: string; spells: Spell[] }[]
  >([]);

  const canSave = computed(() => name.value.trim().length > 0);

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
    repeatable.value = false;
    repeatableText.value = '';
    grantedSpells.value = [];
    effects.value = [];
    grants.value = createEmptyFeatGrants();
  }

  function hydrateFromFeat(feat: GameItem): void {
    name.value = feat.name || '';
    nameEn.value = feat.nameEn || '';
    description.value = feat.description || '';
    sourceKey.value = feat.sourceKey || 'local';
    isSRD.value = feat.isSRD || false;
    repeatable.value = feat.repeatable || false;
    repeatableText.value = feat.repeatableText || '';

    grantedSpells.value = (feat.featData?.grantedSpells ?? []).map((spell) => ({
      name: spell.name,
      spellId: spell.spellId,
      packId: spell.packId,
    }));

    effects.value = (feat.activeEffects ?? []).map((effect) => ({
      ...effect,
    }));

    grants.value = featDataToGrants(feat.featData);
  }

  /**
   * Загружает заклинания компендиума ПО ПАКАМ — для подсказок связывания,
   * выбора пака и просмотра. Без сокета — пусто (имена вводить всё равно можно).
   */
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

  /**
   * Открывает детальный просмотр заклинания. Предпочитает указанный пак, иначе
   * берёт первый пак, где это заклинание есть.
   *
   * @param spellId - id заклинания компендиума
   * @param packId - предпочтённый пак (опционально)
   */
  function openSpellDetail(spellId: string, packId?: string): void {
    const spell = findSpellInPacks(spellPacks.value, spellId, packId);

    if (spell) {
      openModal('SpellDetailModal', { spell });
    }
  }

  watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) {
        return;
      }

      resetForm();

      if (props.feat) {
        hydrateFromFeat(props.feat);
      }

      void loadAvailableSpells();
    },
    { immediate: true },
  );

  /** Сохраняет форму. */
  function handleSave(): void {
    if (!canSave.value) {
      return;
    }

    const featData = buildFeatData(grants.value, grantedSpells.value);

    const item: GameItem = {
      id: props.feat?.id || '',
      type: 'feat',
      name: name.value.trim(),
      nameEn: nameEn.value.trim() || undefined,
      description: description.value.trim(),
      sourceKey: sourceKey.value,
      isSRD: isSRD.value,
      repeatable: repeatable.value,
      repeatableText: repeatableText.value.trim() || undefined,
      quantity: 1,
      weight: 0,
      cost: '',
      rarity: 'common',
      equipped: false,
      isReadOnly: false,
      image: props.feat?.image,
      activeEffects: effects.value.length > 0 ? effects.value : undefined,
      featData,
    };

    emit('save', item);
    emit('close');
  }

  /**
   * Обрабатывает закрытие окна (крестик/клик мимо) — эмитит `close` (без
   * авто-сохранения: при много-вкладочном редактировании это рискованно).
   *
   * @param value - новое состояние открытости окна
   */
  function handleOpenChange(value: boolean): void {
    if (!value) {
      emit('close');
    }
  }
</script>

<template>
  <UDraggableModal
    :open="open"
    :title="feat ? 'Редактировать черту' : 'Создать черту'"
    :subtitle="nameEn || undefined"
    :initial-width="640"
    :min-width="520"
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
                  placeholder="Магический посвящённый"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Английское название">
                <UInput
                  v-model="nameEn"
                  placeholder="Magic Initiate"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField label="Описание">
              <RichTextEditor
                v-model="description"
                placeholder="Выберите класс..."
              />
            </UFormField>

            <FormSection>
              <UCheckbox
                v-model="repeatable"
                label="Повторяемая черта"
              />

              <UFormField
                v-if="repeatable"
                label="Условия повторного выбора"
                class="mt-2"
              >
                <UTextarea
                  v-model="repeatableText"
                  :rows="2"
                  autoresize
                  class="w-full"
                  placeholder="Напр. «нельзя выбрать одну характеристику дважды»"
                />
              </UFormField>
            </FormSection>

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

        <!-- ЗАКЛИНАНИЯ -->
        <template #spells>
          <div class="flex flex-col gap-2">
            <p class="text-xs text-dimmed">
              Заклинания, которые черта выдаёт автоматически (всегда
              подготовлены). Совпавшее с компендиумом выдаётся при применении
              черты к персонажу.
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
              Активные эффекты (бонусы к характеристикам, КД, флаги преимущества
              и т.п.). Переносятся на персонажа при применении черты.
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

        <!-- ВЛАДЕНИЯ -->
        <template #grants>
          <FeatGrantsFields v-model="grants" />
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
            :label="feat ? 'Сохранить' : 'Создать'"
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
    modal-id="feat-effect-form-modal"
    :z-index="effectModalZIndex"
    :effect="editingEffect"
    hide-aura
    @save="saveEffect"
  />
</template>
