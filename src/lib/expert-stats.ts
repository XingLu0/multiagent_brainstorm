/**
 * P3-5: 专家画像统计计算
 *
 * 纯函数，不依赖 Prisma，可独立测试。
 */

/** 专家统计数据 */
export interface ExpertStats {
  expertId: string;
  expertName: string;
  totalProjects: number;
  totalMessages: number;
  consensusContributionRate: number;
  mostDiscussedTopics: Array<{ topic: string; count: number }>;
  averageMessagesPerProject: number;
  projectBreakdown: Array<{
    projectId: string;
    projectTitle: string;
    messageCount: number;
    consensusCount: number;
    divergenceCount: number;
  }>;
}

/** 输入数据：专家消息列表 */
export interface ExpertMessageInput {
  projectId: string;
  content: string;
}

/** 输入数据：知识条目统计 */
export interface KnowledgeCountInput {
  projectId: string;
  category: string;
  count: number;
}

/** 输入数据：项目信息 */
export interface ProjectInput {
  id: string;
  title: string;
}

/** 中文停用词 */
const STOP_WORDS = new Set([
  "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一",
  "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没",
  "看", "好", "自己", "这", "那", "它", "他", "她", "们",
]);

/**
 * 计算专家统计数据
 *
 * @param expertId 专家 ID
 * @param expertName 专家名称
 * @param messages 专家消息列表
 * @param knowledgeCounts 知识条目统计（按项目+类别分组）
 * @param projects 项目信息列表
 * @returns 专家统计数据
 */
export function computeExpertStats(
  expertId: string,
  expertName: string,
  messages: ExpertMessageInput[],
  knowledgeCounts: KnowledgeCountInput[],
  projects: ProjectInput[]
): ExpertStats {
  const totalMessages = messages.length;
  const projectIds = [...new Set(messages.map((m) => m.projectId))];
  const totalProjects = projectIds.length;

  // 计算共识贡献率
  const totalConsensus = knowledgeCounts
    .filter((k) => k.category === "consensus")
    .reduce((sum, k) => sum + k.count, 0);
  const consensusContributionRate = totalProjects > 0 ? totalConsensus / totalProjects : 0;

  // 平均每项目消息数
  const averageMessagesPerProject = totalProjects > 0 ? totalMessages / totalProjects : 0;

  // 提取高频话题（2-3字滑窗）
  const allContent = messages.map((m) => m.content).join("");
  const wordCount = new Map<string, number>();
  for (let len = 2; len <= 3; len++) {
    for (let i = 0; i <= allContent.length - len; i++) {
      const word = allContent.slice(i, i + len).trim();
      if (word.length < 2) continue;
      if (STOP_WORDS.has(word)) continue;
      if (/[\s\n\r\t，。！？、；：""''（）【】《》\-,.!?;:()]/.test(word)) continue;
      wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
    }
  }
  const mostDiscussedTopics = Array.from(wordCount.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 项目明细
  const projectBreakdown = projectIds.map((pid) => {
    const project = projects.find((p) => p.id === pid);
    return {
      projectId: pid,
      projectTitle: project?.title ?? "未知项目",
      messageCount: messages.filter((m) => m.projectId === pid).length,
      consensusCount: knowledgeCounts
        .filter((k) => k.projectId === pid && k.category === "consensus")
        .reduce((s, k) => s + k.count, 0),
      divergenceCount: knowledgeCounts
        .filter((k) => k.projectId === pid && k.category === "divergence")
        .reduce((s, k) => s + k.count, 0),
    };
  });

  return {
    expertId,
    expertName,
    totalProjects,
    totalMessages,
    consensusContributionRate,
    mostDiscussedTopics,
    averageMessagesPerProject,
    projectBreakdown,
  };
}
