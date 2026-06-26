import { streamText } from "ai";
import type { LanguageModel } from "ai";
import { PRD_SYSTEM_PROMPT, buildPRDUserPrompt } from "./prompts/prd";
import { SPEC_SYSTEM_PROMPT, buildSPECUserPrompt } from "./prompts/spec";
import { consumeStream } from "./host-agent";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";

export type DocumentType = "prd" | "spec";

export class DocumentAgent {
  constructor(
    private model: LanguageModel,
    private llmConfig: { maxTokens: number; temperature: number }
  ) {}

  /**
   * 根据粘贴的纪要文本生成PRD或SPEC文档草稿
   * 流式输出文档内容
   */
  async generate(
    docType: DocumentType,
    content: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const systemPrompt =
      docType === "prd" ? PRD_SYSTEM_PROMPT : SPEC_SYSTEM_PROMPT;
    const userPrompt =
      docType === "prd"
        ? buildPRDUserPrompt(content)
        : buildSPECUserPrompt(content);

    const result = streamText({
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
    });

    return consumeStream(result, onChunk);
  }
}
