@echo off
setlocal
cd /d "%~dp0"

echo KAPWA Hermes Tunnel
echo.

curl -s http://127.0.0.1:3000/api/hermes/health >nul 2>nul
if errorlevel 1 (
  echo ERROR: Hermes is not reachable at http://127.0.0.1:3000
  echo Keep start-kapwa-hermes.bat running, then try again.
  pause
  exit /b 1
)

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Installing Cloudflare Tunnel...
  winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo ERROR: Cloudflare Tunnel could not be installed.
    pause
    exit /b 1
  )
)

echo.
echo Starting secure public tunnel to Hermes...
echo Copy the https://...trycloudflare.com URL shown below and send it to ChatGPT.
echo Keep this window open while KAPWA is using Hermes.
echo.
cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate

endlocal
