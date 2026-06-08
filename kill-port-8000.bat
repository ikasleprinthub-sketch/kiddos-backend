@echo off
echo Searching for process using port 8000...
set "pid="
for /f "tokens=5" %%a in ('%SystemRoot%\System32\netstat.exe -aon ^| %SystemRoot%\System32\findstr.exe /r /c:":8000 *LISTENING"') do (
    set "pid=%%a"
)

if defined pid (
    echo Found process with PID %pid% using port 8000. Killing it...
    %SystemRoot%\System32\taskkill.exe /F /PID %pid%
) else (
    echo No active process found listening on port 8000.
)
pause
