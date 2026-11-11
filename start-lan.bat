@echo off
chcp 65001 >nul
title Dreamland LAN
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
echo 같은 공유기에 연결된 휴대폰에서도 접속할 수 있게 엽니다. 믿을 수 있는 네트워크에서만 사용하세요.
node server.js --lan --open %*
if errorlevel 1 pause
