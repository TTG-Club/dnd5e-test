/**
 * Общий протокол WebSocket сообщений.
 * Используется и на сервере, и на клиенте для сериализации/десериализации событий.
 */

/** Стандартное событийное сообщение */
export interface WsMessage {
  /** Имя события (e.g. 'token:updated') */
  event: string;
  /** Аргументы события */
  args: unknown[];
  /** ID для request-response (ack) паттерна */
  ackId?: string;
}

/** Ответ на ack-запрос */
export interface WsAckResponse {
  /** ID соответствующего запроса */
  ackId: string;
  /** Результат (аргументы callback) */
  result: unknown[];
}

/** Тип-guard: является ли сообщение ack-ответом */
export function isAckResponse(data: unknown): data is WsAckResponse {
  return (
    typeof data === 'object'
    && data !== null
    && 'ackId' in data
    && 'result' in data
    && !('event' in data)
  );
}

/** Тип-guard: является ли сообщение событием */
export function isWsMessage(data: unknown): data is WsMessage {
  return (
    typeof data === 'object'
    && data !== null
    && 'event' in data
    && 'args' in data
  );
}

let ackCounter = 0;

/**
 * Генерирует уникальный ID для ack-запроса.
 * Используется для идентификации request-response пар.
 */
export function generateAckId(): string {
  return `ack_${Date.now()}_${++ackCounter}`;
}

/**
 * Сериализует событие в JSON-строку для отправки по WebSocket.
 * @param event - имя события
 * @param args - аргументы события
 * @param ackId - опциональный ID для ack-запроса
 */
export function serializeMessage(
  event: string,
  args: unknown[],
  ackId?: string,
): string {
  const msg: WsMessage = { event, args };

  if (ackId) {
    msg.ackId = ackId;
  }

  return JSON.stringify(msg);
}

/**
 * Сериализует ack-ответ в JSON-строку.
 * @param ackId - ID запроса
 * @param result - аргументы callback
 */
export function serializeAckResponse(ackId: string, result: unknown[]): string {
  const response: WsAckResponse = { ackId, result };

  return JSON.stringify(response);
}

/**
 * Десериализует JSON-строку из WebSocket в объект.
 * Возвращает WsMessage или WsAckResponse, или null при ошибке.
 */
export function deserialize(raw: string): WsMessage | WsAckResponse | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (isAckResponse(parsed)) {
      return parsed;
    }

    if (isWsMessage(parsed)) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}
