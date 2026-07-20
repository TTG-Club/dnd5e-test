declare module '@nuxt/ui' {
  import type { Plugin } from 'vue';

  interface ToastOptions {
    title?: string;
    description?: string;
    color?: string;
  }

  interface ToastApi {
    add: (toast: ToastOptions) => void;
    clear?: () => void;
  }

  export function useToast(): ToastApi;

  const plugin: Plugin;

  export default plugin;
}
