/**
 * [INPUT]: 脱敏后的 Notion-shaped MCP 工具名称、显示名与自然语言描述；不含 URL、ID、token 或用户信息。
 * [OUTPUT]: 为 MCP 词法召回回归提供固定目录与相关性标注。
 * [POS]: bundle 搜索 golden fixture；只描述目录事实，不承担连接、授权或执行逻辑。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export type GoldenTool = {
  serverName: string
  displayName: string
  publicName: string
  description: string
}

export const notionGoldenFixture: GoldenTool[] = [
  { serverName: 'notion', displayName: 'Notion', publicName: 'create-database', description: 'Create a database in a workspace and configure its properties.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'fetch', description: 'Fetch workspace information, the current workspace name, a page, or a database by ID；查询当前工作区名称。' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'get-users', description: 'List users and workspace members for the current workspace；列出当前工作区用户。' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'create-page', description: 'Create a page in a workspace or in a database.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'update-page', description: 'Update page properties and content in a workspace.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'query-data-source', description: 'Query rows from a data source or database.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'retrieve-a-block', description: 'Retrieve a block and its content from a workspace page.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'append-block-children', description: 'Append block children to a page in a workspace.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'search', description: 'Search pages and data sources in a workspace.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'list-databases', description: 'List databases available in a workspace.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'utility-alpha', description: 'Maintenance helper.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'utility-bravo', description: 'Maintenance helper.' },
  { serverName: 'notion', displayName: 'Notion', publicName: 'utility-charlie', description: 'Maintenance helper.' },
  { serverName: 'slack', displayName: 'Slack', publicName: 'fetch', description: 'Fetch a conversation from Slack.' },
]

export const goldenRelevance = {
  workspaceInfo: new Set([
    'mcp__notion__fetch', 'mcp__notion__create-page',
    'mcp__notion__update-page', 'mcp__notion__retrieve-a-block', 'mcp__notion__append-block-children',
    'mcp__notion__list-databases', 'mcp__notion__search', 'mcp__notion__create-database',
  ]),
  chineseWorkspaceInfo: new Set(['mcp__notion__fetch', 'mcp__notion__get-users']),
} as const
