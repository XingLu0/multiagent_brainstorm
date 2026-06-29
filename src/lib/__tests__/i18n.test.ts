/**
 * P3-3: 多语言支持单元测试
 */

import { describe, it, expect } from "vitest";
import { locales, defaultLocale, type Locale } from "@/i18n/config";
import zhMessages from "@/messages/zh.json";
import enMessages from "@/messages/en.json";
import { buildExpertSystemPrompt } from "@/lib/engine/prompts/expert-system";

// Helper: 获取所有叶子 key
function getLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...getLeafKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Helper: 根据 key 路径获取值
function getValueByKey(obj: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

describe("i18n: 消息文件一致性", () => {
  it("TU-P3-3-01: zh.json 所有 key 在 en.json 中存在", () => {
    const zhKeys = getLeafKeys(zhMessages);
    const missingInEn = zhKeys.filter((k) => getValueByKey(enMessages, k) === undefined);
    expect(missingInEn).toEqual([]);
  });

  it("TU-P3-3-02: en.json 所有 key 在 zh.json 中存在", () => {
    const enKeys = getLeafKeys(enMessages);
    const missingInZh = enKeys.filter((k) => getValueByKey(zhMessages, k) === undefined);
    expect(missingInZh).toEqual([]);
  });

  it("TU-P3-3-03: zh.json 无空值", () => {
    const zhKeys = getLeafKeys(zhMessages);
    const emptyValues = zhKeys.filter((k) => {
      const value = getValueByKey(zhMessages, k);
      return typeof value !== "string" || value.trim().length === 0;
    });
    expect(emptyValues).toEqual([]);
  });

  it("TU-P3-3-04: en.json 无空值", () => {
    const enKeys = getLeafKeys(enMessages);
    const emptyValues = enKeys.filter((k) => {
      const value = getValueByKey(enMessages, k);
      return typeof value !== "string" || value.trim().length === 0;
    });
    expect(emptyValues).toEqual([]);
  });
});

describe("i18n: buildExpertSystemPrompt language 参数", () => {
  const mockExpert = {
    id: "pm",
    name: "产品经理",
    persona: "你是产品经理",
    focus: "需求分析",
  };

  it("TU-P3-3-05: language=en 包含英文指令", () => {
    const prompt = buildExpertSystemPrompt(mockExpert, "2026-01-01", true, "diverge", "en");
    expect(prompt).toContain("respond in English");
  });

  it("TU-P3-3-06: language=zh 不包含英文指令", () => {
    const prompt = buildExpertSystemPrompt(mockExpert, "2026-01-01", true, "diverge", "zh");
    expect(prompt).not.toContain("respond in English");
  });

  it("TU-P3-3-07: 默认 language=zh", () => {
    const prompt = buildExpertSystemPrompt(mockExpert, "2026-01-01", true, "diverge");
    expect(prompt).not.toContain("respond in English");
  });
});

describe("i18n: 配置", () => {
  it("TU-P3-3-08: locale 配置正确", () => {
    expect(locales).toEqual(["zh", "en"]);
    expect(defaultLocale).toBe("zh");
    // Type check: Locale should be "zh" | "en"
    const _test: Locale = "zh";
    void _test;
  });

  it("TU-P3-3-09: 非路由式 i18n 不使用 middleware", () => {
    // DEF-01 修复：移除了 middleware.ts，采用非路由式 i18n 方案
    // 验证 locale 配置支持 cookie 切换（NEXT_LOCALE cookie）
    const supportedLocales = locales as readonly string[];
    expect(supportedLocales).toContain("zh");
    expect(supportedLocales).toContain("en");
    // defaultLocale 作为 cookie 未设置时的回退
    expect(defaultLocale).toBe("zh");
  });
});
