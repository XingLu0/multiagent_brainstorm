import { prisma } from "@/lib/prisma";
import { EXPERTS, type ExpertDefinition } from "./types";

// Re-export 客户端安全的类型和常量，保持向后兼容
export { EXPERTS, type ExpertDefinition, GENERIC_EXPERT_TEMPLATE, ALLOWED_COLORS } from "./types";

/**
 * 异步获取专家定义：先查数据库（含自定义），再回退到内存
 */
export async function getExpertById(
  id: string
): Promise<ExpertDefinition | undefined> {
  try {
    const dbExpert = await prisma.expertDefinition.findUnique({
      where: { id },
    });
    if (dbExpert) {
      return {
        id: dbExpert.id,
        name: dbExpert.name,
        avatarColor: dbExpert.avatarColor,
        persona: dbExpert.persona,
        focus: dbExpert.focus,
        isBuiltin: dbExpert.isBuiltin,
      };
    }
  } catch {
    // 数据库不可用时回退到内存
  }
  return EXPERTS.find((e) => e.id === id);
}

/**
 * 异步批量获取专家定义
 */
export async function getExpertsByIds(
  ids: string[]
): Promise<ExpertDefinition[]> {
  const results = await Promise.all(ids.map(getExpertById));
  return results.filter(
    (e): e is ExpertDefinition => e !== undefined
  );
}

/**
 * 获取所有专家（内置 + 自定义）
 * 以内存内置为底座，DB 记录覆盖/追加，保证未 seed 时内置专家仍可见
 */
export async function getAllExperts(): Promise<ExpertDefinition[]> {
  const merged = new Map<string, ExpertDefinition>(
    EXPERTS.map((e) => [e.id, { ...e, isBuiltin: true }])
  );
  try {
    const dbExperts = await prisma.expertDefinition.findMany({
      orderBy: [{ isBuiltin: "desc" }, { createdAt: "asc" }],
    });
    for (const e of dbExperts) {
      merged.set(e.id, {
        id: e.id,
        name: e.name,
        avatarColor: e.avatarColor,
        persona: e.persona,
        focus: e.focus,
        isBuiltin: e.isBuiltin,
      });
    }
  } catch {
    // DB 不可用时保留内存底座
  }
  return Array.from(merged.values());
}
