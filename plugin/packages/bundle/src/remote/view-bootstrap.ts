/**
 * [INPUT]: 依赖固定远端设备的非秘密页面元数据，以及浏览器原生 Storage 与 storage event。
 * [OUTPUT]: 提供官方脚本执行前的远端页面标识和按设备隔离的 localStorage/sessionStorage 引导。
 * [POS]: remote 的浏览器兼容接缝；仅作用于当前远端 document，不修改 Storage.prototype 或本机页面。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export interface RemoteViewMetadata {
  readonly viewId: string
  readonly deviceId: string
  readonly name: string
  readonly authority: string
  readonly localUrl: string
  readonly stateUrl: string
  readonly reconnectUrl: string
}

function installAuthorityStorage(namespace: string): void {
  const prefix = `owndsh.remote.${namespace}.`
  const forwarded = new WeakSet<Event>()
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    let backing: Storage
    try { backing = globalThis[name] } catch { continue }
    const keys = () => Array.from({ length: backing.length }, (_, index) => backing.key(index))
      .filter((key): key is string => key !== null && key.startsWith(prefix))
      .map(key => key.slice(prefix.length))
    const methods = {
      getItem: (key: string) => backing.getItem(prefix + String(key)),
      setItem: (key: string, value: string) => backing.setItem(prefix + String(key), String(value)),
      removeItem: (key: string) => backing.removeItem(prefix + String(key)),
      clear: () => { for (const key of keys()) backing.removeItem(prefix + key) },
      key: (index: number) => keys()[Number(index) >>> 0] ?? null,
    }
    const target = Object.create(Storage.prototype) as object
    const storage: Storage = new Proxy(target, {
      get(_target, property) {
        if (property === 'length') return keys().length
        if (property === Symbol.toStringTag) return 'Storage'
        if (typeof property !== 'string') return undefined
        if (Object.hasOwn(methods, property)) return Reflect.get(methods, property)
        return methods.getItem(property) ?? undefined
      },
      set(_target, property, value: unknown) {
        if (typeof property !== 'string') return false
        methods.setItem(property, String(value))
        return true
      },
      deleteProperty(_target, property) {
        if (typeof property !== 'string') return false
        methods.removeItem(property)
        return true
      },
      has(_target, property) {
        return property === 'length' || typeof property === 'string'
          && (Object.hasOwn(methods, property) || methods.getItem(property) !== null)
      },
      ownKeys: keys,
      getOwnPropertyDescriptor(_target, property) {
        if (typeof property !== 'string') return undefined
        const value = methods.getItem(property)
        return value === null ? undefined : { configurable: true, enumerable: true, writable: true, value }
      },
      defineProperty(_target, property, descriptor) {
        if (typeof property !== 'string' || !('value' in descriptor)) return false
        methods.setItem(property, String(descriptor.value))
        return true
      },
    }) as Storage
    Object.defineProperty(globalThis, name, { configurable: true, get: () => storage })
    globalThis.addEventListener('storage', event => {
      if (forwarded.has(event) || event.storageArea !== backing) return
      event.stopImmediatePropagation()
      if (event.key === null || !event.key.startsWith(prefix)) return
      const logical = new StorageEvent('storage', {
        key: event.key.slice(prefix.length), oldValue: event.oldValue, newValue: event.newValue, url: event.url,
      })
      Object.defineProperty(logical, 'storageArea', { value: storage })
      forwarded.add(logical)
      globalThis.dispatchEvent(logical)
    }, true)
  }
}

export function remoteViewBootstrapScript(metadata: RemoteViewMetadata): string {
  const safeJson = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c')
  return `(${installAuthorityStorage.toString()})(${safeJson(metadata.authority)});Object.defineProperty(window,'__OWNDSH_REMOTE_VIEW__',{value:${safeJson(metadata)},configurable:false});`
}
