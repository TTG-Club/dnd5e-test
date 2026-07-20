<script setup lang="ts">
  import type { Feature } from '@vtt/shared';
  import type { Actor, GameItem } from '@vtt/shared/system/dnd.js';

  import type { AppliedFeatFeature } from '../feat/featApply';

  import { getTotalLevel } from '@vtt/shared/system/dnd.js';
  import { computed, ref } from 'vue';

  import { generateEntityId } from '@/core/entityUtils';
  import { ContextMenuDangerItem } from '@/shared_ui/components';
  import { useModalManager } from '@/shared_ui/composables/useModalManager';
  import { useChatStore } from '@/stores/chatStore';
  import { useSystemDataStore } from '@/systems/dnd5e/stores/systemDataStore';

  import { useFeatModal } from '../../../composables/useFeatModal';
  import { reapplyFeatToActor, removeFeatFromActor } from '../feat/featApply';
  import FeatListItem from '../FeatListItem.vue';

  interface Props {
    actor: Actor;
    isEditMode: boolean;
    isDragOver?: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
    'immediate-save': [];
  }>();

  /**
   * Запрашивает у хозяина вкладки немедленное сохранение актёра — только вне
   * режима редактирования. В режиме редактирования изменения копятся в
   * локальной копии до «Сохранить»: немедленный push рассинхронизировал бы
   * снапшот отката (последующая «Отмена» затирала бы уже сохранённое).
   */
  function triggerSaveIfNotEdit(): void {
    if (!props.isEditMode) {
      emit('immediate-save');
    }
  }

  const { openModal } = useModalManager();
  const { openFeatDescription } = useFeatModal();
  const systemDataStore = useSystemDataStore();
  const chatStore = useChatStore();

  // --- Контекстное меню ---
  const isContextMenuOpen = ref(false);
  const contextMenuX = ref(0);
  const contextMenuY = ref(0);
  const contextMenuFeature = ref<Feature | null>(null);

  /**
   * Открывает контекстное меню для особенности
   * @param event - событие мыши
   * @param feature - особенность
   */
  function openContextMenu(event: MouseEvent, feature: Feature): void {
    event.preventDefault();
    event.stopPropagation();

    contextMenuX.value = event.clientX;
    contextMenuY.value = event.clientY;
    contextMenuFeature.value = feature;
    isContextMenuOpen.value = true;
  }

  /** Закрывает контекстное меню */
  function closeContextMenu(): void {
    isContextMenuOpen.value = false;
    contextMenuFeature.value = null;
  }

  /** Обрабатывает выбор пункта контекстного меню */
  function handleContextMenuAction(action: 'edit' | 'delete' | 'share'): void {
    if (!contextMenuFeature.value) {
      return;
    }

    if (action === 'edit') {
      editFeature(contextMenuFeature.value);
    } else if (action === 'delete') {
      removeFeature(contextMenuFeature.value);
    } else if (action === 'share') {
      shareFeatureToChat(contextMenuFeature.value);
    }

    closeContextMenu();
  }

  /**
   * Отправляет карточку особенности в чат
   * @param feature - особенность для публикации
   */
  function shareFeatureToChat(feature: Feature): void {
    chatStore.sendItemCard({
      cardType: 'feature',
      title: feature.name,
      payload: JSON.stringify(feature),
    });
  }

  /** Суммарный уровень персонажа (для показа видовых особенностей по уровню) */
  const totalLevel = computed(() => getTotalLevel(props.actor.system.classes));

  /** Особенности (от класса, вида, подкласса, кастомные) */
  const regularFeatures = computed(() =>
    props.actor.features.filter((feature) => {
      if (feature.featureType === 'feat') {
        return false;
      }

      // Видовые особенности появляются по достижении своего уровня.
      if (
        feature.featureType === 'species'
        && (feature.level ?? 1) > totalLevel.value
      ) {
        return false;
      }

      return true;
    }),
  );

  /** Черты (feats) */
  const featsList = computed(() =>
    props.actor.features.filter((feature) => feature.featureType === 'feat'),
  );

  /**
   * Ищет определение особенности вида из SRD по имени и источнику.
   * Возвращает объект с choices, если они есть.
   * @param feature - особенность актора
   */
  function findSpeciesFeatureChoices(feature: Feature) {
    if (feature.featureType !== 'species') {
      return undefined;
    }

    // Определяем ключ вида из актора
    const speciesKey = props.actor.system?.species?.speciesKey;

    if (!speciesKey) {
      return undefined;
    }

    const speciesDef = systemDataStore.speciesDefinitions.find(
      (species) => species.key === speciesKey,
    );

    if (!speciesDef) {
      return undefined;
    }

    // Ищем фичу вида по имени (убираем суффикс с выбором из названия)
    const baseName = feature.name.replace(/\s*\(.*\)\s*$/, '').trim();

    const speciesFeature = speciesDef.features.find(
      (srdFeature) => srdFeature.name === baseName,
    );

    if (!speciesFeature?.choices || speciesFeature.choices.length === 0) {
      return undefined;
    }

    // Определяем текущий выбор из featureChoices актора
    const currentChoiceKey =
      props.actor.system?.species?.featureChoices?.[speciesFeature.key];

    return {
      choices: speciesFeature.choices,
      currentChoiceKey,
      speciesFeatureKey: speciesFeature.key,
    };
  }

  /**
   * Получает актуальное SRD-описание для видовой особенности.
   * Если актор был создан до обновления SRD-данных, его описание может быть устаревшим.
   * @param feature - особенность актора
   */
  function getEnrichedDescription(feature: Feature): string {
    if (feature.featureType !== 'species') {
      return feature.description || '';
    }

    const speciesKey = props.actor.system?.species?.speciesKey;

    if (!speciesKey) {
      return feature.description || '';
    }

    const speciesDef = systemDataStore.speciesDefinitions.find(
      (species) => species.key === speciesKey,
    );

    if (!speciesDef) {
      return feature.description || '';
    }

    const baseName = feature.name.replace(/(?:\s*\(.*\)|\s*:.*)$/, '').trim();

    const srdFeature = speciesDef.features.find(
      (srdFeat) => srdFeat.name === baseName,
    );

    if (!srdFeature) {
      return feature.description || '';
    }

    // Берём актуальное SRD-описание и добавляем выбранный вариант, если есть
    let description = srdFeature.description;

    const choiceKey =
      props.actor.system?.species?.featureChoices?.[srdFeature.key];

    if (choiceKey && srdFeature.choices) {
      const selectedChoice = srdFeature.choices.find(
        (choice) => choice.key === choiceKey,
      );

      if (selectedChoice) {
        description += `\n\n**Выбранный вариант:** ${selectedChoice.name}\n${selectedChoice.description}`;
      }
    }

    return description;
  }

  /**
   * Открывает модалку с описанием особенности.
   * @param feature - особенность для отображения
   */
  function showDescription(feature: Feature): void {
    if (feature.featureType === 'feat') {
      openFeatDescription(feature);

      return;
    }

    const badges = [];

    if (feature.featureType === 'species') {
      badges.push({
        text: 'Вид',
        color: 'primary',
      });
    } else if (feature.level) {
      badges.push({
        text: `${feature.level} ур.`,
        color: 'primary',
      });
    }

    const description = getEnrichedDescription(feature);

    openModal('ActorDescriptionModal', {
      _modalKey: feature.id,
      title: feature.nameEn
        ? `${feature.name} (${feature.nameEn})`
        : feature.name,
      description,
      sourceLabel: undefined,
      isSRD: false,
      fields: badges.length > 0 ? [{ badges }] : [],
      shareCard: {
        cardType: 'feature',
        title: feature.name,
        payload: JSON.stringify(feature),
      },
    });
  }

  // --- CRUD особенностей ---
  function addFeature() {
    openModal('EntityEditModal', {
      title: 'Добавить особенность',
      showLevel: true,
      onSave: (data: { name: string; description: string; level?: number }) => {
        const newFeature: Feature = {
          id: generateEntityId('feature'),
          name: data.name,
          description: data.description,
          level: data.level,
        };

        emit('update:actor', {
          features: [...props.actor.features, newFeature],
        });

        triggerSaveIfNotEdit();
      },
    });
  }

  /**
   * Редактирует особенность по объекту (находит индекс по id).
   * @param feature - редактируемая особенность
   */
  function createFeatGameItem(feature: AppliedFeatFeature): GameItem {
    return {
      id: feature.id,
      type: 'feat',
      name: feature.name,
      nameEn: feature.nameEn,
      description: feature.description,
      quantity: 1,
      weight: 0,
      cost: '',
      rarity: 'common',
      equipped: false,
      isReadOnly: false,
      sourceKey: feature.sourceKey,
      isSRD: feature.isSRD,
      repeatable: feature.repeatable,
      repeatableText: feature.repeatableText,
      activeEffects: feature.activeEffects,
      featData: feature.featData,
    };
  }

  function editFeature(feature: Feature) {
    const index = props.actor.features.findIndex(
      (feat) => feat.id === feature.id,
    );

    if (index === -1) {
      return;
    }

    // Пытаемся подтянуть choices из SRD для видовых особенностей
    const choicesData = findSpeciesFeatureChoices(feature);

    if (feature.featureType === 'feat') {
      const oldFeature = props.actor.features[index];

      openModal('FeatFormModal', {
        feat: createFeatGameItem(oldFeature),
        onSave: (data: GameItem) => {
          const updatedFeat: AppliedFeatFeature = {
            ...oldFeature,
            name: data.name,
            nameEn: data.nameEn,
            description: data.description,
            sourceKey: data.sourceKey,
            isSRD: data.isSRD,
            repeatable: data.repeatable,
            repeatableText: data.repeatableText,
            featureType: 'feat',
            activeEffects: data.activeEffects,
            featData: data.featData,
          };

          // Пере-применяем дары к актору (владения/эффекты/защиты/тёмное зрение
          // пересобираются из новой версии). Уже выданные заклинания черты
          // переносим без компендиума, чтобы не потерять их на правке.
          const carriedSpells = (props.actor.spells ?? [])
            .filter((spell) => spell.grantedByFeature === oldFeature.name)
            .map((spell) => ({ spell, featureName: updatedFeat.name }));

          const result = reapplyFeatToActor(
            props.actor,
            oldFeature,
            updatedFeat,
            carriedSpells,
          );

          emit('update:actor', {
            features: result.features,
            spells: result.spells,
            activeEffects: result.activeEffects,
            system: {
              ...props.actor.system,
              proficiencies: result.proficiencies,
            },
            ...(result.token ? { token: result.token } : {}),
          });

          triggerSaveIfNotEdit();
        },
      });

      return;
    }

    const isSrdFeature =
      feature.featureType === 'species' || feature.featureType === 'class';

    openModal('EntityEditModal', {
      title: 'Редактировать особенность',
      initialName: feature.name,
      initialDescription: isSrdFeature
        ? getEnrichedDescription(feature)
        : feature.description,
      initialLevel: feature.level,
      showLevel: true,
      // Если есть choices — передаём их
      choices: choicesData?.choices,
      initialChoiceKey: choicesData?.currentChoiceKey,
      choiceLabel: choicesData ? 'Выбранный вариант' : undefined,
      readonlyCore: isSrdFeature,
      onSave: (data: {
        name: string;
        description: string;
        level?: number;
        selectedChoiceKey?: string;
      }) => {
        const features = [...props.actor.features];

        features[index] = {
          ...features[index],
          name: data.name,
          description: data.description,
          level: data.level,
        };

        // Если поменяли выбор (наследие и т.п.) — обновляем также featureChoices
        if (choicesData && data.selectedChoiceKey) {
          const selectedOption = choicesData.choices.find(
            (choice) => choice.key === data.selectedChoiceKey,
          );

          if (selectedOption) {
            // Обновляем название особенности с новым выбором
            const baseName = feature.name
              .replace(/(?:\s*\(.*\)|\s*:.*)$/, '')
              .trim();

            features[index].name = `${baseName}: ${selectedOption.name}`;

            // Обновляем featureChoices в system.species
            const currentSpecies = props.actor.system?.species;

            if (currentSpecies) {
              const updatedFeatureChoices = {
                ...currentSpecies.featureChoices,
                [choicesData.speciesFeatureKey]: data.selectedChoiceKey,
              };

              emit('update:actor', {
                features,
                system: {
                  ...props.actor.system,
                  species: {
                    ...currentSpecies,
                    featureChoices: updatedFeatureChoices,
                  },
                },
              });

              triggerSaveIfNotEdit();

              return;
            }
          }
        }

        emit('update:actor', { features });
        triggerSaveIfNotEdit();
      },
    });
  }

  /**
   * Удаляет особенность по объекту (находит по id).
   *
   * Для черты дополнительно откатывает её дары: снимает выданные заклинания,
   * активные эффекты (по провенансу `feat:<id>`) и владения.
   *
   * @param feature - удаляемая особенность
   */
  function removeFeature(feature: Feature) {
    if (feature.featureType === 'feat') {
      const result = removeFeatFromActor(props.actor, feature);

      emit('update:actor', {
        features: result.features,
        spells: result.spells,
        activeEffects: result.activeEffects,
        system: {
          ...props.actor.system,
          proficiencies: result.proficiencies,
        },
      });

      triggerSaveIfNotEdit();

      return;
    }

    const features = props.actor.features.filter(
      (feat) => feat.id !== feature.id,
    );

    emit('update:actor', { features });
    triggerSaveIfNotEdit();
  }
</script>

<template>
  <div class="flex min-h-[200px] flex-1 flex-col space-y-3">
    <UButton
      v-if="isEditMode"
      icon="tabler:plus"
      color="primary"
      variant="soft"
      size="sm"
      @click.left.exact.prevent="addFeature"
    >
      Добавить особенность
    </UButton>

    <!-- Список обычных особенностей -->
    <div
      v-if="regularFeatures.length === 0"
      class="py-4 text-center text-sm text-dimmed"
    >
      Нет особенностей
    </div>

    <div
      v-else
      class="space-y-1"
    >
      <div
        v-for="feature in regularFeatures"
        :key="feature.id"
        class="flex min-h-[44px] items-center gap-3 rounded-lg bg-accented/30 px-3 py-2 transition-colors"
        :class="!isEditMode ? 'cursor-pointer hover:bg-accented/50' : ''"
        @click.left.exact.prevent="
          isEditMode ? undefined : showDescription(feature)
        "
        @contextmenu="openContextMenu($event, feature)"
      >
        <div class="flex flex-1 items-center gap-2 overflow-hidden">
          <UBadge
            v-if="feature.featureType === 'species'"
            color="primary"
            variant="subtle"
            size="sm"
            class="shrink-0"
          >
            Вид
          </UBadge>

          <UBadge
            v-else-if="feature.level"
            color="primary"
            variant="subtle"
            size="sm"
            class="shrink-0"
          >
            {{ feature.level }} ур.
          </UBadge>

          <span class="truncate text-sm text-highlighted">
            {{ feature.name }}
          </span>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <UButton
            v-if="isEditMode"
            icon="tabler:pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            @click.left.exact.prevent="editFeature(feature)"
          />

          <UButton
            v-if="isEditMode"
            icon="tabler:trash"
            color="red"
            variant="ghost"
            size="xs"
            @click.left.exact.prevent="removeFeature(feature)"
          />
        </div>
      </div>
    </div>

    <!-- Разделитель: Черты -->
    <h4
      class="mt-5 mb-1 text-xs font-semibold tracking-wider text-muted uppercase"
    >
      Черты
    </h4>

    <!-- Список черт -->
    <div
      v-if="featsList.length === 0"
      class="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed px-3 py-4 text-sm transition-colors"
      :class="
        isDragOver
          ? 'border-primary-500/50 bg-primary-500/5 text-primary-400'
          : 'border-default/30 text-dimmed'
      "
    >
      {{ isDragOver ? 'Перетащите сюда' : 'В данный момент черт нет' }}
    </div>

    <div
      v-else
      class="space-y-1"
    >
      <div
        v-for="feat in featsList"
        :key="feat.id"
        @contextmenu="openContextMenu($event, feat)"
      >
        <FeatListItem
          :item="feat"
          variant="sheet"
          :show-edit="isEditMode"
          :show-delete="isEditMode"
          @click="isEditMode ? undefined : showDescription(feat)"
          @edit="editFeature(feat)"
          @delete="removeFeature(feat)"
        />
      </div>
    </div>

    <!-- Invisible flex-grow area to ensure bottom space is drop zone -->
    <div
      v-if="featsList.length > 0"
      class="min-h-[20px] flex-1"
    />
  </div>

  <!-- Контекстное меню (Teleport для корректного z-index) -->
  <Teleport to="body">
    <div
      v-if="isContextMenuOpen && contextMenuFeature"
      class="fixed inset-0 z-10000"
      @click.left.exact.prevent="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    >
      <div
        class="absolute min-w-[180px] rounded-lg border border-default bg-default py-1 shadow-xl"
        :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
        @click.stop
      >
        <!-- Редактировать -->
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleContextMenuAction('edit')"
        >
          <UIcon
            name="tabler:edit"
            class="h-4 w-4 text-muted"
          />
          Редактировать
        </button>

        <!-- Поделиться в чат -->
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-highlighted transition-colors hover:bg-accented/50"
          @click.left.exact.prevent="handleContextMenuAction('share')"
        >
          <UIcon
            name="tabler:message-share"
            class="h-4 w-4 text-muted"
          />
          Поделиться в чат
        </button>

        <!-- Разделитель -->
        <div class="mx-2 my-1 border-t border-default/50" />

        <!-- Удалить -->
        <ContextMenuDangerItem
          icon="tabler:trash"
          @click="handleContextMenuAction('delete')"
        >
          Удалить
        </ContextMenuDangerItem>
      </div>
    </div>
  </Teleport>
</template>
