@echo off
chcp 65001 >nul
title Dreamland - update (LAN)
cd /d "%~dp0"

rem 업데이트를 받은 뒤 드림랜드를 켠다. 업데이트가 안 되어도 켜지기는 한다.
if not exist ".git" goto nogit
where git >nul 2>nul
if errorlevel 1 goto nogitcmd

echo 업데이트를 확인하는 중...
git pull --ff-only
if errorlevel 1 goto pullfail
echo.
goto run

:nogit
echo 이 폴더는 ZIP 으로 받은 것이라 자동 업데이트를 할 수 없습니다.
echo 새 ZIP 을 받아 data 폴더만 남기고 덮어쓰거나, git clone 으로 다시 받아 주세요.
echo 지금 있는 버전으로 실행합니다.
echo.
timeout /t 4 >nul
goto run

:nogitcmd
echo git 이 설치되어 있지 않아 업데이트를 건너뜁니다. https://git-scm.com 에서 설치할 수 있습니다.
echo 지금 있는 버전으로 실행합니다.
echo.
timeout /t 4 >nul
goto run

:pullfail
echo.
echo 업데이트를 받지 못했습니다. 인터넷 연결을 확인해 주세요.
echo 폴더 안의 파일을 직접 고쳤다면 그 때문일 수도 있습니다.
echo 지금 있는 버전으로 실행합니다.
echo.
timeout /t 5 >nul

:run
call "%~dp0start-lan.bat" %*
