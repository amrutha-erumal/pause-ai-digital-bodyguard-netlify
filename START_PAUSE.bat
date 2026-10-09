@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PAUSE - AI Digital Bodyguard

echo.
echo  =============================================
echo    PAUSE - AI Digital Bodyguard
echo  =============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Install Node.js 24 LTS from https://nodejs.org/en/download
  echo Then reopen this folder and double-click START_PAUSE.bat again.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%V
if not "%NODE_MAJOR%"=="24" (
  echo NOTE: This project targets Node.js 24.x. Your version is Node.js %NODE_MAJOR%.
  echo If anything behaves unexpectedly, install Node.js 24 LTS.
  echo.
)

if not exist package.json (
  echo ERROR: package.json is missing. Extract the entire project ZIP first.
  pause
  exit /b 1
)

if not exist .env (
  if exist .env.example (
    copy /Y .env.example .env >nul
    echo Created a local .env file from .env.example.
    echo Add your Gemini key to .env to enable real AI analysis.
    echo The .env file is ignored by Git and must never be uploaded.
    echo.
  )
)

if not exist node_modules\@google\genai\package.json (
  echo Installing PAUSE dependencies. This may take a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo WARNING: Dependency installation failed. PAUSE can still open in local
    echo fallback mode, but real Gemini analysis will not work until npm install succeeds.
    echo Check your internet connection, then run npm install in this folder.
    echo.
  )
)

echo Starting PAUSE server. Keep the server window open while using the website.
start "PAUSE Server" cmd /k "cd /d ""%~dp0"" && npm start"
timeout /t 3 /nobreak >nul
start "" "http://localhost:8080"
echo.
echo PAUSE should open at http://localhost:8080
 echo To stop it, close the PAUSE Server command window.
echo.
pause
