import { app, BrowserWindow, dialog } from "electron";
import { spawn, exec, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { existsSync, copyFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import http from "node:http";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3");

const isDev = !app.isPackaged;
const PORT = 3000;

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcessWithoutNullStreams | null = null;
let logPath: string = "";
let lastErrorOutput = "";

/* 文件日志 */
function initLog(): void {
  const logDir = app.getPath("userData");
  mkdirSync(logDir, { recursive: true });
  logPath = join(logDir, "server.log");
  writeFileSync(logPath, `[${new Date().toISOString()}] Electron main started\n`);
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  if (logPath) appendFileSync(logPath, line + "\n");
}

/* 单实例锁：避免多开导致多 server 抢端口 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/* 数据库路径：file:<userData>/app.db（正斜杠） */
function getDatabaseUrl(): string {
  const dbPath = join(app.getPath("userData"), "app.db");
  return "file:" + dbPath.replace(/\\/g, "/");
}

/* 首次启动：从模板复制空库（含 schema、无数据） */
function ensureDatabase(templateDbPath: string): void {
  const dbPath = join(app.getPath("userData"), "app.db");
  if (existsSync(dbPath)) return;
  if (existsSync(templateDbPath)) {
    copyFileSync(templateDbPath, dbPath);
    log("已从模板初始化数据库: " + dbPath);
  } else {
    log("警告: 未找到数据库模板: " + templateDbPath);
  }
}

/**
 * 数据库迁移：检测旧版 app.db schema 是否过期，如果过期则备份后用模板替换
 * 通过检查 Message.seq 列是否存在来判断 schema 版本（v0.2.0 标记）
 */
function migrateDatabase(): void {
  const dbPath = join(app.getPath("userData"), "app.db");
  if (!existsSync(dbPath)) return;

  try {
    const db = new Database(dbPath);

    // 检测 Message.seq 列是否存在（v0.2.0 schema 标记）
    const msgColumns = db.pragma("table_info(Message)") as { name: string }[];
    const hasSeq = msgColumns.some((c) => c.name === "seq");
    db.close();

    if (hasSeq) {
      log("数据库 schema 已是最新版本");
      return;
    }

    // 旧版数据库，备份后用模板替换
    const backupPath = dbPath + ".v011-backup";
    copyFileSync(dbPath, backupPath);
    log("已备份旧数据库到: " + backupPath);

    const templatePath = join(
      process.resourcesPath,
      "app",
      "prisma",
      "app-template.db"
    );
    if (existsSync(templatePath)) {
      copyFileSync(templatePath, dbPath);
      log("已用模板数据库替换旧库（schema 升级到 v0.2.0）");
    } else {
      log("错误: 模板数据库不存在: " + templatePath);
    }
  } catch (e) {
    log("数据库迁移检查失败: " + (e instanceof Error ? e.message : String(e)));
  }
}

/* 释放端口（跨平台） */
function killPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? `netstat -ano | findstr :${port}` : `lsof -ti:${port}`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout) return resolve();
      if (isWin) {
        const pids = new Set<string>();
        stdout.split("\n").forEach((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5 && parts[1]?.endsWith(`:${port}`) && parts[3] === "LISTENING") {
            pids.add(parts[4]);
          }
        });
        Promise.all(
          Array.from(pids).map(
            (pid) => new Promise<void>((r) => exec(`taskkill /F /PID ${pid}`, () => r()))
          )
        ).then(() => resolve());
      } else {
        Promise.all(
          stdout
            .trim()
            .split("\n")
            .map((pid) => new Promise<void>((r) => exec(`kill -9 ${pid}`, () => r())))
        ).then(() => resolve());
      }
    });
  });
}

/* 轮询等待 Next 服务就绪 */
function waitForServer(timeoutMs = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("server timeout"));
        else setTimeout(check, 400);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("server timeout"));
        else setTimeout(check, 400);
      });
    };
    check();
  });
}

/* 生产：以 electron.exe + ELECTRON_RUN_AS_NODE 拉起 standalone server */
function startStandaloneServer(): ChildProcessWithoutNullStreams {
  const appDir = join(process.resourcesPath, "app");
  const serverPath = join(appDir, "server.js");

  log("server path: " + serverPath);
  log("server exists: " + existsSync(serverPath));
  log("app dir: " + appDir);
  log("app dir exists: " + existsSync(appDir));

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    DATABASE_URL: getDatabaseUrl(),
  };

  const child = spawn(process.execPath, [serverPath], {
    env,
    cwd: appDir,
    windowsHide: true,
  });

  child.stdout.on("data", (d) => {
    const text = d.toString();
    process.stdout.write(text);
    if (logPath) appendFileSync(logPath, text);
  });
  child.stderr.on("data", (d) => {
    const text = d.toString();
    process.stderr.write(text);
    lastErrorOutput += text;
    if (lastErrorOutput.length > 5000) lastErrorOutput = lastErrorOutput.slice(-5000);
    if (logPath) appendFileSync(logPath, "[stderr] " + text);
  });
  child.on("exit", (code) => {
    log("server exited code=" + code);
  });
  child.on("error", (err) => {
    log("server spawn error: " + err.message + "\n" + err.stack);
    lastErrorOutput += "Spawn error: " + err.message + "\n" + err.stack;
  });

  return child;
}

/* 创建窗口 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadURL(isDev ? `http://localhost:${PORT}` : `http://127.0.0.1:${PORT}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* 生命周期 */
app.whenReady().then(async () => {
  initLog();
  log("isPackaged: " + app.isPackaged);
  log("process.execPath: " + process.execPath);
  log("resourcesPath: " + process.resourcesPath);
  log("userData: " + app.getPath("userData"));

  if (!isDev) {
    const templatePath = join(process.resourcesPath, "app", "prisma", "app-template.db");
    log("template db path: " + templatePath + ", exists: " + existsSync(templatePath));
    ensureDatabase(templatePath);
    migrateDatabase();
    log("database url: " + getDatabaseUrl());

    await killPort(PORT);
    log("port " + PORT + " cleared");

    serverProcess = startStandaloneServer();

    /* 检测子进程在等待期间提前退出 */
    let serverExitedEarly = false;
    let serverExitCode: number | null = null;
    serverProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        serverExitedEarly = true;
        serverExitCode = code;
      }
    });

    try {
      await waitForServer(60000);
      log("server is ready");
    } catch {
      const errorMsg = serverExitedEarly
        ? `内置服务启动时崩溃（退出码: ${serverExitCode}）。\n\n日志文件: ${logPath}\n\n最近输出:\n${lastErrorOutput || "(无输出)"}`
        : `内置 Web 服务启动超时（60秒）。\n\n日志文件: ${logPath}\n\n最近输出:\n${lastErrorOutput || "(无输出)"}`;
      log("ERROR: " + errorMsg);
      dialog.showErrorBox("启动失败", errorMsg);
    }
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    try {
      if (process.platform === "win32") {
        exec(`taskkill /F /T /PID ${serverProcess.pid}`);
      } else {
        serverProcess.kill("SIGTERM");
      }
    } catch {
      /* noop */
    }
  }
});
