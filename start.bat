@echo off
chcp 65001 >nul
title Dreamland
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 가 필요합니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo Node.js 18 이상이 필요합니다. https://nodejs.org 에서 새 버전을 설치해 주세요.
  pause
  exit /b 1
)
node server.js --open %*
if errorlevel 1 pause
