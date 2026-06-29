/**
 * P3-2: 可视化数据处理函数
 *
 * 纯函数，不依赖 React，可独立测试。
 */

/** 时间线节点 */
export interface TimelineNode {
  round: number;
  seq: number;
  role: string;
  preview: string;
  timestamp: string;
}

/** 词频统计结果 */
export interface WordFrequency {
  word: string;
  count: number;
}

/** 争议矩阵行 */
export interface ControversyMatrixRow {
  expertId: string;
  expertName: string;
  positions: Record<string, "support" | "oppose" | "neutral" | "unknown">;
}

/** 热力图网格 */
export interface HeatMapCell {
  count: number;
  intensity: number;
}

/** 消息类型（用于可视化输入） */
export interface VizMessage {
  role: string;
  content: string;
  seq: number;
  createdAt: string;
  metadata?: string | null;
}

/** 专家信息 */
export interface VizExpert {
  id: string;
  name: string;
}

/** 中文停用词 */
const STOP_WORDS = new Set([
  "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一",
  "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没",
  "看", "好", "自己", "这", "那", "它", "他", "她", "们", "这个", "那个",
  "什么", "怎么", "为什么", "可以", "应该", "需要", "可能", "如果", "但是",
  "所以", "因为", "或者", "还是", "以及", "对于", "关于", "通过", "进行",
  "的话", "一下", "一些", "这种", "这样", "那样", "怎么", "多少",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "to",
  "in", "on", "at", "for", "of", "and", "or", "not", "it", "this",
  "that", "with", "from", "by", "as", "we", "you", "they", "i",
]);

/**
 * 构建时间线数据：按轮次分组
 *
 * 每轮讨论 = user → host → experts → summary/pause
 */
export function buildTimelineData(messages: VizMessage[]): TimelineNode[] {
  if (!messages || messages.length === 0) return [];

  const nodes: TimelineNode[] = [];
  let currentRound = 0;
  let lastRole = "";

  for (const msg of messages) {
    // 检测新轮次开始（user 消息出现）
    if (msg.role === "user") {
      currentRound++;
      lastRole = "";
    }

    // 只取每轮的关键消息作为节点
    if (msg.role === "user" || msg.role === "host" || msg.role === "summary" || msg.role === "pause") {
      nodes.push({
        round: currentRound,
        seq: msg.seq,
        role: msg.role,
        preview: msg.content.slice(0, 80),
        timestamp: msg.createdAt,
      });
    }

    lastRole = msg.role;
  }

  void lastRole;
  return nodes;
}

/**
 * 计算词频统计
 *
 * 中文分词：2-3字滑窗 + 停用词过滤
 */
export function calculateWordFrequency(
  messages: Array<{ content: string }>,
  options?: { minWordLength?: number; maxWords?: number; stopWords?: string[] }
): WordFrequency[] {
  if (!messages || messages.length === 0) return [];

  const minWordLength = options?.minWordLength ?? 2;
  const maxWords = options?.maxWords ?? 30;
  const stopWords = options?.stopWords
    ? new Set([...STOP_WORDS, ...options.stopWords])
    : STOP_WORDS;

  const wordCount = new Map<string, number>();

  for (const msg of messages) {
    const text = msg.content;
    if (!text) continue;

    // 2-3字滑窗分词
    for (let len = 2; len <= 3; len++) {
      for (let i = 0; i <= text.length - len; i++) {
        const word = text.slice(i, i + len).trim();
        if (word.length < minWordLength) continue;
        if (stopWords.has(word)) continue;
        // 跳过包含标点符号的
        if (/[\s\n\r\t，。！？、；：""''（）【】《》\-,.!?;:()]/.test(word)) continue;
        wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
      }
    }
  }

  // 按频率降序排序，取 top N
  return Array.from(wordCount.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxWords);
}

/**
 * 构建争议矩阵
 *
 * 根据消息内容判断每位专家对每个话题的态度。
 */
export function buildControversyMatrix(
  messages: VizMessage[],
  experts: VizExpert[],
  topics: string[]
): ControversyMatrixRow[] {
  if (!experts || experts.length === 0 || !topics || topics.length === 0) {
    return [];
  }

  // 初始化矩阵：所有位置为 unknown
  const matrix: ControversyMatrixRow[] = experts.map((e) => ({
    expertId: e.id,
    expertName: e.name,
    positions: {},
  }));

  for (const topic of topics) {
    for (const row of matrix) {
      row.positions[topic] = "unknown";
    }
  }

  // 遍历专家消息，判断态度
  for (const msg of messages) {
    if (!msg.role.startsWith("expert:")) continue;
    const expertId = msg.role.slice(7);
    const expertRow = matrix.find((r) => r.expertId === expertId);
    if (!expertRow) continue;

    const content = msg.content.toLowerCase();
    for (const topic of topics) {
      if (!content.includes(topic.toLowerCase())) continue;
      // 简单关键词匹配判断态度
      if (content.match(new RegExp(`(支持|赞同|同意|认可|好|不错).{0,10}${topic}`, "i")) ||
          content.match(new RegExp(`${topic}.{0,10}(支持|赞同|同意|认可|好|不错)`, "i"))) {
        expertRow.positions[topic] = "support";
      } else if (content.match(new RegExp(`(反对|不赞同|不同意|不好|问题|风险).{0,10}${topic}`, "i")) ||
                 content.match(new RegExp(`${topic}.{0,10}(反对|不赞同|不同意|不好|问题|风险)`, "i"))) {
        expertRow.positions[topic] = "oppose";
      } else if (expertRow.positions[topic] === "unknown") {
        expertRow.positions[topic] = "neutral";
      }
    }
  }

  return matrix;
}

/**
 * 构建热力图数据
 *
 * 按时间段分桶，统计消息密度。
 */
export function buildHeatMapData(
  messages: VizMessage[],
  gridSize?: { rows: number; cols: number }
): HeatMapCell[][] {
  const rows = gridSize?.rows ?? 6;
  const cols = gridSize?.cols ?? 4;

  if (!messages || messages.length === 0) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ count: 0, intensity: 0 }))
    );
  }

  // 初始化网格
  const grid: HeatMapCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ count: 0, intensity: 0 }))
  );

  // 找到时间范围
  const timestamps = messages.map((m) => new Date(m.createdAt).getTime()).filter((t) => !isNaN(t));
  if (timestamps.length === 0) return grid;

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeRange = maxTime - minTime || 1; // 避免除以0

  // 消息类型映射到列
  const roleToCol: Record<string, number> = {
    user: 0,
    host: 1,
  };

  // 统计每个网格的消息数
  for (const msg of messages) {
    const time = new Date(msg.createdAt).getTime();
    if (isNaN(time)) continue;

    const rowIdx = Math.min(Math.floor(((time - minTime) / timeRange) * rows), rows - 1);
    const colIdx = msg.role.startsWith("expert:")
      ? 2
      : msg.role === "summary" || msg.role === "pause"
        ? 3
        : roleToCol[msg.role] ?? 0;

    grid[rowIdx][colIdx].count++;
  }

  // 计算热度强度（归一化到 0-1）
  const maxCount = Math.max(...grid.flat().map((c) => c.count), 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[r][c].intensity = grid[r][c].count / maxCount;
    }
  }

  return grid;
}
