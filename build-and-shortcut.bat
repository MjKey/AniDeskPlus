@echo off
chcp 65001 > nul

echo ==============================================
echo AniDeskPlus - Build and Create Shortcut
echo ==============================================
echo.

echo Step 1: Build web resources...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Step 2: Package application...
call npm run package
if %ERRORLEVEL% neq 0 (
    echo ERROR: Package failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Step 3: Creating Desktop shortcut...

set "EXE_PATH=%~dp0out\AniDesk-win32-x64\AniDesk.exe"
set "WORK_DIR=%~dp0out\AniDesk-win32-x64"
set "SHORTCUT=%USERPROFILE%\Desktop\AniDesk.lnk"

if exist "%EXE_PATH%" (
    powershell -NoProfile -NonInteractive -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%EXE_PATH%'; $s.WorkingDirectory = '%WORK_DIR%'; $s.Description = 'AniDeskPlus'; $s.Save()"
    if %ERRORLEVEL% equ 0 (
        echo SUCCESS! Shortcut created at: %SHORTCUT%
    ) else (
        echo ERROR: Failed to create shortcut!
    )
) else (
    echo ERROR: Executable not found at: %EXE_PATH%
    echo Make sure packaging completed successfully.
)

echo.
echo Done!
pause
