#!/usr/bin/env node
/**
 * [INPUT]: 依赖一个或多个测试日志路径与可选受控秘密 literal 文件。
 * [OUTPUT]: 逐行扫描 Bearer/API key/JWT/private key/credential 赋值和精确 literal，零命中才返回 0。
 * [POS]: scripts 的 CI 日志泄漏门禁，诊断只输出文件、行号和模式名，不回显秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BUILTIN_PATTERNS = [
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}\b/i],
  ['api-key', /\bsk-[A-Za-z0-9_-]{12,}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    'credential-assignment',
    /(?:"(?:password|clientSecret|client_secret|providerSecret|provider_secret|accessToken|access_token|refreshToken|refresh_token)"\s*:\s*"[^"\r\n]{4,}"|(?:password|client_secret|provider_secret|access_token|refresh_token)\s*=\s*[^\s&,]{4,})/i,
  ],
]

export async function scanLogs({ inputs, literalFile }) {
  if (inputs.length === 0) throw new Error('至少提供一个日志文件或目录')
  const literals = literalFile ? await readLiterals(literalFile) : []
  const patterns = [
    ...BUILTIN_PATTERNS,
    ...literals.map((literal, index) => [`controlled-literal-${index + 1}`, literal]),
  ]
  const files = []
  for (const input of inputs) await collectFiles(path.resolve(input), files)
  files.sort()
  const matches = []
  for (const file of files) await scanFile(file, patterns, matches)
  return { files, matches }
}

async function readLiterals(file) {
  const source = await readFile(path.resolve(file), 'utf8')
  return source.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
}

async function collectFiles(target, files) {
  const metadata = await lstat(target)
  if (metadata.isSymbolicLink()) throw new Error(`拒绝扫描符号链接: ${target}`)
  if (metadata.isFile()) {
    files.push(target)
    return
  }
  if (!metadata.isDirectory()) throw new Error(`不支持的扫描路径: ${target}`)
  const entries = await readdir(target, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) throw new Error(`拒绝扫描符号链接: ${path.join(target, entry.name)}`)
    await collectFiles(path.join(target, entry.name), files)
  }
}

async function scanFile(file, patterns, matches) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  let lineNumber = 0
  for await (const line of lines) {
    lineNumber += 1
    for (const [name, matcher] of patterns) {
      const matched = typeof matcher === 'string' ? line.includes(matcher) : matcher.test(line)
      if (matched) matches.push({ file, line: lineNumber, pattern: name })
    }
  }
}

function parseArguments(argumentsList) {
  const inputs = []
  let literalFile
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument === '--literal-file') {
      literalFile = argumentsList[index + 1]
      if (!literalFile) throw new Error('--literal-file 缺少路径')
      index += 1
    } else if (argument === '--help') {
      return { help: true, inputs: [] }
    } else if (argument.startsWith('-')) {
      throw new Error(`未知参数: ${argument}`)
    } else {
      inputs.push(argument)
    }
  }
  return { help: false, inputs, literalFile }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write('Usage: node scripts/scan-sensitive-logs.mjs [--literal-file FILE] LOG...\n')
    return
  }
  const result = await scanLogs(options)
  if (result.matches.length > 0) {
    const diagnosticLimit = 50
    for (const match of result.matches.slice(0, diagnosticLimit)) {
      process.stderr.write(`${match.file}:${match.line} pattern=${match.pattern}\n`)
    }
    if (result.matches.length > diagnosticLimit) {
      process.stderr.write(`... 省略 ${result.matches.length - diagnosticLimit} 个后续命中\n`)
    }
    throw new Error(`日志秘密扫描失败: ${result.matches.length} 个命中`)
  }
  process.stdout.write(`日志秘密扫描通过: ${result.files.length} 个文件，0 命中\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
