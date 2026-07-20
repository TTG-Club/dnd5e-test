<script setup lang="ts">
  import type { WeaponIconResult } from '../../composables/useWeaponIcon';

  import { computed } from 'vue';

  import {
    DEFAULT_WEAPON_ICON,
    useWeaponIcon,
  } from '../../composables/useWeaponIcon';

  const props = defineProps<{
    /** Ключ базового типа оружия */
    baseType?: string;
  }>();

  const { getWeaponIcon } = useWeaponIcon();

  /**
   * Результат определения иконки по baseType
   */
  const iconResult = computed<WeaponIconResult>(() =>
    getWeaponIcon(props.baseType),
  );
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span
    v-if="iconResult.svgContent"
    class="inline-flex shrink-0 items-center justify-center"
    v-html="iconResult.svgContent"
  />

  <!-- Стандартная Iconify-иконка -->
  <UIcon
    v-else
    :name="iconResult.iconName ?? DEFAULT_WEAPON_ICON"
  />
</template>
