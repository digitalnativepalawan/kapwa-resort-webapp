@echo off
setlocal
cd /d "%~dp0"

echo KAPWA Local Hermes
echo Model: qwen2.5:3b
echo.

where ollama >nul 2>nul
if errorlevel 1 (
  echo ERROR: Ollama is not installed or is not available in PATH.
  pause
  exit /b 1
)

ollama list | findstr /I /C:"qwen2.5:3b" >nul
if errorlevel 1 (
  echo qwen2.5:3b is missing. Downloading it now...
  ollama pull qwen2.5:3b
  if errorlevel 1 (
    echo ERROR: Could not download qwen2.5:3b.
    pause
    exit /b 1
  )
)

curl -s http://127.0.0.1:11434/api/tags >nul 2>nul
if errorlevel 1 (
  echo Starting Ollama...
  start "KAPWA Ollama" /min cmd /c "ollama serve"
  timeout /t 3 /nobreak >nul
)

if not exist node_modules (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Hermes at http://127.0.0.1:3000/api/hermes
echo Keep this window open while KAPWA is using the local concierge.
echo.
call npm run dev:server

endlocal
