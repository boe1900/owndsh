/**
 * [INPUT]: 依赖服务端确认的账号/设备、当前 document 的 Web Storage。
 * [OUTPUT]: 在原生客户端加载前隔离缓存与 storage event，避免跨设备草稿和选择状态串用。
 * [POS]: workspace 的 document 隔离层；不修改全局 Storage.prototype 或其他标签。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export function installWorkspaceStorage(userId: string, deviceId: string): void {
  const prefix = `owndsh.workspace.${encodeURIComponent(userId)}.${encodeURIComponent(deviceId)}.`;
  const forwarded = new WeakSet<Event>();
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const backing = globalThis[name];
    const keys = () => Array.from({ length: backing.length }, (_, index) => backing.key(index))
      .filter((key): key is string => key !== null && key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
    const methods = {
      getItem: (key: string) => backing.getItem(prefix + String(key)),
      setItem: (key: string, value: string) => backing.setItem(prefix + String(key), String(value)),
      removeItem: (key: string) => backing.removeItem(prefix + String(key)),
      clear: () => { for (const key of keys()) backing.removeItem(prefix + key); },
      key: (index: number) => keys()[Number(index) >>> 0] ?? null,
    };
    const storage = new Proxy(Object.create(Storage.prototype), {
      get(_target, property) {
        if (property === 'length') return keys().length;
        if (property === Symbol.toStringTag) return 'Storage';
        if (typeof property !== 'string') return undefined;
        if (Object.hasOwn(methods, property)) return Reflect.get(methods, property);
        return methods.getItem(property) ?? undefined;
      },
      set(_target, property, value: unknown) {
        if (typeof property !== 'string') return false;
        methods.setItem(property, String(value)); return true;
      },
      deleteProperty(_target, property) {
        if (typeof property !== 'string') return false;
        methods.removeItem(property); return true;
      },
      has(_target, property) { return property === 'length' || typeof property === 'string' && (Object.hasOwn(methods, property) || methods.getItem(property) !== null); },
      ownKeys: keys,
      getOwnPropertyDescriptor(_target, property) {
        if (typeof property !== 'string') return undefined;
        const value = methods.getItem(property);
        return value === null ? undefined : { configurable: true, enumerable: true, writable: true, value };
      },
      defineProperty(_target, property, descriptor) {
        if (typeof property !== 'string' || !('value' in descriptor)) return false;
        methods.setItem(property, String(descriptor.value)); return true;
      },
    });
    Object.defineProperty(globalThis, name, { configurable: true, get: () => storage });
    globalThis.addEventListener('storage', event => {
      if (forwarded.has(event) || event.storageArea !== backing) return;
      event.stopImmediatePropagation();
      if (event.key === null || !event.key.startsWith(prefix)) return;
      const logical = new StorageEvent('storage', { key: event.key.slice(prefix.length), oldValue: event.oldValue, newValue: event.newValue, url: event.url });
      Object.defineProperty(logical, 'storageArea', { value: storage });
      forwarded.add(logical); globalThis.dispatchEvent(logical);
    }, true);
  }
}
