import path from 'node:path';

import ui from '@nuxt/ui/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

/**
 * Сборка клиентской части системы ВНЕ приложения VTTG.
 *
 * Отличие от внутренней сборки: движок правил живёт здесь же (`src/engine`), а
 * нейтральное ядро (`@vtt/shared`) и внутренние модули приложения (`@/…`)
 * помечены EXTERNAL и резолвятся в рантайме из `globalThis.__VTTHost`; `vue` —
 * из `globalThis.Vue`. Так система не задваивает синглтоны приложения.
 *
 * Три настройки ниже обязательны для библиотечной IIFE-сборки (см. комментарии
 * по месту): `define` process.env, `interop: 'esModule'` и отключение
 * авто-импорта компонентов Nuxt UI.
 */

/** Внутренние модули приложения — резолвятся из `globalThis.__VTTHost`. */
const HOST_MODULE_IDS: string[] = [
  '@/core/actorDragState',
  '@/core/api/chatService',
  '@/core/clientHooks',
  '@/core/compendiumDataClient',
  '@/core/entityUtils',
  '@/core/extensionRegistry',
  '@/core/mimeTypes',
  '@/core/registries',
  '@/core/registries/macroRegistry',
  '@/core/tokenConsts',
  '@/core/utils/hotbarDrag',
  '@/shared_ui/components',
  '@/shared_ui/components/AssetBrowser.vue',
  '@/shared_ui/components/CardErrorFallback.vue',
  '@/shared_ui/components/EntityCard.vue',
  '@/shared_ui/components/FieldGroupReset.vue',
  '@/shared_ui/components/FieldsetLabel.vue',
  '@/shared_ui/components/ItemDescriptionRenderer.vue',
  '@/shared_ui/components/JournalEditor.vue',
  '@/shared_ui/components/LightEmitterEditor.vue',
  '@/shared_ui/components/RichTextEditor.vue',
  '@/shared_ui/components/SendToChatButton.vue',
  '@/shared_ui/components/TokenMediaPreview.vue',
  '@/shared_ui/components/UDraggableModal.vue',
  '@/shared_ui/composables',
  '@/shared_ui/composables/useActiveTab',
  '@/shared_ui/composables/useCompendiumView',
  '@/shared_ui/composables/useModalManager',
  '@/shared_ui/consts',
  '@/shared_ui/utils/componentUtils',
  '@/shared_ui/utils/domUtils',
  '@/stores/actionPromptStore',
  '@/stores/auraStore',
  '@/stores/chatStore',
  '@/stores/diceRollerStore',
  '@/stores/hotbarStore',
  '@/stores/initiativeStore',
  '@/stores/itemsStore',
  '@/stores/journalStore',
  '@/stores/projectileStore',
  '@/stores/spellTemplateStore',
  '@/stores/targetStore',
  '@/stores/worldStore',
  '@/system-runtime/activeSocket',
  '@nuxt/ui/composables',
  '@vtt/shared',
  '@vueuse/core',
  'pinia',
];

const EXTERNAL = new Set<string>([...HOST_MODULE_IDS, 'vue']);

export default defineConfig({
  // ОБЯЗАТЕЛЬНО: в `build.lib` Vite не подставляет NODE_ENV (рассчитывает на
  // бандлер-потребитель), а `client.js` грузится тегом <script> прямо в браузер,
  // где `process` не существует → ReferenceError ещё до вызова register().
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [
    // enforce:'pre' — помечаем EXTERNAL ДО алиас-резолва, чтобы ключ остался в
    // форме `@/…`/`vue` и совпал с ключами `__VTTHost` / `globalThis.Vue`.
    {
      name: 'vttg-host-externals',
      enforce: 'pre',
      resolveId(source: string) {
        if (EXTERNAL.has(source)) {
          return { id: source, external: true };
        }

        // Ассеты ПРИЛОЖЕНИЯ по абсолютному URL (фоны модалок и т.п.). Их отдаёт
        // веб-корень VTTG, а не папка системы, поэтому ссылку надо сохранить
        // как строку.
        //
        // ⚠️ Пометить их EXTERNAL НЕЛЬЗЯ: тогда они попадают под общий маппинг
        // `output.globals` и превращаются в `globalThis.__VTTHost["/assets/…"]`.
        // Такого «модуля» приложение не отдаёт → `undefined`, а `import bg from`
        // читает у него `.default` → «Cannot read properties of undefined» уже
        // при отрисовке листа. Поэтому подставляем КРОШЕЧНЫЙ виртуальный модуль,
        // экспортирующий сам URL: форма импорта сохраняется, адрес не меняется.
        if (source.startsWith('/assets/')) {
          return `\0vttg-app-asset:${source}`;
        }

        return null;
      },
      load(id: string) {
        if (id.startsWith('\0vttg-app-asset:')) {
          const url = id.slice('\0vttg-app-asset:'.length);

          return `export default ${JSON.stringify(url)};`;
        }

        return null;
      },
      // ОБЯЗАТЕЛЬНО: статические импорты внешних модулей Rollup разворачивает в
      // `globalThis.__VTTHost[…]` через `output.globals`, а ДИНАМИЧЕСКИЕ — нет.
      // Оставшийся `import('@/stores/…')` не резолвится в браузере и падает
      // асинхронно («Uncaught (in promise) TypeError») уже ПОСЛЕ того, как
      // система успешно зарегистрировалась — то есть мир открывается, а ломается
      // потом. Подменяем на синхронный резолв из реестра хоста, сохраняя форму
      // промиса с неймспейсом модуля.
      renderDynamicImport({ targetModuleId }) {
        if (targetModuleId && EXTERNAL.has(targetModuleId)) {
          return {
            left: 'Promise.resolve(globalThis.__VTTHost[',
            right: '])',
          };
        }

        return null;
      },
    },
    vue(),
    ui({
      // ОБЯЗАТЕЛЬНО: иначе авто-импорт втянет в бандл ВТОРУЮ копию Nuxt UI и
      // reka-ui, чьи Symbol-контексты не сойдутся с контекстами приложения →
      // падает setup компонентов с provide/inject. Теги резолвятся в рантайме:
      // приложение регистрирует UI-компоненты глобально.
      components: {
        exclude: [/.*/],
        dts: false,
      },
      ui: {
        icons: {
          arrowDown: 'tabler:arrow-down',
          arrowLeft: 'tabler:arrow-left',
          arrowRight: 'tabler:arrow-right',
          arrowUp: 'tabler:arrow-up',
          check: 'tabler:check',
          chevronDoubleLeft: 'tabler:chevrons-left',
          chevronDoubleRight: 'tabler:chevrons-right',
          chevronDown: 'tabler:chevron-down',
          chevronLeft: 'tabler:chevron-left',
          chevronRight: 'tabler:chevron-right',
          chevronUp: 'tabler:chevron-up',
          close: 'tabler:x',
          ellipsis: 'tabler:dots',
          loading: 'tabler:loader-2',
          minus: 'tabler:minus',
          plus: 'tabler:plus',
          search: 'tabler:search',
        },
      },
    }),
  ],
  resolve: {
    alias: [
      // Движок правил системы живёт в этой же репе — инлайнится в бандл.
      {
        find: '@vtt/shared/system/dnd.js',
        replacement: path.resolve(__dirname, './src/engine/index.ts'),
      },
      // Внутри приложения система ссылалась на СВОИ же файлы через алиас
      // приложения (`@/systems/dnd5e/…`, 46 мест). Снаружи такого пути нет —
      // заворачиваем самоссылки на собственные исходники.
      {
        find: /^@\/systems\/dnd5e/,
        replacement: path.resolve(__dirname, './src/client'),
      },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, './src/client/systemEntry.ts'),
      formats: ['iife'],
      name: '__vttgSystemDnd5eTest',
      fileName: () => 'client.js',
      cssFileName: 'client',
    },
    rollupOptions: {
      external: [...EXTERNAL],
      output: {
        inlineDynamicImports: true,
        globals: (id: string) =>
          id === 'vue'
            ? 'globalThis.Vue'
            : `globalThis.__VTTHost[${JSON.stringify(id)}]`,
        // ОБЯЗАТЕЛЬНО: в `__VTTHost`/`globalThis.Vue` лежат ES-неймспейсы, а
        // Rollup по умолчанию трактует external как CJS → при `import X from`
        // подставил бы весь объект вместо `X.default`, и `.vue`-компоненты
        // приезжали бы как `Module {default:{…}}` («missing template»).
        interop: 'esModule',
      },
    },
  },
});
