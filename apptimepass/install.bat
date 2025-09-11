@echo off
:: ======= CONTROLLA SE E' IN ESECUZIONE COME ADMINISTRATORE =======
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Devi eseguire questo script come amministratore!
    echo.
    powershell -Command "Start-Process '%~f0' -Verb runAs"
    exit /b
)
:: ======= FINE CONTROLLO =======

REM === Installazione AppTimePass ===

REM 1. Crea la cartella di destinazione (se non esiste)
set "DEST_DIR=C:\Program Files\AppTimePass"
if not exist "%DEST_DIR%" (
    mkdir "%DEST_DIR%"
)

REM 2. Copia AppTimePass.exe nella cartella di destinazione
copy /Y "%~dp0AppTimePass.exe" "%DEST_DIR%\AppTimePass.exe"

REM 3. Crea il collegamento in Startup globale (avvio per TUTTI gli utenti)
set "EXE_PATH=%DEST_DIR%\AppTimePass.exe"
set "STARTUP_GLOBAL=C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp"

powershell -Command ^
    "$s=(New-Object -COM WScript.Shell).CreateShortcut('%STARTUP_GLOBAL%\AppTimePass.lnk');" ^
    "$s.TargetPath='%EXE_PATH%';" ^
    "$s.IconLocation='%EXE_PATH%';" ^
    "$s.Save()"

echo.
echo [OK] AppTimePass installata in: %DEST_DIR%
echo [OK] Collegamento di avvio creato per tutti gli utenti!
echo.

REM 4. Avvia subito AppTimePass
start "" "%EXE_PATH%"

echo [OK] AppTimePass avviata!
echo.

pause
