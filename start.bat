@echo off
REM ============================================================
REM  AI脑暴 - Windows 一键启动脚本
REM  用法：双击运行，选择启动模式（开发/生产/重构建/Electron打包）
REM  依赖：Node.js 24、npm、Windows Build Tools（C++ + Python）
REM ============================================================
cd /d "%~dp0"

echo ========================================
echo   AI Brainstorm - Quick Start
echo ========================================
echo.
echo Please select a mode:
echo   1. Development (hot-reload, for debugging)
echo   2. Production (build then start, for daily use)
echo   3. Rebuild and start in production mode
echo   4. Electron desktop app (build ^& package)
echo.
set /p choice="Enter option (1/2/3/4): "

if "%choice%"=="1" goto dev_mode
if "%choice%"=="2" goto prod_mode
if "%choice%"=="3" goto rebuild_mode
if "%choice%"=="4" goto electron_mode
echo [ERROR] Invalid option
pause
exit /b 1

:dev_mode
echo.
echo [DEV MODE] Starting development server...
call :check_node
call :check_deps
echo.
echo [STEP] Rebuilding native modules and starting...
call npm rebuild better-sqlite3
call npx prisma generate
call npx prisma db push
echo.
call npm run dev:clean
goto end

:prod_mode
echo.
echo [PROD MODE] Starting production server...
call :check_node
call :check_deps
if not exist ".next" (
    echo [INFO] No build output found, running build first...
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed, check the log above.
        pause
        exit /b 1
    )
)
echo.
call npm run start:prod
goto end

:rebuild_mode
echo.
echo [REBUILD] Rebuilding and starting production server...
call :check_node
call :check_deps
echo.
echo [STEP 1/2] Building project...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed, check the log above.
    pause
    exit /b 1
)
echo.
echo [STEP 2/2] Starting production server...
call npm run start:prod
goto end

:check_node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js v22+
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [INFO] Node.js version: %NODE_VERSION%
goto :eof

:check_deps
if not exist "node_modules" (
    echo [INFO] First time setup, running full initialization...
    call npm run setup
    if %errorlevel% neq 0 (
        echo [ERROR] Setup failed, check the log above.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Rebuilding native modules...
    call npm rebuild better-sqlite3
)
goto :eof

:electron_mode
echo.
echo [ELECTRON] 构建 Electron 桌面应用...
call :check_node
call :check_deps
echo.
echo [STEP 1/4] 构建 Next.js standalone...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Next build failed.
    pause
    exit /b 1
)
echo.
echo [STEP 2/4] 准备 standalone ^& 重编原生模块...
call npm run electron:prepare
if %errorlevel% neq 0 (
    echo [ERROR] prepare failed.
    pause
    exit /b 1
)
echo.
echo [STEP 3/4] 编译 Electron 主进程...
call npm run electron:ts
if %errorlevel% neq 0 (
    echo [ERROR] tsc failed.
    pause
    exit /b 1
)
echo.
echo [STEP 4/4] 打包安装程序 (electron-builder)...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo [ERROR] packaging failed.
    pause
    exit /b 1
)
echo.
echo [DONE] 安装包已生成于 electron-build\ 目录
echo [TIP] 打包后如需回到 Web 开发，请执行 npm run rebuild:node 恢复 better-sqlite3 的 Node ABI。
goto end

:end
pause