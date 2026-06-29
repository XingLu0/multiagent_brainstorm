/* scripts/prepare-electron.cjs — standalone 产物二次加工 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");
const log = (m) => console.log("\x1b[36m[prepare]\x1b[0m " + m);
const die = (m) => {
  console.error("\x1b[31m[prepare][error]\x1b[0m " + m);
  process.exit(1);
};

/* 1. 校验 standalone 存在 */
if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
  die("未找到 .next/standalone/server.js，请先执行 `npm run build`。");
}

/* 2. 补齐 .next/static 与 public（standalone 默认不含） */
log("复制 .next/static -> standalone/.next/static");
fs.cpSync(
  path.join(root, ".next", "static"),
  path.join(standaloneDir, ".next", "static"),
  { recursive: true }
);
if (fs.existsSync(path.join(root, "public"))) {
  log("复制 public -> standalone/public");
  fs.cpSync(path.join(root, "public"), path.join(standaloneDir, "public"), {
    recursive: true,
  });
}

/* 3. 删除 standalone/.env：防止泄露密钥 + 防止 env 覆盖用户运行时配置 */
const envFile = path.join(standaloneDir, ".env");
if (fs.existsSync(envFile)) {
  log("删除 standalone/.env（移除密钥与环境覆盖）");
  fs.rmSync(envFile, { force: true });
}

/* 3.5 删除 standalone/package.json：避免覆盖 files 中的根 package.json（含 main 字段） */
const standalonePkg = path.join(standaloneDir, "package.json");
if (fs.existsSync(standalonePkg)) {
  log("删除 standalone/package.json（避免覆盖根 package.json）");
  fs.rmSync(standalonePkg, { force: true });
}

/* 4. @electron/rebuild：将 better-sqlite3 重编为 Electron ABI（Windows 带 win_delay_load_hook） */
log("运行 @electron/rebuild（better-sqlite3）...");
const bin =
  path.join(root, "node_modules", ".bin", "electron-rebuild") +
  (process.platform === "win32" ? ".cmd" : "");
const r = spawnSync(bin, ["-f", "-o", "better-sqlite3"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (r.status !== 0) {
  die(
    "@electron/rebuild 失败。Windows 请确认已安装 VS Build Tools(C++) 与 Python；" +
      "国内下载 Electron 头慢时可设 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ 重试。"
  );
}

/* 5. 用 Electron-ABI 的 .node 覆盖 standalone 内追踪进来的 Node-ABI 版本 */
const srcNode = path.join(
  root,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
const dstNode = path.join(
  standaloneDir,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
if (!fs.existsSync(srcNode)) die("未找到重编后的 better_sqlite3.node: " + srcNode);
fs.mkdirSync(path.dirname(dstNode), { recursive: true });
fs.copyFileSync(srcNode, dstNode);
log("已用 Electron-ABI 覆盖 standalone 内 better_sqlite3.node");

/* 6. 生成空库模板（仅 schema、无数据），随包发布供首次启动复制 */
log("生成数据库模板 prisma/app-template.db ...");
const templateDb = path.join(root, "prisma", "app-template.db");
if (fs.existsSync(templateDb)) fs.rmSync(templateDb, { force: true });
execSync('npx prisma db push --url="file:./prisma/app-template.db"', {
  cwd: root,
  stdio: "inherit",
});
if (!fs.existsSync(templateDb)) die("数据库模板生成失败: " + templateDb);

/* 7. 将模板数据库复制到 standalone 内，随 standalone 一起打包 */
const standalonePrismaDir = path.join(standaloneDir, "prisma");
fs.mkdirSync(standalonePrismaDir, { recursive: true });
fs.copyFileSync(templateDb, path.join(standalonePrismaDir, "app-template.db"));
log("已将 app-template.db 复制到 standalone/prisma/");

log("standalone 准备完成。");
