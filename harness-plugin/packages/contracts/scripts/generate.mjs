/**
 * [INPUT]: 依赖模块化 enterprise-openapi.yaml、Swagger Parser 与 @hey-api/openapi-ts/Zod 插件
 * [OUTPUT]: bundle/hash 完整逻辑协议并生成自包含 OpenAPI JSON、TypeScript DTO/Fetch/Zod、JSON Schema 与错误映射，或只读检查漂移
 * [POS]: contracts 的唯一生成入口，使 Harness、Java 和 CI 从同一逻辑协议真源得到可比较产物
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import SwaggerParser from '@apidevtools/swagger-parser'
import { createClient } from '@hey-api/openapi-ts'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '../..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const CONTRACT_ROOT = resolve(PROJECT_ROOT, 'contracts')
const OPENAPI_PATH = resolve(CONTRACT_ROOT, 'enterprise-openapi.yaml')
const TYPESCRIPT_OUTPUT = resolve(PACKAGE_ROOT, 'src/generated')
const JSON_SCHEMA_OUTPUT = resolve(CONTRACT_ROOT, 'generated')

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function fixturePath(file) {
  if (typeof file !== 'string' || !file.startsWith('fixtures/')) {
    throw new TypeError(`fixture path must stay below contracts/fixtures: ${String(file)}`)
  }
  const path = resolve(CONTRACT_ROOT, file)
  const fixturesRoot = resolve(CONTRACT_ROOT, 'fixtures')
  if (path !== fixturesRoot && !path.startsWith(`${fixturesRoot}${sep}`)) {
    throw new TypeError(`fixture path escapes contracts/fixtures: ${file}`)
  }
  return path
}

function protocolMetadata(openapi, source) {
  const statuses = openapi['x-enterprise-error-statuses']
  const fixtures = openapi['x-enterprise-fixtures']
  const schemas = openapi.components?.schemas
  if (typeof statuses !== 'object' || statuses === null || Array.isArray(statuses)) {
    throw new TypeError('x-enterprise-error-statuses must be an object')
  }
  if (!Array.isArray(fixtures) || typeof schemas !== 'object' || schemas === null) {
    throw new TypeError('OpenAPI fixtures or component schemas are missing')
  }

  const codeToStatus = {}
  for (const [statusText, codes] of Object.entries(statuses)) {
    const status = Number(statusText)
    if (!Number.isInteger(status) || !Array.isArray(codes)) {
      throw new TypeError(`invalid error status entry: ${statusText}`)
    }
    for (const code of codes) {
      if (typeof code !== 'string' || codeToStatus[code] !== undefined) {
        throw new TypeError(`invalid or duplicate error code: ${String(code)}`)
      }
      codeToStatus[code] = status
    }
  }

  const enumCodes = schemas.EnterpriseErrorCode?.enum
  if (!Array.isArray(enumCodes)
    || enumCodes.length !== Object.keys(codeToStatus).length
    || enumCodes.some(code => codeToStatus[code] === undefined)) {
    throw new TypeError('EnterpriseErrorCode enum and x-enterprise-error-statuses differ')
  }

  const normalizedFixtures = fixtures.map((fixture) => {
    if (typeof fixture !== 'object' || fixture === null
      || typeof fixture.file !== 'string'
      || typeof fixture.schema !== 'string'
      || typeof fixture.valid !== 'boolean'
      || schemas[fixture.schema] === undefined) {
      throw new TypeError(`invalid fixture declaration: ${JSON.stringify(fixture)}`)
    }
    fixturePath(fixture.file)
    return {
      file: fixture.file,
      schema: fixture.schema,
      valid: fixture.valid,
      zodExport: `z${fixture.schema}`,
    }
  })

  return {
    codeToStatus,
    fixtures: normalizedFixtures,
    sha256: createHash('sha256').update(source).digest('hex'),
  }
}

async function generateInto(typescriptOutput, jsonSchemaOutput) {
  const validated = await SwaggerParser.validate(OPENAPI_PATH)
  const bundled = await SwaggerParser.bundle(OPENAPI_PATH)
  const metadata = protocolMetadata(validated, stableJson(bundled))
  const dereferenced = await SwaggerParser.dereference(OPENAPI_PATH)

  await mkdir(jsonSchemaOutput, { recursive: true })
  await writeFile(resolve(jsonSchemaOutput, 'enterprise-openapi.json'), stableJson(dereferenced))

  await createClient({
    input: OPENAPI_PATH,
    output: typescriptOutput,
    plugins: [
      '@hey-api/typescript',
      '@hey-api/client-fetch',
      {
        name: 'zod',
        compatibilityVersion: 4,
        dates: { offset: true },
        $resolvers: {
          object(context) {
            const schema = context.nodes.base(context)
            const additionalProperties = context.schema.additionalProperties
            return (additionalProperties === false || additionalProperties?.type === 'never')
              ? schema.attr('strict').call()
              : schema
          },
        },
      },
    ],
  })

  const metaSource = `/**\n * [INPUT]: 由模块化 enterprise-openapi.yaml 的稳定错误映射和 bundle 内容生成\n * [OUTPUT]: 提供 enterpriseErrorStatuses 与 enterpriseProtocolSha256 常量\n * [POS]: contracts 的生成元数据，连接运行时错误解码、跨端 hash 和协议真源\n * [PROTOCOL]: 变更时更新生成器，然后检查 CLAUDE.md；禁止手工编辑\n */\n\nexport const enterpriseErrorStatuses = ${JSON.stringify(metadata.codeToStatus, null, 2)} as const\n\nexport const enterpriseProtocolSha256 = '${metadata.sha256}'\n`
  await writeFile(resolve(typescriptOutput, 'enterprise-meta.gen.ts'), metaSource)

  await mkdir(resolve(jsonSchemaOutput, 'schemas'), { recursive: true })
  const dereferencedSchemas = dereferenced.components?.schemas
  for (const schemaName of [...new Set(metadata.fixtures.map(fixture => fixture.schema))].sort()) {
    const schema = dereferencedSchemas?.[schemaName]
    if (schema === undefined) throw new TypeError(`dereferenced schema is missing: ${schemaName}`)
    await writeFile(resolve(jsonSchemaOutput, 'schemas', `${schemaName}.schema.json`), stableJson({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `urn:enterprise-agent:contracts:${schemaName}`,
      ...schema,
    }))
  }
  await writeFile(resolve(jsonSchemaOutput, 'fixtures-manifest.json'), stableJson({
    fixtures: metadata.fixtures,
    protocolSha256: metadata.sha256,
  }))
  await writeFile(resolve(jsonSchemaOutput, 'protocol-sha256.txt'), `${metadata.sha256}\n`)
}

async function readTree(root) {
  const files = new Map()
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) files.set(relative(root, path), await readFile(path, 'utf8'))
    }
  }
  return files
}

async function assertSameTree(expectedRoot, actualRoot, label) {
  const [expected, actual] = await Promise.all([readTree(expectedRoot), readTree(actualRoot)])
  const names = [...new Set([...expected.keys(), ...actual.keys()])].sort()
  const drift = names.filter(name => expected.get(name) !== actual.get(name))
  if (drift.length > 0) {
    throw new Error(`${label} generated output drifted:\n${drift.map(name => `- ${name}`).join('\n')}`)
  }
}

const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'enterprise-contracts-'))
const temporaryTypescript = resolve(temporaryRoot, 'typescript')
const temporaryJsonSchema = resolve(temporaryRoot, 'json-schema')
try {
  await generateInto(temporaryTypescript, temporaryJsonSchema)
  if (process.argv.includes('--check')) {
    await assertSameTree(temporaryTypescript, TYPESCRIPT_OUTPUT, 'TypeScript')
    await assertSameTree(temporaryJsonSchema, JSON_SCHEMA_OUTPUT, 'JSON Schema')
  } else {
    await rm(TYPESCRIPT_OUTPUT, { force: true, recursive: true })
    await rm(JSON_SCHEMA_OUTPUT, { force: true, recursive: true })
    await mkdir(dirname(TYPESCRIPT_OUTPUT), { recursive: true })
    await mkdir(dirname(JSON_SCHEMA_OUTPUT), { recursive: true })
    await cp(temporaryTypescript, TYPESCRIPT_OUTPUT, { recursive: true })
    await cp(temporaryJsonSchema, JSON_SCHEMA_OUTPUT, { recursive: true })
  }
} finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
