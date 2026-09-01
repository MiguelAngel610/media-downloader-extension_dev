@echo off
echo Abriendo el instalador del backend...
py "install_host.py"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ----------------------------------------------------
    echo ¡Error! No se pudo abrir la interfaz de instalacion.
    echo Asegurate de tener Python instalado.
    echo ----------------------------------------------------
    pause
)
