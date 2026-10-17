/**
 * [INPUT]: 依赖 Server 返回的已校验大小和 SHA-256 的 ZIP 字节
 * [OUTPUT]: 提供受限 ZIP 解包，拒绝路径穿越、符号链接、重复文件和超限制品
 * [POS]: platform-client 的制品边界；不负责 frontmatter 或安装目录切换
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_FILES = 1_000

export class SkillArchiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillArchiveError'
  }
}

interface ZipEntry {
  readonly path: string
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly method: number
  readonly offset: number
  readonly crc32: number
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

function fail(message: string): never {
  throw new SkillArchiveError(message)
}

function decodeName(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return fail('skill ZIP 文件名不是有效 UTF-8')
  }
}

function safePath(raw: string): string | undefined {
  const value = raw.replaceAll('\\', '/')
  if (value.startsWith('/') || value.includes('\0')) fail('skill ZIP 路径非法')
  const parts = value.split('/')
  if (parts.at(-1) === '') return undefined
  if (parts.some(part => part === '' || part === '.' || part === '..')) fail('skill ZIP 路径穿越')
  return parts.join('/')
}

function crc32(value: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of value) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const start = Math.max(0, bytes.byteLength - 65_557)
  for (let offset = bytes.byteLength - 22; offset >= start; offset--) {
    if (u32(view, offset) === 0x06054b50) return offset
  }
  return fail('skill ZIP 缺少中央目录')
}

function centralEntries(bytes: Uint8Array): ZipEntry[] {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) fail('skill ZIP 超过大小上限')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = findEndOfCentralDirectory(bytes)
  const disk = u16(view, end + 4)
  const centralDisk = u16(view, end + 6)
  const count = u16(view, end + 10)
  const size = u32(view, end + 12)
  const offset = u32(view, end + 16)
  if (disk !== 0 || centralDisk !== 0 || count !== u16(view, end + 8)) fail('skill ZIP 多磁盘格式不支持')
  if (count > MAX_FILES || size > bytes.byteLength || offset > bytes.byteLength || offset + size > bytes.byteLength) {
    fail('skill ZIP 中央目录无效')
  }
  const entries: ZipEntry[] = []
  let cursor = offset
  const seen = new Set<string>()
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > bytes.byteLength || u32(view, cursor) !== 0x02014b50) fail('skill ZIP 中央目录项无效')
    const flags = u16(view, cursor + 8)
    const method = u16(view, cursor + 10)
    const crc = u32(view, cursor + 16)
    const compressedSize = u32(view, cursor + 20)
    const uncompressedSize = u32(view, cursor + 24)
    const nameLength = u16(view, cursor + 28)
    const extraLength = u16(view, cursor + 30)
    const commentLength = u16(view, cursor + 32)
    const externalAttributes = u32(view, cursor + 38)
    const localOffset = u32(view, cursor + 42)
    const nameStart = cursor + 46
    const endEntry = nameStart + nameLength + extraLength + commentLength
    if (endEntry > bytes.byteLength) fail('skill ZIP 中央目录项越界')
    const name = safePath(decodeName(bytes.subarray(nameStart, nameStart + nameLength)))
    cursor = endEntry
    if (name === undefined) continue
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8)) fail('skill ZIP 使用了不支持的压缩或加密格式')
    if (uncompressedSize > MAX_FILE_BYTES || compressedSize > MAX_ARCHIVE_BYTES) fail('skill ZIP 文件过大')
    const unixMode = externalAttributes >>> 16
    if ((unixMode & 0xf000) === 0xa000) fail('skill ZIP 不允许符号链接')
    if (seen.has(name)) fail('skill ZIP 包含重复文件')
    seen.add(name)
    entries.push({ path: name, compressedSize, uncompressedSize, method, offset: localOffset, crc32: crc })
  }
  return entries
}

async function inflate(value: Uint8Array): Promise<Uint8Array> {
  const copy = Uint8Array.from(value)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_FILE_BYTES) fail('skill ZIP 文件过大')
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (entry.offset + 30 > bytes.byteLength || u32(view, entry.offset) !== 0x04034b50) fail('skill ZIP 本地文件头无效')
  const nameLength = u16(view, entry.offset + 26)
  const extraLength = u16(view, entry.offset + 28)
  const start = entry.offset + 30 + nameLength + extraLength
  const end = start + entry.compressedSize
  if (end > bytes.byteLength) fail('skill ZIP 文件内容越界')
  const compressed = bytes.subarray(start, end)
  let result: Uint8Array
  try {
    result = entry.method === 0 ? new Uint8Array(compressed) : await inflate(compressed)
  } catch {
    fail('skill ZIP 解压失败')
  }
  if (result.byteLength !== entry.uncompressedSize || crc32(result) !== entry.crc32) fail('skill ZIP 文件校验失败')
  return result
}

/** 解包为相对 skill 根的文件映射；调用方负责校验 SKILL.md 和原子安装。 */
export async function unpackSkillArchive(bytes: Uint8Array, skillName: string): Promise<ReadonlyMap<string, Uint8Array>> {
  const entries = centralEntries(bytes)
  const files = new Map<string, Uint8Array>()
  let total = 0
  const prefix = `${skillName}/`
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) fail('skill ZIP 根目录必须与 skill name 一致')
    const relative = entry.path.slice(prefix.length)
    if (relative === '' || relative.includes('/.')) fail('skill ZIP 包含隐藏或非法路径')
    total += entry.uncompressedSize
    if (total > MAX_UNPACKED_BYTES) fail('skill ZIP 解压后超过大小上限')
    files.set(relative, await readEntry(bytes, entry))
  }
  if (!files.has('SKILL.md')) fail('skill ZIP 缺少 SKILL.md')
  return files
}
