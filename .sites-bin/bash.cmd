@echo off
"C:\Program Files\Git\bin\bash.exe" -lc "exec \"$(cygpath -u \"$0\")\" \"$(cygpath -u \"$1\")\" \"$(cygpath -u \"$2\")\"" "%~1" "%~2" "%~3"
