/**
 * P3-5: 专家画像统计单元测试
 */

import { describe, it, expect } from "vitest";
import { computeExpertStats } from "@/lib/expert-stats";

describe("expert-stats: computeExpertStats", () => {
  it("TU-P3-5-01: totalProjects 正确", () => {
    const messages = [
      { projectId: "p1", content: "消息1" },
      { projectId: "p2", content: "消息2" },
      { projectId: "p3", content: "消息3" },
    ];

    const result = computeExpertStats("pm", "产品经理", messages, [], [
      { id: "p1", title: "项目1" },
      { id: "p2", title: "项目2" },
      { id: "p3", title: "项目3" },
    ]);

    expect(result.totalProjects).toBe(3);
  });

  it("TU-P3-5-02: totalMessages 正确", () => {
    const messages = [
      { projectId: "p1", content: "消息1" },
      { projectId: "p1", content: "消息2" },
      { projectId: "p2", content: "消息3" },
      { projectId: "p2", content: "消息4" },
      { projectId: "p3", content: "消息5" },
    ];

    const result = computeExpertStats("pm", "产品经理", messages, [], []);

    expect(result.totalMessages).toBe(5);
  });

  it("TU-P3-5-03: consensusContributionRate 计算", () => {
    const messages = [
      { projectId: "p1", content: "消息1" },
      { projectId: "p2", content: "消息2" },
      { projectId: "p3", content: "消息3" },
    ];
    const knowledgeCounts = [
      { projectId: "p1", category: "consensus", count: 3 },
      { projectId: "p2", category: "consensus", count: 4 },
      { projectId: "p3", category: "consensus", count: 3 },
      { projectId: "p1", category: "divergence", count: 2 },
    ];

    const result = computeExpertStats("pm", "产品经理", messages, knowledgeCounts, []);

    // 总共识 = 10, 项目数 = 3, rate = 10/3
    expect(result.consensusContributionRate).toBeCloseTo(10 / 3, 2);
  });

  it("TU-P3-5-04: averageMessagesPerProject 计算", () => {
    const messages = [
      { projectId: "p1", content: "消息1" },
      { projectId: "p1", content: "消息2" },
      { projectId: "p1", content: "消息3" },
      { projectId: "p2", content: "消息4" },
      { projectId: "p2", content: "消息5" },
    ];

    const result = computeExpertStats("pm", "产品经理", messages, [], []);

    // 5消息 / 2项目 = 2.5
    expect(result.averageMessagesPerProject).toBe(2.5);
  });

  it("TU-P3-5-05: mostDiscussedTopics 提取", () => {
    const messages = [
      { projectId: "p1", content: "微服务架构好 微服务架构棒" },
      { projectId: "p1", content: "架构设计很重要" },
    ];

    const result = computeExpertStats("pm", "产品经理", messages, [], []);

    expect(result.mostDiscussedTopics.length).toBeGreaterThan(0);
    // "架构" 应该出现3次，排在最前面
    const architecture = result.mostDiscussedTopics.find((t) => t.topic === "架构");
    expect(architecture).toBeDefined();
    expect(architecture!.count).toBeGreaterThanOrEqual(3);
  });

  it("TU-P3-5-06: projectBreakdown 明细正确", () => {
    const messages = [
      { projectId: "p1", content: "消息1" },
      { projectId: "p1", content: "消息2" },
      { projectId: "p2", content: "消息3" },
    ];
    const knowledgeCounts = [
      { projectId: "p1", category: "consensus", count: 2 },
      { projectId: "p1", category: "divergence", count: 1 },
      { projectId: "p2", category: "consensus", count: 3 },
    ];
    const projects = [
      { id: "p1", title: "项目A" },
      { id: "p2", title: "项目B" },
    ];

    const result = computeExpertStats("pm", "产品经理", messages, knowledgeCounts, projects);

    expect(result.projectBreakdown).toHaveLength(2);
    const p1 = result.projectBreakdown.find((p) => p.projectId === "p1");
    expect(p1).toBeDefined();
    expect(p1!.projectTitle).toBe("项目A");
    expect(p1!.messageCount).toBe(2);
    expect(p1!.consensusCount).toBe(2);
    expect(p1!.divergenceCount).toBe(1);

    const p2 = result.projectBreakdown.find((p) => p.projectId === "p2");
    expect(p2).toBeDefined();
    expect(p2!.messageCount).toBe(1);
    expect(p2!.consensusCount).toBe(3);
    expect(p2!.divergenceCount).toBe(0);
  });

  it("TU-P3-5-07: 专家不存在时返回零值", () => {
    // 无消息时应返回零值统计
    const result = computeExpertStats("nonexistent", "不存在", [], [], []);

    expect(result.totalProjects).toBe(0);
    expect(result.totalMessages).toBe(0);
    expect(result.consensusContributionRate).toBe(0);
    expect(result.averageMessagesPerProject).toBe(0);
    expect(result.mostDiscussedTopics).toEqual([]);
    expect(result.projectBreakdown).toEqual([]);
  });

  it("TU-P3-5-08: 无消息时零值统计", () => {
    const result = computeExpertStats("pm", "产品经理", [], [], []);

    expect(result.totalProjects).toBe(0);
    expect(result.totalMessages).toBe(0);
    expect(result.consensusContributionRate).toBe(0);
    expect(result.averageMessagesPerProject).toBe(0);
  });
});
