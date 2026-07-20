import type { ServerToClientEvents } from './wsEvents.js';

/**
 * Клиентская обёртка WebSocket — типизированная замена socket.io-client.
 *
 * Предоставляет:
 * - Авто-реконнект с exponential backoff
 * - Типизированные emit/on/off
 * - emitWithAck для request-response паттерна
 * - Реактивное состояние подключения
 */
import {
  deserialize,
  generateAckId,
  isAckResponse,
  isWsMessage,
  serializeMessage,
} from './wsProtocol.js';

export type { ServerToClientEvents } from './wsEvents.js';

type EventHandler = (...args: unknown[]) => void;

/** Конфигурация авто-реконнекта */
interface ReconnectOptions {
  /** Включён ли реконнект (по умолчанию true) */
  enabled: boolean;
  /** Начальная задержка в мс (по умолчанию 1000) */
  initialDelay: number;
  /** Максимальная задержка в мс (по умолчанию 10000) */
  maxDelay: number;
  /** Множитель для exponential backoff (по умолчанию 1.5) */
  factor: number;
}

const DEFAULT_RECONNECT: ReconnectOptions = {
  enabled: true,
  initialDelay: 1000,
  maxDelay: 10000,
  factor: 1.5,
};

/**
 * Короткая задержка перед ПЕРВЫМ ретраем после обрыва: единичный блип сети
 * переживаем почти мгновенно, не ожидая полную initialDelay (~1с мёртвого UI).
 */
const FAST_FIRST_RECONNECT_DELAY = 250;

/**
 * Клиентская обёртка WebSocket с авто-реконнектом и типизированными событиями.
 * Аналог Socket из socket.io-client.
 */
export class TypedWebSocketClient {
  private ws: WebSocket | null = null;

  private url: string;

  private handlers: Map<string, Set<EventHandler>> = new Map();

  private pendingAcks: Map<
    string,
    {
      resolve: (result: unknown[]) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  private reconnectOptions: ReconnectOptions;

  private reconnectDelay: number;

  /** Счётчик попыток с момента последнего открытого соединения (для fast-first). */
  private reconnectAttempts = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private isManuallyClosed = false;

  /** Состояние подключения */
  connected = false;

  constructor(url: string, reconnect?: Partial<ReconnectOptions>) {
    this.url = url;
    this.reconnectOptions = { ...DEFAULT_RECONNECT, ...reconnect };
    this.reconnectDelay = this.reconnectOptions.initialDelay;
  }

  /** Открытие соединения */
  connect(): void {
    this.isManuallyClosed = false;
    this.doConnect();
  }

  private doConnect(): void {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();

      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = this.reconnectOptions.initialDelay;
      this.reconnectAttempts = 0;
      this.triggerEvent('connect');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      const parsed = deserialize(raw);

      if (!parsed) {
        return;
      }

      if (isAckResponse(parsed)) {
        // Обработка ack-ответа от сервера
        const pending = this.pendingAcks.get(parsed.ackId);

        if (pending) {
          clearTimeout(pending.timer);
          this.pendingAcks.delete(parsed.ackId);
          pending.resolve(parsed.result);
        }

        return;
      }

      if (isWsMessage(parsed)) {
        this.triggerEvent(parsed.event, ...parsed.args);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.triggerEvent('disconnect');

      if (!this.isManuallyClosed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose будет вызван автоматически после onerror
      this.triggerEvent('connect_error');
    };
  }

  private scheduleReconnect(): void {
    if (!this.reconnectOptions.enabled || this.isManuallyClosed) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Первый ретрай — короткий (быстрый отыгрыш единичного блипа); дальше
    // exponential backoff. Джиттер 50–100% размывает «стадо» одновременных
    // реконнектов после общего рестарта сервера (иначе все клиенты ломятся
    // разом и снова валят его полным ре-синком мира).
    const base =
      this.reconnectAttempts === 0
        ? FAST_FIRST_RECONNECT_DELAY
        : this.reconnectDelay;

    const jittered = Math.round(base * (0.5 + Math.random() * 0.5));

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, jittered);

    this.reconnectAttempts += 1;

    // Exponential backoff наращиваем только после быстрого первого ретрая.
    if (this.reconnectAttempts > 1) {
      this.reconnectDelay = Math.min(
        this.reconnectDelay * this.reconnectOptions.factor,
        this.reconnectOptions.maxDelay,
      );
    }
  }

  /** Подписка на типизированное событие */
  on<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E],
  ): void;

  /** Подписка на произвольное событие (fallback) */
  on(event: string, handler: EventHandler): void;

  on(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || new Set();

    existing.add(handler);
    this.handlers.set(event, existing);
  }

  /** Подписка на типизированное событие (один раз) */
  once<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E],
  ): void;

  /** Подписка на произвольное событие (один раз, fallback) */
  once(event: string, handler: EventHandler): void;

  /** Подписка на событие (один раз) */
  once(event: string, handler: EventHandler): void {
    const wrapper: EventHandler = (...args) => {
      handler(...args);
      this.off(event, wrapper);
    };

    this.on(event, wrapper);
  }

  /** Отписка от типизированного события */
  off<E extends keyof ServerToClientEvents>(
    event: E,
    handler?: ServerToClientEvents[E],
  ): void;

  /** Отписка от произвольного события (fallback) */
  off(event: string, handler?: EventHandler): void;

  /** Отписка от события. Без handler — удаляет все обработчики для события. */
  off(event: string, handler?: EventHandler): void {
    if (!handler) {
      this.handlers.delete(event);

      return;
    }

    const existing = this.handlers.get(event);

    if (existing) {
      existing.delete(handler);

      if (existing.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /** Отправка события на сервер */
  emit(event: string, ...args: unknown[]): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(event, args));
    }
  }

  /**
   * Отправка события c ожиданием ответа (ack).
   * Используется для request-response паттерна (ping, fog:load, token:get-selection).
   * @param event - имя события
   * @param args - аргументы события
   * @param timeoutMs - таймаут ожидания ответа (по умолчанию 10 секунд)
   * @returns Promise с результатом callback
   */
  emitWithAck(
    event: string,
    args: unknown[],
    timeoutMs = 10000,
  ): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const ackId = generateAckId();

      const timer = setTimeout(() => {
        this.pendingAcks.delete(ackId);
        reject(new Error(`Ack timeout for event '${event}' (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingAcks.set(ackId, { resolve, timer });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(serializeMessage(event, args, ackId));
      } else {
        clearTimeout(timer);
        this.pendingAcks.delete(ackId);
        reject(new Error('WebSocket is not connected'));
      }
    });
  }

  /** Закрытие соединения */
  close(): void {
    this.isManuallyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Очищаем pending acks
    for (const [, pending] of this.pendingAcks) {
      clearTimeout(pending.timer);
    }

    this.pendingAcks.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  private triggerEvent(event: string, ...args: unknown[]): void {
    const eventHandlers = this.handlers.get(event);

    if (!eventHandlers) {
      return;
    }

    for (const handler of eventHandlers) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[WS Client] Error in handler for '${event}':`, err);
      }
    }
  }
}
