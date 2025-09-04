@echo off
cd /d "C:\Users\Applicazioni\Gestione Commesse"
REM — chiude tutti i processi node (come definito nello script stop-all)
start cmd /k "npm run stop-all & timeout /t 2 & exit"
