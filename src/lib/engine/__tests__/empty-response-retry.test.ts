/**
 * DEF-07: 空响应重试单元测试
 *
 * 验证 consumeStreamWithRetry 在空响应时自动重试 1 次。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the logger
const mockConsoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

// Mock prisma to prevent real DB calls during consumeStream
vi.mock("@/lib/prisma", () => ({
  prisma: {
    lLMCallLog: { create: vi.fn() },
  },
}));

import { consumeStreamWithRetry } from "../host-agent";

// Mock consumeStream behavior by creating mock stream results
function createMockStreamResult(text: string) {
  return {
    fullStream: (async function* () {
      if (text) {
        yield { type: "text-start", id: "1" };
        yield { type: "text-delta", id: "1", text };
        yield { type: "text-end", id: "1" };
      }
      yield { type: "finish", finishReason: "stop", usage: { promptTokens: 10, completionTokens: 5 } };
    })(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DEF-07: consumeStreamWithRetry", () => {
  it("正常响应不重试", async () => {
    const factory = vi.fn(() => createMockStreamResult("hello world"));
    const onChunk = vi.fn();

    const result = await consumeStreamWithRetry(factory, onChunk);

    expect(result).toBe("hello world");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("空响应自动重试 1 次", async () => {
    // First call returns empty, second call returns content
    const factory = vi.fn()
      .mockReturnValueOnce(createMockStreamResult(""))
      .mockReturnValueOnce(createMockStreamResult("retry success"));

    const onChunk = vi.fn();

    const result = await consumeStreamWithRetry(factory, onChunk);

    expect(result).toBe("retry success");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("[DEF-07] LLM 返回空响应，正在重试")
    );
  });

  it("重试仍空响应则抛错", async () => {
    const factory = vi.fn(() => createMockStreamResult(""));
    const onChunk = vi.fn();

    await expect(consumeStreamWithRetry(factory, onChunk)).rejects.toThrow("空响应");
    expect(factory).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it("非空响应错误不触发重试", async () => {
    const factory = vi.fn(() => {
      throw new Error("网络错误");
    });
    const onChunk = vi.fn();

    await expect(consumeStreamWithRetry(factory, onChunk)).rejects.toThrow("网络错误");
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
