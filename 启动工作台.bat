@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 AI 内容创作与直播电商协同工作台...
echo 启动后将自动打开 http://localhost:3000
echo 请勿关闭此黑色窗口，关闭窗口将停止本地网站服务。
echo.
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"
call npm.cmd run dev
pause
