/**
 * DEF-02: 快照创建单元测试
 *
 * 验证 persistMessage 在 seq 达到 SNAPSHOT_INTERVAL 倍数时创建快照，
 * 非 Snapshot 点不创建快照。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    stateSnapshot: {
      create: vi.fn(),
    },
  },
}));

// Mock knowledge-base
vi.mock("../knowledge-base", () => ({
  getKnowledgeCounts: vi.fn().mockResolvedValue({ consensus: 0, divergence: 0 }),
  queryKnowledge: vi.fn().mockResolvedValue(""),
  queryKnowledgeSemantic: vi.fn().mockResolvedValue(""),
  incrementKnowledgeVersion: vi.fn(),
}));

// Mock experts definitions
vi.mock("@/lib/experts/definitions", () => ({
  getExpertById: vi.fn().mockResolvedValue({ id: "pm", name: "产品经理", avatarColor: "emerald" }),
}));

// Mock context-summarizer (buildContextString 依赖)
vi.mock("../context-summarizer", () => ({
  compressContext: vi.fn().mockResolvedValue(null),
}));

import { prisma } from "@/lib/prisma";
import { persistMessage } from "../conversation-manager";
import { shouldCreateSnapshot } from "../snapshot-manager";

const mockMessageCreate = vi.mocked(prisma.message.create);
const mockMessageAggregate = vi.mocked(prisma.message.aggregate);
const mockSnapshotCreate = vi.mocked(prisma.stateSnapshot.create);
const mockMessageFindMany = vi.mocked(prisma.message.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DEF-02: shouldCreateSnapshot 逻辑", () => {
  it("seq=20 时应创建快照", () => {
    expect(shouldCreateSnapshot(20)).toBe(true);
  });

  it("seq=40 时应创建快照", () => {
    expect(shouldCreateSnapshot(40)).toBe(true);
  });

  it("seq=19 时不应创建快照", () => {
    expect(shouldCreateSnapshot(19)).toBe(false);
  });

  it("seq=0 时不应创建快照", () => {
    expect(shouldCreateSnapshot(0)).toBe(false);
  });

  it("seq=21 时不应创建快照", () => {
    expect(shouldCreateSnapshot(21)).toBe(false);
  });
});

describe("DEF-02: persistMessage 快照集成", () => {
  it("seq=20 且传入 snapshotExpertIds 时创建快照", async () => {
    // 模拟 getNextSeq 返回 20
    mockMessageAggregate.mockResolvedValue({ _max: { seq: 19 } } as any);
    // 模拟 message.create 返回 seq=20
    mockMessageCreate.mockResolvedValue({ id: "msg-20", seq: 20, projectId: "p1", role: "user", content: "test", metadata: null } as any);
    // 模拟 loadConversationHistory
    mockMessageFindMany.mockResolvedValue([{ role: "user", content: "test" }] as any);

    await persistMessage("p1", "user", "test", undefined, ["pm"]);

    // 验证快照创建被调用
    expect(mockSnapshotCreate).toHaveBeenCalledTimes(1);
    expect(mockSnapshotCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "p1",
          seq: 20,
        }),
      })
    );
  });

  it("seq=19 且传入 snapshotExpertIds 时不创建快照", async () => {
    mockMessageAggregate.mockResolvedValue({ _max: { seq: 18 } } as any);
    mockMessageCreate.mockResolvedValue({ id: "msg-19", seq: 19, projectId: "p1", role: "user", content: "test", metadata: null } as any);

    await persistMessage("p1", "user", "test", undefined, ["pm"]);

    expect(mockSnapshotCreate).not.toHaveBeenCalled();
  });

  it("seq=20 但未传入 snapshotExpertIds 时不创建快照", async () => {
    mockMessageAggregate.mockResolvedValue({ _max: { seq: 19 } } as any);
    mockMessageCreate.mockResolvedValue({ id: "msg-20", seq: 20, projectId: "p1", role: "user", content: "test", metadata: null } as any);

    await persistMessage("p1", "user", "test");

    expect(mockSnapshotCreate).not.toHaveBeenCalled();
  });

  it("快照创建失败不阻塞消息持久化", async () => {
    mockMessageAggregate.mockResolvedValue({ _max: { seq: 19 } } as any);
    mockMessageCreate.mockResolvedValue({ id: "msg-20", seq: 20, projectId: "p1", role: "user", content: "test", metadata: null } as any);
    mockMessageFindMany.mockResolvedValue([{ role: "user", content: "test" }] as any);
    // 快照创建抛错
    mockSnapshotCreate.mockRejectedValue(new Error("DB error"));

    // 不应抛错
    const result = await persistMessage("p1", "user", "test", undefined, ["pm"]);
    expect(result.seq).toBe(20);
  });

  it("传入空 snapshotExpertIds 时不创建快照", async () => {
    mockMessageAggregate.mockResolvedValue({ _max: { seq: 19 } } as any);
    mockMessageCreate.mockResolvedValue({ id: "msg-20", seq: 20, projectId: "p1", role: "user", content: "test", metadata: null } as any);

    await persistMessage("p1", "user", "test", undefined, []);

    expect(mockSnapshotCreate).not.toHaveBeenCalled();
  });
});
