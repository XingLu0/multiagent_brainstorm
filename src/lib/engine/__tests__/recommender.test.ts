/**
 * P2-4: 智能推荐专家组合单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock experts definitions
vi.mock("@/lib/experts/definitions", () => ({
  getAllExperts: vi.fn().mockResolvedValue([
    { id: "pm", name: "产品经理", focus: "需求分析、用户研究", isBuiltin: true },
    { id: "architect", name: "技术架构师", focus: "系统设计、技术选型", isBuiltin: true },
    { id: "designer", name: "UX设计师", focus: "交互设计、用户体验", isBuiltin: true },
    { id: "analyst", name: "数据分析师", focus: "数据分析、指标体系", isBuiltin: true },
    { id: "marketer", name: "市场专家", focus: "市场策略、竞品分析", isBuiltin: true },
  ]),
}));

// Mock ai module
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import { getAllExperts } from "@/lib/experts/definitions";
import { recommendExpertCombination } from "../recommender";

const aiModule = await import("ai");
const mockGenerateText = vi.mocked(aiModule.generateText);

// getAllExperts is mocked via vi.mock above; reference to ensure mock is active
void getAllExperts;

const mockModel = { modelId: "test-model" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recommender: recommendExpertCombination", () => {
  it("TU-P2-4-01: 正常推荐返回 expertIds 和 reasoning", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        expertIds: ["pm", "architect"],
        reasoning: "产品经理和技术架构师覆盖需求和技术可行性",
      }),
    } as any);

    const result = await recommendExpertCombination(mockModel, "新产品立项");

    expect(result.expertIds).toContain("pm");
    expect(result.expertIds).toContain("architect");
    expect(result.reasoning).toContain("产品经理");
  });

  it("TU-P2-4-02: LLM 返回无效 expertId 时过滤", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        expertIds: ["pm", "nonexistent", "architect"],
        reasoning: "推荐理由",
      }),
    } as any);

    const result = await recommendExpertCombination(mockModel, "技术选型");

    expect(result.expertIds).toContain("pm");
    expect(result.expertIds).toContain("architect");
    expect(result.expertIds).not.toContain("nonexistent");
  });

  it("TU-P2-4-03: LLM 返回无效 JSON 时降级为默认推荐", async () => {
    mockGenerateText.mockResolvedValue({
      text: "这不是JSON",
    } as any);

    const result = await recommendExpertCombination(mockModel, "市场分析");

    expect(result.expertIds).toEqual(["pm", "architect"]);
  });

  it("TU-P2-4-04: LLM 调用失败时降级为默认推荐", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));

    const result = await recommendExpertCombination(mockModel, "产品复盘");

    expect(result.expertIds).toEqual(["pm", "architect"]);
    expect(result.reasoning).toBeTruthy();
  });

  it("TU-P2-4-05: description 为空时正常工作", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        expertIds: ["pm", "designer"],
        reasoning: "推荐理由",
      }),
    } as any);

    const result = await recommendExpertCombination(mockModel, "用户体验优化");

    expect(result.expertIds).toHaveLength(2);
    // 验证 prompt 中不强制包含 description
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("用户体验优化");
  });

  it("TU-P2-4-06: 推荐结果至少 2 位专家", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        expertIds: ["pm"],
        reasoning: "只有一位",
      }),
    } as any);

    const result = await recommendExpertCombination(mockModel, "需求分析");

    expect(result.expertIds.length).toBeGreaterThanOrEqual(2);
  });

  it("TU-P2-4-07: 推荐结果不超过 4 位专家", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        expertIds: ["pm", "architect", "designer", "analyst", "marketer"],
        reasoning: "五位专家",
      }),
    } as any);

    const result = await recommendExpertCombination(mockModel, "综合分析");

    expect(result.expertIds.length).toBeLessThanOrEqual(4);
  });
});
