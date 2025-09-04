Set WshShell = CreateObject("WScript.Shell")
' Imposta la cartella di lavoro
WshShell.CurrentDirectory = "C:\Users\Applicazioni\Gestione Commesse"
' Lancia il comando in background SENZA aprire nessuna finestra
WshShell.Run "cmd.exe /c start """" /B npm run start-all", 0, False
