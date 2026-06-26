import { tool } from "ai";
import { z } from "zod";

/**
 * 使用 Tavily API 搜索互联网（专为 AI Agent 设计）
 * 免费额度 1000 次/月，返回干净 JSON
 */
async function searchTavily(
  query: string,
  apiKey: string
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      answer?: string;
      results?: Array<{
        title: string;
        url: string;
        content: string;
        score?: number;
      }>;
    };

    const parts: string[] = [];

    if (data.answer) {
      parts.push(`摘要：${data.answer}`);
    }

    if (data.results && data.results.length > 0) {
      for (const r of data.results.slice(0, 5)) {
        parts.push(`${r.title}\n${r.content}\n链接：${r.url}`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

/**
 * 使用 DuckDuckGo Instant Answer API 搜索（免费，无需 API Key）
 */
async function searchDuckDuckGoInstant(
  query: string
): Promise<string | null> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query
    )}&format=json&nohtml=1&skip_disambig=1`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      Abstract?: string;
      AbstractText?: string;
      Heading?: string;
      Answer?: string;
      Definition?: string;
      RelatedTopics?: Array<{
        Text?: string;
        FirstURL?: string;
      }>;
    };

    const parts: string[] = [];
    if (data.Answer) parts.push(`答案：${data.Answer}`);
    if (data.AbstractText || data.Abstract) {
      parts.push(
        `${data.Heading ?? ""}\n${data.AbstractText || data.Abstract}`
      );
    }
    if (data.RelatedTopics?.length) {
      for (const t of data.RelatedTopics.slice(0, 5)) {
        if (t.Text) parts.push(t.Text);
      }
    }
    return parts.length > 0 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

/**
 * 使用 DuckDuckGo Lite HTML 抓取搜索（免费，无需 API Key）
 * 当 Instant Answer API 无结果时使用
 * 增强容错：解析失败返回 null 而非崩溃，支持 uddg 重定向解码和备选正则
 */
async function searchDuckDuckGoLite(
  query: string
): Promise<string | null> {
  try {
    const response = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(query)}&kl=wt-wt`,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const html = await response.text();

    const results: string[] = [];
    const links: Array<{ url: string; title: string }> = [];

    // 主正则：匹配 DDG Lite 的 result-link 结构
    const linkRegex =
      /class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)</g;
    // 备选正则：宽松匹配任意 <a> 链接（主正则无匹配时回退）
    const fallbackLinkRegex =
      /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([^<]*)<\/a>/g;

    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) && links.length < 5) {
      let url = match[1];
      // 解码 DDG 重定向 URL (uddg 参数)
      try {
        if (url.includes("uddg=")) {
          const uddg = new URL(url).searchParams.get("uddg");
          if (uddg) url = decodeURIComponent(uddg);
        }
      } catch {
        // URL 解析失败，保留原始 URL
      }
      links.push({ url, title: match[2].trim() });
    }

    // 主正则无匹配时使用备选正则
    if (links.length === 0) {
      while ((match = fallbackLinkRegex.exec(html)) && links.length < 5) {
        const url = match[1];
        // 跳过 DDG 内部链接
        if (url.includes("duckduckgo.com")) continue;
        links.push({ url, title: match[2].trim() });
      }
    }

    // 提取摘要
    const snippets: string[] = [];
    const snippetRegex =
      /class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
    while ((match = snippetRegex.exec(html)) && snippets.length < 5) {
      snippets.push(match[1].replace(/<[^>]*>/g, "").trim());
    }

    for (let i = 0; i < Math.min(links.length, snippets.length); i++) {
      results.push(
        `${links[i].title}\n${snippets[i]}\n链接：${links[i].url}`
      );
    }
    return results.length > 0 ? results.join("\n\n") : null;
  } catch {
    return null;
  }
}

/**
 * 使用 Wikipedia API 搜索（免费回退，无需 API Key）
 */
async function searchWikipedia(query: string): Promise<string | null> {
  try {
    const url =
      `https://zh.wikipedia.org/w/api.php?action=query` +
      `&generator=search&gsrsearch=${encodeURIComponent(query)}` +
      `&gsrlimit=5&prop=extracts&exintro=1&explaintext=1` +
      `&exsentences=2&format=json&origin=*`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      query?: {
        pages?: Record<
          string,
          { title: string; extract?: string; index: number }
        >;
      };
    };
    if (!data.query?.pages) return null;

    const pages = Object.values(data.query.pages);
    pages.sort((a, b) => a.index - b.index);

    const results = pages.slice(0, 5).map((p) => {
      const wikiUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(
        p.title.replace(/ /g, "_")
      )}`;
      return `${p.title}\n${p.extract ?? "无摘要"}\n链接：${wikiUrl}`;
    });

    return results.length > 0 ? results.join("\n\n") : null;
  } catch {
    return null;
  }
}

/**
 * 将返回 null 的搜索转为 reject，用于 Promise.any 跳过无结果的源
 */
async function searchOrNullToReject(
  searchFn: () => Promise<string | null>
): Promise<string> {
  const result = await searchFn();
  if (result === null) throw new Error("搜索无结果");
  return result;
}

/**
 * 对单个关键词执行多源并行搜索（工具层并行）
 * Tavily + DDG Instant + Wikipedia 三路竞速，DDG Lite 作为最终回退
 */
async function searchSingleQuery(
  query: string,
  searchApiKey: string
): Promise<{ results: string; source: string }> {
  const parallelTasks: Promise<string>[] = [];

  if (searchApiKey) {
    parallelTasks.push(searchOrNullToReject(() => searchTavily(query, searchApiKey)));
  }
  parallelTasks.push(searchOrNullToReject(() => searchDuckDuckGoInstant(query)));
  parallelTasks.push(searchOrNullToReject(() => searchWikipedia(query)));

  try {
    const winner = await Promise.any(parallelTasks);
    return { results: winner, source: "parallel" };
  } catch {
    // 所有并行源失败，DDG Lite 最终回退
    const ddgLite = await searchDuckDuckGoLite(query);
    if (ddgLite) return { results: ddgLite, source: "DuckDuckGo" };
    return { results: "未找到相关搜索结果。", source: "none" };
  }
}

/**
 * 创建引擎工具集：getCurrentTime + webSearch
 * 工厂函数模式，支持动态注入搜索 API Key
 */
export function createEngineTools(config: { searchApiKey?: string }) {
  const searchApiKey = config.searchApiKey || "";

  return {
    getCurrentTime: tool({
      description:
        "获取当前日期和时间。当需要知道今天是几月几号、星期几、当前时间时使用此工具。",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        const timeZone = "Asia/Hong_Kong";
        const dateStr = now.toLocaleDateString("zh-CN", {
          timeZone,
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        });
        const timeStr = now.toLocaleTimeString("zh-CN", {
          timeZone,
          hour: "2-digit",
          minute: "2-digit",
        });
        return { date: dateStr, time: timeStr, iso: now.toISOString() };
      },
    }),

    webSearch: tool({
      description:
        "搜索互联网获取最新信息。支持同时搜索多个关键词以覆盖问题的不同方面。" +
        "传入 queries 数组将并行搜索所有关键词，大幅提高效率。" +
        "例如：需要评估某技术方案时，可传入 ['方案A 优缺点', '方案B 优缺点', '方案A vs 方案B']。",
      inputSchema: z.object({
        queries: z.array(z.string()).min(1).max(5)
          .describe("搜索关键词数组。单关键词传 ['keyword']；多维度搜索传多个关键词将并行搜索。"),
      }),
      execute: async ({ queries }) => {
        // 查询层并行：多个关键词同时搜索
        const allResults = await Promise.all(
          queries.map(async (query) => {
            const { results, source } = await searchSingleQuery(query, searchApiKey);
            return { query, results, source };
          })
        );

        // 格式化结果：每个关键词的结果用分隔线隔开
        const formatted = allResults
          .map((r) => `=== 搜索：${r.query} ===\n${r.results}`)
          .join("\n\n---\n\n");

        return { results: formatted, queries };
      },
    }),
  };
}
