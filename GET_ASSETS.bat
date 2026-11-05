@echo off
cd /d "%~dp0"
echo Downloading realistic scenery for Everway (about 50-150 MB)...
where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3 get_assets.py
) else (
    python get_assets.py
)
pause
