#!/bin/bash
# Lanzador de Pomodoro Pro
# Arranca el servidor y abre el navegador automáticamente

cd "$(dirname "$0")"

echo ""
echo "🍅 Iniciando Pomodoro Pro..."

# Arrancar Flask en segundo plano
python3 app.py &
SERVER_PID=$!

# Esperar a que el servidor esté listo
sleep 2

# Abrir en el navegador predeterminado
open "http://localhost:5050"

echo "   Servidor activo (PID $SERVER_PID)"
echo "   Cierra esta ventana para detener Pomodoro Pro"
echo ""

# Mantener el script vivo (Ctrl+C para parar)
wait $SERVER_PID
