<script setup lang="ts">
  import type {
    DamageDefenseKind,
    SpeciesDefinition,
  } from '@vtt/shared/system/dnd.js';

  import type { SpeciesWizardState } from './useSpeciesWizard';

  import {
    CONDITIONS,
    DAMAGE_DEFENSE_KIND_LABELS,
    DAMAGE_TYPE_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import {
    ABILITY_LABELS,
    CREATURE_SIZE_LABELS,
    CREATURE_TYPE_LABELS,
  } from '../constants';

  const props = defineProps<{
    speciesDefinition: SpeciesDefinition;
    state: SpeciesWizardState;
  }>();

  const emit = defineEmits<{
    'update:state': [value: SpeciesWizardState];
  }>();

  const localState = computed({
    get: () => props.state,
    set: (val) => emit('update:state', val),
  });

  const speedDisplay = computed(() => {
    const spd = props.speciesDefinition.speed;
    const parts = [`Ходьба ${spd.walk} фт.`];

    if (spd.fly) {
      parts.push(`Полет ${spd.fly} фт.`);
    }

    if (spd.swim) {
      parts.push(`Плавание ${spd.swim} фт.`);
    }

    if (spd.climb) {
      parts.push(`Лазание ${spd.climb} фт.`);
    }

    if (spd.burrow) {
      parts.push(`Копание ${spd.burrow} фт.`);
    }

    return parts.join(', ');
  });

  const displayType = computed(() => {
    const creatureType = props.speciesDefinition.creatureType;

    return CREATURE_TYPE_LABELS[creatureType] || creatureType;
  });

  const sizeOptions = computed(() => {
    return props.speciesDefinition.size.map((sizeValue) => ({
      value: sizeValue,
      label: CREATURE_SIZE_LABELS[sizeValue] || sizeValue,
    }));
  });

  const hasMultipleSizes = computed(
    () => props.speciesDefinition.size.length > 1,
  );

  // Инфо-гранты
  const infoGrants = computed(() => {
    const grants: { title: string; desc: string }[] = [];

    props.speciesDefinition.grants.forEach((group) => {
      if (group.type === 'darkvision') {
        grants.push({ title: 'Тёмное зрение', desc: `${group.range} фт.` });
      } else if (group.type === 'savingThrowProficiency') {
        if (group.abilities.length > 0) {
          grants.push({
            title: 'Спасброски',
            desc: group.abilities
              .map((ability) => ABILITY_LABELS[ability] ?? ability)
              .join(', '),
          });
        }
      } else if (group.type === 'damageDefense') {
        const typesByKind = new Map<DamageDefenseKind, string[]>();

        for (const entry of group.entries) {
          const list = typesByKind.get(entry.kind) ?? [];

          list.push(DAMAGE_TYPE_LABELS[entry.damageType] ?? entry.damageType);
          typesByKind.set(entry.kind, list);
        }

        for (const [kind, types] of typesByKind) {
          grants.push({
            title: DAMAGE_DEFENSE_KIND_LABELS[kind],
            desc: types.join(', '),
          });
        }
      } else if (group.type === 'conditionImmunity') {
        if (group.conditions.length > 0) {
          grants.push({
            title: 'Иммунитет к состояниям',
            desc: group.conditions
              .map(
                (key) =>
                  CONDITIONS.find((condition) => condition.key === key)?.nameRu
                  ?? key,
              )
              .join(', '),
          });
        }
      } else if (
        group.type === 'language'
        && (!group.choices || group.choices.count === 0)
      ) {
        if (group.items.length > 0) {
          grants.push({ title: 'Языки', desc: group.items.join(', ') });
        }
      } else if (
        group.type === 'weaponProficiency'
        && (!group.choices || group.choices.count === 0)
      ) {
        if (group.items.length > 0) {
          grants.push({ title: 'Оружие', desc: group.items.join(', ') });
        }
      } else if (
        group.type === 'armorProficiency'
        && (!group.choices || group.choices.count === 0)
      ) {
        if (group.items.length > 0) {
          grants.push({ title: 'Снаряжение', desc: group.items.join(', ') });
        }
      } else if (
        group.type === 'toolProficiency'
        && (!group.choices || group.choices.count === 0)
      ) {
        if (group.items.length > 0) {
          grants.push({ title: 'Инструменты', desc: group.items.join(', ') });
        }
      }
    });

    return grants;
  });
</script>

<template>
  <div class="flex flex-col gap-6 p-1">
    <!-- Описание вида -->
    <div class="rounded-lg bg-elevated/50 p-4 leading-relaxed text-toned">
      {{ speciesDefinition.description }}
    </div>

    <!-- Основные характеристики -->
    <div class="grid grid-cols-2 gap-4">
      <div class="flex flex-col rounded-lg bg-elevated p-3">
        <span
          class="mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase"
        >
          Тип существа
        </span>

        <span class="font-medium text-highlighted">{{ displayType }}</span>
      </div>

      <div class="flex flex-col rounded-lg bg-elevated p-3">
        <span
          class="mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase"
        >
          Скорость
        </span>

        <span class="font-medium text-highlighted">{{ speedDisplay }}</span>
      </div>
    </div>

    <!-- Выбор размера (если есть варианты) -->
    <div
      v-if="hasMultipleSizes"
      class="flex flex-col rounded-lg bg-elevated/50 p-4"
    >
      <span
        class="mb-3 text-xs font-semibold tracking-wider text-muted uppercase"
      >
        Выберите размер
      </span>

      <div class="flex gap-4">
        <URadioGroup
          v-model="localState.selectedSize"
          :items="sizeOptions"
          orientation="horizontal"
          class="gap-4"
          value-key="value"
          label-key="label"
        />
      </div>
    </div>

    <div
      v-else
      class="flex flex-col rounded-lg bg-elevated p-3"
    >
      <span
        class="mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase"
      >
        Размер
      </span>

      <span class="font-medium text-highlighted">{{
        sizeOptions[0]?.label
      }}</span>
    </div>

    <!-- Информационные гранты -->
    <div
      v-if="infoGrants.length > 0"
      class="flex flex-col gap-3"
    >
      <span class="text-xs font-semibold tracking-wider text-muted uppercase">
        Врождённые особенности
      </span>

      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="(grant, idx) in infoGrants"
          :key="idx"
          class="flex flex-col rounded-lg bg-elevated p-3"
        >
          <span
            class="mb-1 text-[10px] font-semibold tracking-wider text-primary-400 uppercase"
          >
            {{ grant.title }}
          </span>

          <span class="font-medium text-highlighted">{{ grant.desc }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
