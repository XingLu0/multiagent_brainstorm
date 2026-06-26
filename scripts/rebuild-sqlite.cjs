/**
 * 跨平台 better-sqlite3 原生模块编译脚本
 *
 * 策略：
 * 1. 先尝试 prebuild-install 下载当前 Node 版本的预编译二进制（无需 Visual Studio）
 * 2. 失败则 fallback 到 npm rebuild（需要编译环境）
 * 3. 最后验证模块能正常加载
 */

const { execSync } = require("child_process");
const path = require("path");

const sqliteDir = path.join(__dirname, "..", "node_modules", "better-sqlite3");
const nodeVersion = process.versions.node;

console.log(`[rebuild-sqlite] Node.js v${nodeVersion} (ABI ${process.versions.modules})`);

// Step 1: 尝试 prebuild-install 下载预编译二进制
try {
  console.log("[rebuild-sqlite] 尝试下载预编译二进制...");
  execSync(
    `node "${path.join(__dirname, "..", "node_modules", "prebuild-install", "bin.js")}" -t ${nodeVersion} --force`,
    { cwd: sqliteDir, stdio: "inherit" }
  );
  console.log("[rebuild-sqlite] 预编译二进制下载成功");
} catch {
  console.log("[rebuild-sqlite] 预编译二进制下载失败，尝试从源码编译...");
  try {
    // 用当前 Node 的完整路径执行 node-gyp，确保编译时用正确的 Node 版本
    const nodeGypBin = path.join(__dirname, "..", "node_modules", "node-gyp", "bin", "node-gyp.js");
    execSync(
      `"${process.execPath}" "${nodeGypBin}" rebuild --release`,
      { cwd: sqliteDir, stdio: "inherit" }
    );
    console.log("[rebuild-sqlite] 源码编译成功");
  } catch {
    console.error("[rebuild-sqlite] 编译失败！");
    console.error("[rebuild-sqlite] 请确保已安装 Visual Studio Build Tools (含 C++ 和 Windows SDK)");
    console.error("[rebuild-sqlite] 或尝试切换到 Node.js v22（与预编译包匹配的版本）");
    process.exit(1);
  }
}

// Step 2: 验证模块能正常加载
try {
  require("better-sqlite3");
  console.log(`[rebuild-sqlite] 验证成功 - better-sqlite3 可在 Node v${nodeVersion} (ABI ${process.versions.modules}) 下正常加载`);
} catch (err) {
  console.error("[rebuild-sqlite] 验证失败 - 模块加载出错：");
  console.error(err.message);
  console.error(`[rebuild-sqlite] 当前 Node: v${nodeVersion} (ABI ${process.versions.modules})`);
  console.error("[rebuild-sqlite] 可能是编译时与运行时的 Node 版本不一致");
  console.error("[rebuild-sqlite] 请确保 setup 和 dev 使用同一个 Node.js 版本");
  process.exit(1);
}
