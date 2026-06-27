/**
 * 文档类型定义（客户端安全，无服务端依赖）
 *
 * 此文件独立于 document-agent.ts，避免客户端组件传递性引入
 * better-sqlite3 / fs 等服务端模块。
 */

export type DocumentType =
  | "prd"
  | "spec"
  | "user-story"
  | "tech-plan"
  | "market-analysis"
  | "action-plan";

/** 文档类型 -> 中文标签映射（供前端使用） */
export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  prd: "PRD 产品需求文档",
  spec: "SPEC 技术规格说明",
  "user-story": "用户故事地图",
  "tech-plan": "技术方案",
  "market-analysis": "市场分析报告",
  "action-plan": "行动计划",
};

/** 合法文档类型列表（供 API 校验使用） */
export const VALID_DOC_TYPES: DocumentType[] = [
  "prd",
  "spec",
  "user-story",
  "tech-plan",
  "market-analysis",
  "action-plan",
];
