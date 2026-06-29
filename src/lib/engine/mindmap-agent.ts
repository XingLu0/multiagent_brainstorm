import { streamText, type LanguageModel } from "ai";
import { consumeStreamWithRetry, getModelId } from "./host-agent";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";

const MINDMAP_SYSTEM_PROMPT = `你是一个思维导图生成助手。将会议纪要转化为 Markdown 格式的思维导图。

格式要求：
- 使用 Markdown 标题和列表语法（# 根节点，## 一级分支，### 二级分支，- 列表项）
- 根节点为项目主题
- 一级分支为主要讨论方向，至少生成 5 个一级分支
- 每个一级分支下至少 2 个二级分支，充分覆盖纪要中的所有主要讨论点
- 在分歧节点后标注 [分歧]，在共识节点后标注 [共识]
- 保持简洁，每个节点不超过 20 字
- 不要输出任何解释性文字，只输出思维导图本身

示例：
# SSR vs CSR 技术选型
## 性能
### 首屏加载 [共识]
### SEO 优势 [共识]
## 开发成本
### 学习曲线 [分歧]
### 维护复杂度 [分歧]`;

export class MindmapAgent {
  constructor(private model: LanguageModel) {}

  async generateMindmap(
    content: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal,
    projectId?: string
  ): Promise<string> {
    return consumeStreamWithRetry(() => streamText({
      model: this.model,
      system: MINDMAP_SYSTEM_PROMPT,
      prompt: `以下是会议纪要，请生成思维导图：\n\n${content}`,
      maxOutputTokens: 3072,
      temperature: 0.3,
      abortSignal,
      ...DEFAULT_CALL_SETTINGS,
      onError({ error }) {
        console.error("[LLM Error - MindmapAgent.generateMindmap]", error);
      },
    }), onChunk, undefined, undefined, { model: getModelId(this.model), projectId });
  }
}
