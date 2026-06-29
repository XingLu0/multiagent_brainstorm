/**
 * P3-1: 撤销/重做 + 讨论回放单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  undo,
  redo,
  getUndoRedoState,
  getReplayMessages,
} from "../undo-redo-manager";

const mockProjectFindUnique = vi.mocked(prisma.project.findUnique);
const mockProjectUpdate = vi.mocked(prisma.project.update);
const mockMessageFindFirst = vi.mocked(prisma.message.findFirst);
const mockMessageFindMany = vi.mocked(prisma.message.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  mockProjectUpdate.mockResolvedValue({} as any);
});

describe("undo-redo-manager: undo", () => {
  it("TU-P3-1-01: currentSeq=0 时回退到 maxSeq-1", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 0 } as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await undo("project-1");

    expect(result).not.toBeNull();
    expect(result!.currentSeq).toBe(4);
    expect(mockProjectUpdate).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: { currentSeq: 4 },
    });
  });

  it("TU-P3-1-02: currentSeq>0 时递减", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 3 } as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await undo("project-1");

    expect(result).not.toBeNull();
    expect(result!.currentSeq).toBe(2);
  });

  it("TU-P3-1-03: 已在最早位置(seq=1)时返回 null", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 1 } as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await undo("project-1");

    expect(result).toBeNull();
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("TU-P3-1-13: 只有一条消息时 undo 返回 null", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 0 } as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 1 } as any);

    const result = await undo("project-1");

    expect(result).toBeNull();
  });
});

describe("undo-redo-manager: redo", () => {
  it("TU-P3-1-04: currentSeq>0 时递增", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 3 } as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await redo("project-1");

    expect(result).not.toBeNull();
    expect(result!.currentSeq).toBe(4);
  });

  it("TU-P3-1-05: 到达 maxSeq 时重置为 0", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 4 } as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await redo("project-1");

    expect(result).not.toBeNull();
    expect(result!.currentSeq).toBe(0);
    expect(result!.canRedo).toBe(false);
  });

  it("TU-P3-1-06: currentSeq=0 时返回 null", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 0 } as any);

    const result = await redo("project-1");

    expect(result).toBeNull();
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });
});

describe("undo-redo-manager: getUndoRedoState", () => {
  it("TU-P3-1-07: currentSeq=0 时 canRedo=false", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 0 } as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await getUndoRedoState("project-1");

    expect(result.currentSeq).toBe(0);
    expect(result.canRedo).toBe(false);
    expect(result.canUndo).toBe(true);
  });

  it("TU-P3-1-08: currentSeq>0 时 canUndo=canRedo=true", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 3 } as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await getUndoRedoState("project-1");

    expect(result.currentSeq).toBe(3);
    expect(result.canUndo).toBe(true);
    expect(result.canRedo).toBe(true);
  });
});

describe("undo-redo-manager: getReplayMessages", () => {
  it("TU-P3-1-09: 传入 seq 返回截断消息列表", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 0 } as any);
    mockMessageFindMany.mockResolvedValue([
      { id: "m1", role: "user", content: "hello", seq: 1, createdAt: new Date(), metadata: null },
      { id: "m2", role: "host", content: "hi", seq: 2, createdAt: new Date(), metadata: null },
      { id: "m3", role: "expert:pm", content: "response", seq: 3, createdAt: new Date(), metadata: null },
    ] as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await getReplayMessages("project-1", 3);

    expect(result.messages).toHaveLength(3);
    expect(result.totalMessages).toBe(5);
    // 验证 findMany 被正确调用
    expect(mockMessageFindMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", seq: { lte: 3 } },
      orderBy: { seq: "asc" },
      select: expect.any(Object),
    });
  });

  it("TU-P3-1-10: 不传 seq 返回全部消息", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 0 } as any);
    mockMessageFindMany.mockResolvedValue([
      { id: "m1", role: "user", content: "hello", seq: 1, createdAt: new Date(), metadata: null },
    ] as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 1 } as any);

    const result = await getReplayMessages("project-1");

    expect(result.messages).toHaveLength(1);
    expect(mockMessageFindMany).toHaveBeenCalledWith({
      where: { projectId: "project-1" },
      orderBy: { seq: "asc" },
      select: expect.any(Object),
    });
  });

  it("TU-P3-1-11: 不修改 currentSeq", async () => {
    mockProjectFindUnique.mockResolvedValue({ currentSeq: 3 } as any);
    mockMessageFindMany.mockResolvedValue([] as any);
    mockMessageFindFirst.mockResolvedValue({ seq: 5 } as any);

    const result = await getReplayMessages("project-1");

    expect(result.currentSeq).toBe(3);
    // project.update 不应被调用（只读操作）
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });
});
