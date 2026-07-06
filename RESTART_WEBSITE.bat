@echo off
cd /d "%~dp0"
set PORT=5173
set "NODE_EXE=C:\Users\Fred\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

echo Restarting website on http://localhost:5173
echo.
echo Closing old website process if it exists...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>nul
)

echo.
echo Starting website...
echo Keep this window open.
echo Open this address in your browser:
echo http://localhost:5173
echo.

if exist "%NODE_EXE%" (
  "%NODE_EXE%" server.js
) else (
  node server.js
)

echo.
echo Website stopped or failed to start.
pause
