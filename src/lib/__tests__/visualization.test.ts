/**
 * P3-2: 可视化数据处理函数测试
 */

import { describe, it, expect } from "vitest";
import {
  buildTimelineData,
  calculateWordFrequency,
  buildControversyMatrix,
  buildHeatMapData,
} from "../visualization";

describe("visualization: buildTimelineData", () => {
  it("TU-P3-2-01: 按轮次分组生成时间线节点", () => {
    const messages = [
      { role: "user", content: "如何设计增长策略", seq: 1, createdAt: "2026-01-01T10:00:00Z" },
      { role: "host", content: "欢迎讨论", seq: 2, createdAt: "2026-01-01T10:00:30Z" },
      { role: "expert:pm", content: "我认为...", seq: 3, createdAt: "2026-01-01T10:01:00Z" },
      { role: "summary", content: "本轮总结", seq: 4, createdAt: "2026-01-01T10:02:00Z" },
      { role: "user", content: "下一个问题", seq: 5, createdAt: "2026-01-01T10:05:00Z" },
      { role: "host", content: "好的", seq: 6, createdAt: "2026-01-01T10:05:30Z" },
    ];

    const result = buildTimelineData(messages);

    // 应该有5个节点：2个user + 2个host + 1个summary
    expect(result).toHaveLength(5);
    expect(result[0].round).toBe(1);
    expect(result[0].role).toBe("user");
    expect(result[4].round).toBe(2);
  });

  it("TU-P3-2-02: 空消息返回空数组", () => {
    const result = buildTimelineData([]);
    expect(result).toEqual([]);
  });
});

describe("visualization: calculateWordFrequency", () => {
  it("TU-P3-2-03: 统计词频", () => {
    const messages = [
      { content: "微服务架构是好架构" },
      { content: "微服务架构棒" },
    ];

    const result = calculateWordFrequency(messages);

    // "微服务" 应该出现2次
    const microService = result.find((w) => w.word === "微服务");
    expect(microService).toBeDefined();
    expect(microService!.count).toBe(2);
  });

  it("TU-P3-2-04: 过滤停用词", () => {
    const messages = [
      { content: "的是在了" },
    ];

    const result = calculateWordFrequency(messages);

    // 停用词不应出现
    expect(result.find((w) => w.word === "的")).toBeUndefined();
    expect(result.find((w) => w.word === "是")).toBeUndefined();
    expect(result.find((w) => w.word === "在")).toBeUndefined();
    expect(result.find((w) => w.word === "了")).toBeUndefined();
  });
});

describe("visualization: buildControversyMatrix", () => {
  it("TU-P3-2-05: 构建专家×话题矩阵", () => {
    const messages = [
      { role: "expert:pm", content: "我支持微服务架构，它更灵活", seq: 1, createdAt: "2026-01-01T10:00:00Z" },
      { role: "expert:architect", content: "我反对微服务，太复杂了", seq: 2, createdAt: "2026-01-01T10:01:00Z" },
      { role: "expert:pm", content: "TypeScript 还不错", seq: 3, createdAt: "2026-01-01T10:02:00Z" },
      { role: "expert:architect", content: "TypeScript 有风险", seq: 4, createdAt: "2026-01-01T10:03:00Z" },
    ];
    const experts = [
      { id: "pm", name: "产品经理" },
      { id: "architect", name: "技术架构师" },
    ];
    const topics = ["微服务", "TypeScript"];

    const result = buildControversyMatrix(messages, experts, topics);

    expect(result).toHaveLength(2);
    expect(result[0].expertId).toBe("pm");
    expect(result[1].expertId).toBe("architect");
    expect(result[0].positions["微服务"]).toBe("support");
    expect(result[1].positions["微服务"]).toBe("oppose");
  });
});

describe("visualization: buildHeatMapData", () => {
  it("TU-P3-2-06: 计算热度强度在 0-1 范围", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 3 === 0 ? "user" : i % 3 === 1 ? "host" : "expert:pm",
      content: `消息${i}`,
      seq: i + 1,
      createdAt: new Date(2026, 0, 1, 10, i).toISOString(),
    }));

    const result = buildHeatMapData(messages);

    // 所有 intensity 应在 0-1 范围
    for (const row of result) {
      for (const cell of row) {
        expect(cell.intensity).toBeGreaterThanOrEqual(0);
        expect(cell.intensity).toBeLessThanOrEqual(1);
      }
    }

    // 至少有一个 cell 的 count > 0
    const hasData = result.flat().some((c) => c.count > 0);
    expect(hasData).toBe(true);
  });

  it("TU-P3-2-07: 空消息返回全0矩阵", () => {
    const result = buildHeatMapData([]);

    expect(result).toHaveLength(6); // 默认 6 行
    expect(result[0]).toHaveLength(4); // 默认 4 列
    for (const row of result) {
      for (const cell of row) {
        expect(cell.count).toBe(0);
        expect(cell.intensity).toBe(0);
      }
    }
  });
});
