<script setup lang="ts">
  import type { Actor } from '@vtt/shared/system/dnd.js';

  import { marked, Renderer } from 'marked';
  import { computed, ref, watch } from 'vue';

  import JournalEditor from '@/shared_ui/components/JournalEditor.vue';
  import { useJournalStore } from '@/stores/journalStore';

  interface Props {
    actor: Actor;
    isEditMode: boolean;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    'update:actor': [updates: Partial<Actor>];
  }>();

  const journalStore = useJournalStore();

  const localNotes = ref(props.actor.notes ?? '');

  watch(
    () => props.actor.notes,
    (newNotes) => {
      if (newNotes !== localNotes.value) {
        localNotes.value = newNotes ?? '';
      }
    },
  );

  watch(localNotes, (newValue) => {
    if (newValue !== props.actor.notes) {
      emit('update:actor', { notes: newValue });
    }
  });

  /**
   * Рендерер marked с target=_blank для всех ссылок
   */
  const renderer = new Renderer();

  renderer.link = ({ href, text }) => {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  /**
   * Рендерит markdown в HTML для режима просмотра
   */
  const renderedNotes = computed(() => {
    if (!props.actor.notes) {
      return '';
    }

    return marked.parse(props.actor.notes, {
      async: false,
      renderer,
    }) as string;
  });

  /**
   * Обрабатывает клики по контенту — перехватывает journal-link
   */
  function handleContentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Проверяем journal-link
    const journalLink = target.closest('[data-note-id]') as HTMLElement | null;

    if (journalLink) {
      const noteId = journalLink.getAttribute('data-note-id');

      if (noteId) {
        event.preventDefault();

        // Ищем заметку локально или запрашиваем с сервера
        const note = journalStore.notes.find(
          (noteItem) => noteItem.id === noteId,
        );

        if (note) {
          journalStore.shownNote = note;
        } else {
          journalStore.requestNoteById(noteId);
        }
      }
    }

    // Обычные ссылки — пусть открываются нативно (target=_blank)
  }
</script>

<template>
  <div>
    <JournalEditor
      v-if="isEditMode"
      v-model="localNotes"
    />

    <div
      v-else
      class="note-view min-h-[200px] rounded-lg bg-accented/30"
    >
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div
        v-if="actor.notes"
        class="prose prose-invert prose-sm max-w-none p-4 text-sm leading-relaxed text-toned"
        @click.left.exact="handleContentClick"
        v-html="renderedNotes"
      />

      <p
        v-else
        class="p-4 text-sm text-dimmed"
      >
        Нет заметок
      </p>
    </div>
  </div>
</template>

<style scoped>
  .note-view :deep(h1) {
    font-size: 1.5em;
    font-weight: 700;
    margin: 0.75em 0 0.3em;
    color: rgb(243 244 246);
  }

  .note-view :deep(h2) {
    font-size: 1.25em;
    font-weight: 600;
    margin: 0.6em 0 0.25em;
    color: rgb(229 231 235);
  }

  .note-view :deep(h3) {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0.5em 0 0.2em;
    color: rgb(209 213 219);
  }

  .note-view :deep(ul) {
    padding-left: 1.5em;
    list-style-type: disc;
  }

  .note-view :deep(ol) {
    padding-left: 1.5em;
    list-style-type: decimal;
  }

  .note-view :deep(blockquote) {
    border-left: 3px solid var(--ui-primary);
    padding-left: 1em;
    margin: 0.5em 0;
    color: rgb(156 163 175);
    font-style: italic;
  }

  .note-view :deep(a) {
    color: var(--ui-primary);
    text-decoration: underline;
  }

  .note-view :deep(code) {
    background: rgb(31 41 55);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.85em;
    color: rgb(248 113 113);
  }

  .note-view :deep(hr) {
    border: none;
    border-top: 1px solid rgb(55 65 81);
    margin: 1em 0;
  }

  .note-view :deep(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 0.5em 0;
  }
</style>
