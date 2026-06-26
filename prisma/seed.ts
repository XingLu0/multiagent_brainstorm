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
