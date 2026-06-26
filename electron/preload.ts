import { contextBridge } from "electron";

// 暴露极少量只读信息供前端可选使用
contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  version: process.env.npm_package_version ?? "0.0.0",
  platform: process.platform,
});
