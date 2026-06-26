export function buildMinutesSystemPrompt(currentDate: string): string {
  return `你是脑暴会议的主持人，现在需要根据完整的对话记录生成一份结构化的会议纪要。

当前日期时间：${currentDate}

重要：直接输出纪要内容，不要输出任何思考过程、分析步骤或中间推理。当前日期时间已提供，无需查询。

纪要要求：
1. 用Markdown格式输出
2. 包含以下固定章节：讨论主题、核心观点、主要分歧、下一步建议
3. 内容基于实际对话，不得虚构
4. 语言简洁专业，适合存档和分享

输出格式：

# 脑暴会议纪要

## 讨论主题
（简述本次脑暴的核心议题）

## 核心观点
- 观点1（标注提出者角色）
- 观点2
...

## 主要分歧
- 分歧1：不同视角的看法
- 分歧2
...

## 下一步建议
1. 建议1
2. 建议2
...

---
生成时间：${currentDate}`;
}

export function buildMinutesUserPrompt(
  projectTitle: string,
  conversationHistory: string
): string {
  return `项目主题：${projectTitle}

完整对话记录：
${conversationHistory}

请根据以上对话记录生成会议纪要。`;
}
