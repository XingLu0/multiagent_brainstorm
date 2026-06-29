import { streamText } from "ai";
import type { LanguageModel } from "ai";
import { PRD_SYSTEM_PROMPT, buildPRDUserPrompt } from "./prompts/prd";
import { SPEC_SYSTEM_PROMPT, buildSPECUserPrompt } from "./prompts/spec";
import { USER_STORY_SYSTEM_PROMPT, buildUserStoryUserPrompt } from "./prompts/user-story";
import { TECH_PLAN_SYSTEM_PROMPT, buildTechPlanUserPrompt } from "./prompts/tech-plan";
import { MARKET_ANALYSIS_SYSTEM_PROMPT, buildMarketAnalysisUserPrompt } from "./prompts/market-analysis";
import { ACTION_PLAN_SYSTEM_PROMPT, buildActionPlanUserPrompt } from "./prompts/action-plan";
import { consumeStreamWithRetry, getModelId } from "./host-agent";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";
import type { DocumentType } from "./doc-types";

// Re-export 客户端安全的类型和常量，保持向后兼容
export { type DocumentType, DOC_TYPE_LABELS, VALID_DOC_TYPES } from "./doc-types";

/** 文档类型 -> 系统提示词与用户提示词构建器映射 */
const DOC_PROMPTS: Record<
  DocumentType,
  { system: string; user: (content: string) => string }
> = {
  prd: { system: PRD_SYSTEM_PROMPT, user: buildPRDUserPrompt },
  spec: { system: SPEC_SYSTEM_PROMPT, user: buildSPECUserPrompt },
  "user-story": {
    system: USER_STORY_SYSTEM_PROMPT,
    user: buildUserStoryUserPrompt,
  },
  "tech-plan": { system: TECH_PLAN_SYSTEM_PROMPT, user: buildTechPlanUserPrompt },
  "market-analysis": {
    system: MARKET_ANALYSIS_SYSTEM_PROMPT,
    user: buildMarketAnalysisUserPrompt,
  },
  "action-plan": {
    system: ACTION_PLAN_SYSTEM_PROMPT,
    user: buildActionPlanUserPrompt,
  },
};

export class DocumentAgent {
  constructor(
    private model: LanguageModel,
    private llmConfig: { maxTokens: number; temperature: number }
  ) {}

  /**
   * 根据粘贴的纪要文本生成文档草稿
   * 支持的文档类型见 DocumentType，流式输出文档内容
   */
  async generate(
    docType: DocumentType,
    content: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal,
    projectId?: string
  ): Promise<string> {
    const { system: systemPrompt, user: buildUserPrompt } = DOC_PROMPTS[docType];
    const userPrompt = buildUserPrompt(content);

    return consumeStreamWithRetry(() => streamText({
      model: this.model,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: this.llmConfig.maxTokens * 2,
      temperature: this.llmConfig.temperature,
      abortSignal,
      ...DEFAULT_CALL_SETTINGS,
      onError({ error }) {
        console.error("[LLM Error - DocumentAgent.generate]", error);
      },
      onAbort() {
        console.log("[DocumentAgent.generate aborted]");
      },
    }), onChunk, undefined, undefined, { model: getModelId(this.model), projectId });
  }
}
