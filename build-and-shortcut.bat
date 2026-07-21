@echo off
chcp 65001 > nul

echo ==============================================
echo AniDeskPlus - Build and Create Shortcut
echo ==============================================
echo.

echo Select build mode:
echo [1] Fast Build (Recommended for local testing - no Terser compression, 5-10s)
echo [2] Production Build (Full minification)
echo.
choice /C 12 /N /D 1 /T 5 /M "Select option (1 or 2, auto-select [1] in 5s): "

if errorlevel 2 (
    echo.
    echo [INFO] Running Production Build with lower CPU priority...
    set "FAST_BUILD=false"
) else (
    echo.
    echo [INFO] Running Fast Build...
    set "FAST_BUILD=true"
)

echo.
echo Step 1: Build web resources...
start /belowNormal /wait cmd /c "set FAST_BUILD=%FAST_BUILD% && npm run build"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Step 2: Package application...
start /belowNormal /wait cmd /c "npm run package"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Package failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Step 3: Creating Desktop shortcut...

set "EXE_PATH=%~dp0out\AniDeskPlus-win32-x64\AniDeskPlus.exe"
set "WORK_DIR=%~dp0out\AniDeskPlus-win32-x64"
set "SHORTCUT=%USERPROFILE%\Desktop\AniDeskPlus.lnk"

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
