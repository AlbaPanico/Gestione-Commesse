@echo off
setlocal
set "SRC=\\192.168.1.250\users\applicazioni\gestione commesse\releases\ApptimepassV2\ApptimepassV2-Setup.exe"
if not exist "%%SRC%%" (
  echo Installer non trovato: %%SRC%%
  pause
  exit /b 1
)
powershell -NoProfile -Command "Start-Process -FilePath '%%SRC%%' -ArgumentList '/VERYSILENT /NORESTART' -Verb RunAs -Wait"
if errorlevel 1 (
  echo Installazione fallita.
  pause
  exit /b 1
)
echo Installazione completata. L'app partira' ora e ad ogni accesso.
timeout /t 5 >nul
