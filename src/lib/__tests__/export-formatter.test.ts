import { describe, it, expect } from "vitest";
import { exportAsJSON, exportAsMarkdown, exportAsText, sanitizeFilename, type ExportData } from "../export-formatter";

function makeTestData(overrides?: Partial<ExportData>): ExportData {
  return {
    project: {
      id: "test-1",
      title: "测试项目",
      status: "completed",
      phase: "converge",
      expertIds: JSON.stringify(["pm", "architect"]),
      createdAt: new Date("2026-01-01T10:00:00Z"),
      completedAt: new Date("2026-01-01T11:00:00Z"),
    },
    messages: [
      {
        id: "m1",
        role: "host",
        content: "欢迎来到脑暴会议",
        metadata: null,
        seq: 1,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
      {
        id: "m2",
        role: "expert:pm",
        content: "从产品角度看...",
        metadata: JSON.stringify({ type: "expert", expertId: "pm", round: 1 }),
        seq: 2,
        createdAt: new Date("2026-01-01T10:01:00Z"),
      },
      {
        id: "m3",
        role: "expert:architect",
        content: "从技术架构来看...",
        metadata: JSON.stringify({ type: "expert", expertId: "architect", round: 1 }),
        seq: 3,
        createdAt: new Date("2026-01-01T10:02:00Z"),
      },
    ],
    documents: [
      {
        id: "d1",
        docType: "minutes",
        content: "# 会议纪要\n讨论了产品和技术方案",
        createdAt: new Date("2026-01-01T11:00:00Z"),
      },
    ],
    ...overrides,
  };
}

describe("export-formatter: JSON 导出", () => {
  it("1. exportAsJSON 返回合法 JSON 字符串", () => {
    const result = exportAsJSON(makeTestData());
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("project");
    expect(parsed).toHaveProperty("messages");
    expect(parsed).toHaveProperty("documents");
  });

  it("2. JSON 包含 project 字段（title/status/phase/createdAt）", () => {
    const parsed = JSON.parse(exportAsJSON(makeTestData()));
    expect(parsed.project.title).toBe("测试项目");
    expect(parsed.project.status).toBe("completed");
    expect(parsed.project.phase).toBe("converge");
    expect(parsed.project.createdAt).toBeDefined();
  });

  it("3. JSON messages 数组按 seq 排序", () => {
    const data = makeTestData({
      messages: [
        { id: "m3", role: "expert:architect", content: "第三条", metadata: null, seq: 3, createdAt: new Date("2026-01-01T10:02:00Z") },
        { id: "m1", role: "host", content: "第一条", metadata: null, seq: 1, createdAt: new Date("2026-01-01T10:00:00Z") },
        { id: "m2", role: "expert:pm", content: "第二条", metadata: null, seq: 2, createdAt: new Date("2026-01-01T10:01:00Z") },
      ],
    });
    const parsed = JSON.parse(exportAsJSON(data));
    expect(parsed.messages[0].seq).toBe(1);
    expect(parsed.messages[1].seq).toBe(2);
    expect(parsed.messages[2].seq).toBe(3);
  });

  it("4. JSON 包含 documents 数组", () => {
    const parsed = JSON.parse(exportAsJSON(makeTestData()));
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0].type).toBe("minutes");
  });

  it("5. 空消息列表时 JSON 结构正确", () => {
    const parsed = JSON.parse(exportAsJSON(makeTestData({ messages: [] })));
    expect(parsed.messages).toEqual([]);
  });

  it("6. expert:xxx 角色正确解析为 expertId", () => {
    const parsed = JSON.parse(exportAsJSON(makeTestData()));
    expect(parsed.messages[1].expertId).toBe("pm");
    expect(parsed.messages[2].expertId).toBe("architect");
  });
});

describe("export-formatter: Markdown 导出", () => {
  it("7. exportAsMarkdown 返回非空字符串", () => {
    const result = exportAsMarkdown(makeTestData());
    expect(result.length).toBeGreaterThan(0);
  });

  it("8. Markdown 以 '# {title}' 开头", () => {
    const result = exportAsMarkdown(makeTestData());
    expect(result.startsWith("# 测试项目")).toBe(true);
  });

  it("9. 每条消息有 '### [角色]' 标题", () => {
    const result = exportAsMarkdown(makeTestData());
    expect(result).toContain("### [主持人]");
    expect(result).toContain("### [专家 pm]");
    expect(result).toContain("### [专家 architect]");
  });

  it("10. 消息按 seq 升序排列", () => {
    const data = makeTestData({
      messages: [
        { id: "m3", role: "expert:architect", content: "第三条", metadata: null, seq: 3, createdAt: new Date("2026-01-01T10:02:00Z") },
        { id: "m1", role: "host", content: "第一条", metadata: null, seq: 1, createdAt: new Date("2026-01-01T10:00:00Z") },
        { id: "m2", role: "expert:pm", content: "第二条", metadata: null, seq: 2, createdAt: new Date("2026-01-01T10:01:00Z") },
      ],
    });
    const result = exportAsMarkdown(data);
    const firstIdx = result.indexOf("第一条");
    const secondIdx = result.indexOf("第二条");
    const thirdIdx = result.indexOf("第三条");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it("11. 包含生成文档部分", () => {
    const result = exportAsMarkdown(makeTestData());
    expect(result).toContain("## 生成文档");
    expect(result).toContain("会议纪要");
  });
});

describe("export-formatter: Text 导出", () => {
  it("12. exportAsText 返回纯文本（无 Markdown 语法）", () => {
    const result = exportAsText(makeTestData({
      documents: [{
        id: "d1",
        docType: "minutes",
        content: "会议纪要内容（无 Markdown）",
        createdAt: new Date("2026-01-01T11:00:00Z"),
      }],
    }));
    expect(result).not.toContain("###");
    expect(result).not.toContain("|---");
    expect(result).toContain("测试项目");
    expect(result).toContain("主持人");
    expect(result).toContain("专家 pm");
  });
});

describe("export-formatter: sanitizeFilename", () => {
  it("移除不安全的文件系统字符", () => {
    expect(sanitizeFilename('test<>:"/\\|?*file')).toBe("test_________file");
  });

  it("空字符串回退为 discussion", () => {
    expect(sanitizeFilename("")).toBe("discussion");
  });

  it("截断过长的文件名", () => {
    const long = "a".repeat(200);
    expect(sanitizeFilename(long).length).toBe(100);
  });
});
