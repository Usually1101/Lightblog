@echo off
chcp 65001 >nul
echo ========================================
echo       Usually--本项目自动启动脚本
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 并添加到 PATH。
    pause >nul
    exit /b 1
)

REM 检查 package.json
if not exist package.json (
    echo [1/4] package.json 不存在，执行 npm init -y ...
    npm init -y
    if errorlevel 1 (
        echo [错误] npm init 失败，请检查网络或权限。
        pause >nul
        exit /b 1
    )
    echo [完成] npm init 成功。
) else (
    echo [1/4] package.json 已存在，跳过。
)

REM 检查 express
if not exist node_modules\express (
    echo [2/4] express 未安装，执行 npm install express ...
    npm install express
    if errorlevel 1 (
        echo [错误] npm install express 失败。
        pause >nul
        exit /b 1
    )
    echo [完成] npm install express 成功。
) else (
    echo [2/4] express 已安装，跳过。
)

REM 🆕 检查 multer
if not exist node_modules\multer (
    echo [3/4] multer 未安装，执行 npm install multer ...
    npm install multer
    if errorlevel 1 (
        echo [错误] npm install multer 失败。
        pause >nul
        exit /b 1
    )
    echo [完成] npm install multer 成功。
) else (
    echo [3/4] multer 已安装，跳过。
)

echo [4/4] 启动服务器...
echo ========================================
echo 服务器运行中，按 Ctrl+C 可停止
echo ========================================
node server.js

pause