/**
 * [INPUT]: 依赖文件内声明的 Beautiful UI 组件元数据或 class 合并能力。
 * [OUTPUT]: 对外提供 meta 模块的注册表、元数据或工具导出。
 * [POS]: lib 的上游组件目录支撑层，仅服务 components 与 examples；源自 Beautiful UI 3ea4c181。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export type Meta = {
  id: string;
  title: string;
  caption: string;
  file: string;
  variants?: string[];
  /** other files in this repo the component imports (ids in INTERNAL) — copy these too */
  deps?: string[];
  /** npm packages the component imports — install these */
  npm?: string[];
};

/** Shared building blocks that primitives import but that don't get their own
 * gallery card. Copy these alongside any component that lists them in `deps`. */
export const INTERNAL: Record<string, { title: string; path: string }> = {
  button: { title: "Button", path: "components/atoms/Button.tsx" },
  "glide-menu": { title: "GlideMenu", path: "components/primitives/GlideMenu.tsx" },
  "entity-chip": { title: "EntityChip", path: "components/atoms/EntityChip.tsx" },
  "value-pill": { title: "ValuePill", path: "components/atoms/ValuePill.tsx" },
  shimmer: { title: "Shimmer", path: "components/atoms/Shimmer.tsx" },
  "stream-text": { title: "StreamText", path: "components/atoms/StreamText.tsx" },
};

export const META: Meta[] = [
  {
    id: "loading-state",
    title: "Loading State",
    caption: "Pixel-grid loader with shimmer and elapsed time.",
    file: "LoadingState.tsx",
    variants: ["Drive", "Dots", "Orbit", "Surfer"],
  },
  {
    id: "thinking-state",
    title: "Thinking",
    caption: "Expandable traces — steps, reasoning, search, coding.",
    file: "ThinkingState.tsx",
    variants: ["Steps", "Reasoning", "Search", "Coding"],
  },
  {
    id: "streaming-text",
    title: "Streaming Text",
    caption: "Streamed answer with inline sources, actions, and follow-ups.",
    file: "StreamingText.tsx",
  },
  {
    id: "approval-card",
    title: "Approval Card",
    caption: "Human-in-the-loop questions the agent asks before acting.",
    file: "ApprovalCard.tsx",
    deps: ["button", "glide-menu"],
  },
  {
    id: "tool-chips",
    title: "Tool Chips",
    caption: "Code edits and tool calls as compact chips.",
    file: "ToolChips.tsx",
  },
  {
    id: "task-rows",
    title: "Task Rows",
    caption: "Live agent task status — running, failed, completed.",
    file: "TaskRows.tsx",
    variants: ["Capsules", "List"],
  },
  {
    id: "chat-composer",
    title: "Chat",
    caption: "Tabbed chat panel with reasoning replies and a composer.",
    file: "ChatComposer.tsx",
  },
  {
    id: "prompt-bar",
    title: "Prompt Bar",
    caption: "Composer with @ sources, / commands, model picker, and dictation.",
    file: "PromptBar.tsx",
    npm: ["glimm"],
    variants: ["Rounded", "Pill"],
  },
  {
    id: "recommendation-card",
    title: "Recommendation Card",
    caption: "Agent suggestion with a confidence meter and actions.",
    file: "RecommendationCard.tsx",
    deps: ["button", "entity-chip", "value-pill"],
  },
  {
    id: "context-cards",
    title: "Context Cards",
    caption: "Retrieved knowledge chunks with their sources.",
    file: "ContextCards.tsx",
  },
  {
    id: "diff-table",
    title: "Diff Table",
    caption: "AI-proposed edits sweeping through tabular data.",
    file: "DiffTable.tsx",
    deps: ["button"],
  },
  {
    id: "records-table",
    title: "Records Table",
    caption: "CRM-style grid with tags, sorting, and relationship status.",
    file: "RecordsTable.tsx",
    deps: ["glide-menu"],
  },
  {
    id: "filter-table",
    title: "Filter Table",
    caption: "Status chips that reorganize live data.",
    file: "FilterTable.tsx",
  },
  {
    id: "sidebar-nav",
    title: "Sidebar Nav",
    caption: "Collapsible workspace and chat navigation with gliding hover states.",
    file: "SidebarNav.tsx",
    deps: ["glide-menu"],
    npm: ["lucide-react"],
  },
  {
    id: "search",
    title: "Search",
    caption: "Command search with live filtering and an empty state.",
    file: "SearchList.tsx",
    deps: ["glide-menu"],
  },
  {
    id: "flowchart",
    title: "Flowchart",
    caption: "Workflow trigger and condition steps on a dotted canvas.",
    file: "Flowchart.tsx",
  },
  {
    id: "insight-cards",
    title: "Insight Cards",
    caption: "Paged agent insights with scrub-ready live charts.",
    file: "InsightCards.tsx",
    npm: ["liveline"],
  },
  {
    id: "code-block",
    title: "Code Block",
    caption: "A line-numbered listing and a unified diff.",
    file: "CodeBlock.tsx",
    variants: ["Code", "Diff"],
  },
  {
    id: "fine-tune-card",
    title: "Fine-tune Card",
    caption: "The agent adjusts design properties in an inspector.",
    file: "FineTuneCard.tsx",
    deps: ["glide-menu"],
  },
  {
    id: "selection-actions",
    title: "Selection Actions",
    caption: "Highlight a passage and hand it to the agent to rewrite.",
    file: "SelectionActions.tsx",
    deps: ["button", "shimmer", "stream-text"],
    npm: ["iconoir-react"],
  },
];
