/**
 * [INPUT]: 依赖文件内声明的 Beautiful UI 组件元数据或 class 合并能力。
 * [OUTPUT]: 对外提供 registry 模块的注册表、元数据或工具导出。
 * [POS]: lib 的上游组件目录支撑层，仅服务 components 与 examples；源自 Beautiful UI 3ea4c181。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

"use client";

import type { ComponentType } from "react";
import { META, type Meta } from "./meta";
import LoadingState from "@/components/primitives/LoadingState";
import ThinkingState from "@/components/primitives/ThinkingState";
import StreamingText from "@/components/primitives/StreamingText";
import ChatComposer from "@/components/primitives/ChatComposer";
import PromptBar from "@/components/primitives/PromptBar";
import ApprovalCard from "@/components/primitives/ApprovalCard";
import TaskRows from "@/components/primitives/TaskRows";
import RecommendationCard from "@/components/primitives/RecommendationCard";
import ContextCards from "@/components/primitives/ContextCards";
import DiffTable from "@/components/primitives/DiffTable";
import FineTuneCard from "@/components/primitives/FineTuneCard";
import FilterTable from "@/components/primitives/FilterTable";
import RecordsTable from "@/components/primitives/RecordsTable";
import SidebarNav from "@/components/primitives/SidebarNav";
import Flowchart from "@/components/primitives/Flowchart";
import InsightCards from "@/components/primitives/InsightCards";
import CodeBlock from "@/components/primitives/CodeBlock";
import ToolChips from "@/components/primitives/ToolChips";
import SearchList from "@/components/primitives/SearchList";
import SelectionActions from "@/components/primitives/SelectionActions";

export type Entry = Meta & { Demo: ComponentType<{ variant?: string }> };

const DEMOS: Record<string, ComponentType<{ variant?: string }>> = {
  "loading-state": LoadingState,
  "thinking-state": ThinkingState,
  "streaming-text": StreamingText,
  "chat-composer": ChatComposer,
  "prompt-bar": PromptBar,
  "approval-card": ApprovalCard,
  "task-rows": TaskRows,
  "recommendation-card": RecommendationCard,
  "context-cards": ContextCards,
  "diff-table": DiffTable,
  "fine-tune-card": FineTuneCard,
  "filter-table": FilterTable,
  "records-table": RecordsTable,
  "sidebar-nav": SidebarNav,
  "flowchart": Flowchart,
  "insight-cards": InsightCards,
  "code-block": CodeBlock,
  "tool-chips": ToolChips,
  "search": SearchList,
  "selection-actions": SelectionActions,
};

export const REGISTRY: Entry[] = META.map((m) => ({ ...m, Demo: DEMOS[m.id] }));
