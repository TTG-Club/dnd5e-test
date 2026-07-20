import type { VttSystem } from './vttSystem.js';

/**
 * Реестр игровых систем Ядра VTT.
 *
 * Позволяет регистрировать и получать доступ к активной игровой системе
 * (например, D&D 5e) по её ID.
 * Используется как на клиенте, так и на сервере.
 *
 * Регистрация систем происходит при загрузке мира через ModuleLoader,
 * а не через hardcoded init.
 */
export class SystemRegistry {
  private systems: Map<string, VttSystem> = new Map();

  private activeSystemId: string | null = null;

  /**
   * Регистрирует новую систему в реестре.
   * @param system Экземпляр игровой системы
   */
  register(system: VttSystem): void {
    this.systems.set(system.id, system);
  }

  /**
   * Устанавливает систему по умолчанию (активную).
   * @param id Идентификатор системы
   */
  setActiveSessionSystem(id: string): void {
    if (!this.systems.has(id)) {
      throw new Error(
        `[SystemRegistry] Попытка установить несуществующую систему как активную: ${id}`,
      );
    }

    this.activeSystemId = id;
  }

  /**
   * Возвращает систему по её ID. Если ID не передан — возвращает активную систему текущей сессии.
   * @param id (Опционально) Идентификатор системы
   * @throws Error если система не найдена или не установлена активная
   */
  getSystem(id?: string): VttSystem {
    const lookupId = id ?? this.activeSystemId;

    if (!lookupId) {
      throw new Error(
        '[SystemRegistry] Не установлена активная система и ID не был передан явно.',
      );
    }

    const system = this.systems.get(lookupId);

    if (!system) {
      throw new Error(
        `[SystemRegistry] Система с ID '${lookupId}' не зарегистрирована.`,
      );
    }

    return system;
  }

  /**
   * Возвращает активную систему сессии или `null`, если активная система ещё
   * не установлена (в отличие от `getSystem()`, не бросает исключение).
   *
   * Предназначен для потребителей, которые могут выполниться до загрузки мира
   * (например, Pinia-сторы), где отсутствие системы — валидное состояние.
   */
  getActiveSystem(): VttSystem | null {
    if (!this.activeSystemId) {
      return null;
    }

    return this.systems.get(this.activeSystemId) ?? null;
  }

  /**
   * Удаляет систему из реестра.
   * @param id Идентификатор системы
   */
  unregister(id: string): void {
    this.systems.delete(id);

    if (this.activeSystemId === id) {
      this.activeSystemId = null;
    }
  }
}

export const systemRegistry = new SystemRegistry();
