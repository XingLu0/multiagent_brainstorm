import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/client";
import { EXPERTS } from "../src/lib/experts/types";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/app.db";
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("开始种子数据初始化...");

  // 写入内置专家定义
  for (const expert of EXPERTS) {
    await prisma.expertDefinition.upsert({
      where: { id: expert.id },
      update: {
        name: expert.name,
        avatarColor: expert.avatarColor,
        persona: expert.persona,
        focus: expert.focus,
        isBuiltin: true,
        builtinId: expert.id,
      },
      create: {
        id: expert.id,
        name: expert.name,
        avatarColor: expert.avatarColor,
        persona: expert.persona,
        focus: expert.focus,
        isBuiltin: true,
        builtinId: expert.id,
      },
    });
    console.log(`  ✓ 内置专家: ${expert.name} (${expert.id})`);
  }

  // 写入内置项目模板
  // name 字段不是唯一约束，使用 findFirst + create/update 模式
  const builtinTemplates = [
    {
      name: "新产品立项",
      description: "从产品、市场、技术三个维度展开发散讨论",
      title: "新产品立项脑暴",
      expertIds: ["pm", "market", "architect"],
    },
    {
      name: "技术选型",
      description: "架构师主导，产品和设计提供用户视角",
      title: "技术选型讨论",
      expertIds: ["architect", "pm", "ux"],
    },
    {
      name: "市场分析",
      description: "市场、用户、产品三方协同分析市场机会",
      title: "市场机会分析",
      expertIds: ["market", "ux", "pm"],
    },
    {
      name: "产品复盘",
      description: "产品、用户、增长三角度回顾迭代效果",
      title: "产品迭代复盘",
      expertIds: ["pm", "ux", "growth"],
    },
  ];

  for (const tpl of builtinTemplates) {
    const existing = await prisma.projectTemplate.findFirst({
      where: { name: tpl.name },
    });
    const data = {
      description: tpl.description,
      title: tpl.title,
      expertIds: JSON.stringify(tpl.expertIds),
      isBuiltin: true,
    };
    if (existing) {
      await prisma.projectTemplate.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.projectTemplate.create({
        data: {
          name: tpl.name,
          ...data,
        },
      });
    }
    console.log(`  ✓ 内置模板: ${tpl.name}`);
  }

  console.log("种子数据初始化完成");
}

main()
  .catch((e) => {
    console.error("种子数据初始化失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
