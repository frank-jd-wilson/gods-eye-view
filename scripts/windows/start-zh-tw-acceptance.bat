@echo off
setlocal EnableExtensions DisableDelayedExpansion
title God's Eye View - zh-TW acceptance
rem ASCII output avoids Windows console code-page dependencies.
set "GEV_DIR=F:\Digital Twin\gods-eye-view"
set "GEV_REPO=https://github.com/frank-jd-wilson/gods-eye-view.git"
set "GEV_BRANCH=feature/zh-tw-localization"
set "GEV_URL=http://127.0.0.1:4175/?lang=zh-TW"

where node.exe >nul 2>&1
if errorlevel 1 goto :missing_node
node.exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===24&&b>=14)||a===26?0:1)"
if errorlevel 1 goto :missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :missing_node
where git.exe >nul 2>&1
if errorlevel 1 goto :missing_git
if not exist "F:\" goto :missing_drive

if exist "%GEV_DIR%" goto :existing
echo Cloning your Fork and zh-TW branch into "%GEV_DIR%"...
git.exe clone --single-branch --branch "%GEV_BRANCH%" "%GEV_REPO%" "%GEV_DIR%"
if errorlevel 1 goto :failed
git.exe -C "%GEV_DIR%" config --local gev.zhTwAcceptance true
if errorlevel 1 goto :failed
goto :validate

:existing
rem Only reuse a checkout created by this launcher. Never adopt a Pinokio install.
set "GEV_MANAGED="
for /f "delims=" %%G in ('git.exe -C "%GEV_DIR%" config --local --get gev.zhTwAcceptance 2^>nul') do set "GEV_MANAGED=%%G"
if not "%GEV_MANAGED%"=="true" goto :occupied

:validate
set "GEV_ORIGIN="
for /f "delims=" %%G in ('git.exe -C "%GEV_DIR%" remote get-url origin 2^>nul') do set "GEV_ORIGIN=%%G"
if not "%GEV_ORIGIN%"=="%GEV_REPO%" goto :wrong_checkout
set "GEV_CURRENT="
for /f "delims=" %%G in ('git.exe -C "%GEV_DIR%" branch --show-current 2^>nul') do set "GEV_CURRENT=%%G"
if not "%GEV_CURRENT%"=="%GEV_BRANCH%" goto :wrong_checkout
set "GEV_DIRTY="
for /f "delims=" %%G in ('git.exe -C "%GEV_DIR%" status --porcelain --untracked-files=normal') do set "GEV_DIRTY=1"
if defined GEV_DIRTY goto :dirty
git.exe -C "%GEV_DIR%" fetch origin "%GEV_BRANCH%"
if errorlevel 1 goto :failed
rem Refuse local commits or divergence; never reset, clean, stash, or change branches.
git.exe -C "%GEV_DIR%" merge-base --is-ancestor HEAD "origin/%GEV_BRANCH%"
if errorlevel 1 goto :diverged
git.exe -C "%GEV_DIR%" merge --ff-only "origin/%GEV_BRANCH%"
if errorlevel 1 goto :failed
cd /d "%GEV_DIR%"
if errorlevel 1 goto :failed
echo.
echo Repository: %GEV_REPO%
echo Branch: %GEV_BRANCH%
git.exe rev-parse HEAD
node.exe --version
call npm.cmd --version
if errorlevel 1 goto :failed
rem Browser QA dependencies do not need a separate Puppeteer Chrome download.
set "PUPPETEER_SKIP_DOWNLOAD=true"
rem Only refresh dependencies when the lockfile or Node version changes.
node.exe -e "const f=require('fs'),c=require('crypto');const s=c.createHash('sha256').update(f.readFileSync('package-lock.json')).update(process.version).digest('hex');process.exit(f.existsSync('node_modules/.gev-zh-tw-install')&&f.readFileSync('node_modules/.gev-zh-tw-install','utf8')===s&&f.existsSync('node_modules/vite/bin/vite.js')?0:1)"
if not errorlevel 1 goto :start
echo Installing locked dependencies with npm.cmd ci...
call npm.cmd ci
if errorlevel 1 goto :failed
node.exe -e "const f=require('fs'),c=require('crypto');f.writeFileSync('node_modules/.gev-zh-tw-install',c.createHash('sha256').update(f.readFileSync('package-lock.json')).update(process.version).digest('hex'))"
if errorlevel 1 goto :failed

:start
echo.
echo Open in Firefox or Edge: %GEV_URL%
echo Keep this window open. Press Ctrl+C to stop the server.
echo If port 4175 is occupied, this launcher stops instead of choosing another port.
echo No API keys are required for the basic map and localization review.
call npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort --open "/?lang=zh-TW"
if errorlevel 1 goto :failed
goto :done

:missing_node
echo Node.js 24.x ^(24.14.0 or newer^) or 26.x with npm.cmd is required.
echo Install from https://nodejs.org/en/download then reopen this launcher.
goto :failed
:missing_git
echo Git for Windows is required: https://git-scm.com/downloads/win
echo Install it, then reopen this launcher.
goto :failed
:missing_drive
echo Drive F: is unavailable. No installation was created.
goto :failed
:occupied
echo STOP: "%GEV_DIR%" already exists and is not managed by this launcher.
echo Existing files were not changed. Do not point this launcher at Pinokio.
echo Choose a separate empty destination by editing GEV_DIR in a copy of this file.
goto :failed
:wrong_checkout
echo STOP: The existing checkout has a different origin or branch.
goto :failed
:dirty
echo STOP: The checkout contains local changes or untracked files. Preserve them first.
goto :failed
:diverged
echo STOP: Local commits differ from GitHub. No reset or merge was attempted.
goto :failed
:failed
echo.
echo Launch did not complete. Read the error above; no system security settings were changed.
echo A failed clone may leave a partial directory. Inspect it manually before retrying.
pause
exit /b 1
:done
pause
exit /b 0
