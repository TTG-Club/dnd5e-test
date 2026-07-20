<script setup lang="ts">
  import type { Spell } from '@vtt/shared/system/dnd.js';

  import { getSpellProjectileCount } from '@vtt/shared/system/dnd.js';
  import { computed, ref, watch } from 'vue';

  import { useProjectileStore } from '@/stores/projectileStore';

  defineOptions({
    inheritAttrs: false,
  });

  const props = defineProps<{
    open: boolean;
    spell: Spell;
    /** Уровень персонажа-заклинателя (число снарядов заговоров растёт порогами уровня) */
    casterLevel: number;
    availableSpellLevels: number[];
    modalId: string;
    onConfirm: (selectedLevel: number) => void;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'close': [];
    'bringToFront': [];
  }>();

  const projectileStore = useProjectileStore();

  function resolveInitialSpellLevel(): number {
    if (props.availableSpellLevels.length > 0) {
      return props.availableSpellLevels[0];
    }

    if (props.spell.level > 0) {
      return props.spell.level;
    }

    return 0;
  }

  const selectedSpellLevel = ref(resolveInitialSpellLevel());

  const spellLevelItems = computed(() => {
    return props.availableSpellLevels.map((lvl) => ({
      label: `${lvl}-й круг`,
      value: lvl,
    }));
  });

  const calculatedMaxProjectiles = computed(() =>
    getSpellProjectileCount(props.spell, {
      slotLevel: selectedSpellLevel.value,
      casterLevel: props.casterLevel,
    }),
  );

  /** Подсказка режима распределения (свободный режим не подписывается) */
  const distributionHint = computed(() => {
    const distribution = props.spell.projectiles?.targetDistribution;

    if (distribution === 'single') {
      return 'Все снаряды — в одну цель';
    }

    if (distribution === 'distinct') {
      return 'Каждый снаряд — в отдельную цель';
    }

    return null;
  });

  watch(
    calculatedMaxProjectiles,
    (newMax) => {
      if (projectileStore.isActive) {
        projectileStore.maxProjectiles = newMax;

        if (projectileStore.assignedProjectilesCount > newMax) {
          projectileStore.assignedTargets.clear();
        }
      }
    },
    { immediate: true },
  );

  function handleConfirm() {
    emit('update:open', false);
    emit('close');
    props.onConfirm(selectedSpellLevel.value);
  }

  function handleCancel() {
    if (projectileStore.isActive) {
      projectileStore.stopTargeting();
    }

    emit('update:open', false);
    emit('close');
  }
</script>

<template>
  <Teleport to="#hud-prompts-container">
    <!-- Имитируем внешний вид и анимации из ActionPromptList -->
    <Transition name="slide-up">
      <div
        v-if="open && projectileStore.isActive"
        class="pointer-events-auto flex min-w-[380px] flex-col gap-3 rounded-xl border border-default/50 bg-default/90 px-4 py-3 text-highlighted shadow-xl ring-accented backdrop-blur-sm"
      >
        <div class="flex items-center gap-2 border-b border-muted/50 pb-2">
          <UIcon
            name="tabler:wand"
            class="h-5 w-5 shrink-0 text-toned"
          />

          <span class="text-sm font-medium whitespace-nowrap">
            Применить заклинание: {{ props.spell.name }}?
          </span>
        </div>

        <p
          v-if="distributionHint"
          class="text-xs text-dimmed"
        >
          {{ distributionHint }}
        </p>

        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <USelect
              v-if="props.spell.level > 0"
              v-model.number="selectedSpellLevel"
              :items="spellLevelItems"
              value-key="value"
              label-key="label"
              class="w-32"
              size="sm"
              color="white"
              variant="outline"
            />

            <span class="text-sm font-bold text-toned">
              Снаряды: {{ projectileStore.assignedProjectilesCount }} /
              {{ calculatedMaxProjectiles }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              icon="tabler:check"
              color="primary"
              variant="solid"
              size="sm"
              @click.left.exact.prevent="handleConfirm"
            />

            <UButton
              icon="tabler:x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click.left.exact.prevent="handleCancel"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .slide-up-enter-active,
  .slide-up-leave-active {
    transition: all 0.3s ease;
  }

  .slide-up-enter-from,
  .slide-up-leave-to {
    opacity: 0;
    transform: translateY(20px);
  }
</style>
