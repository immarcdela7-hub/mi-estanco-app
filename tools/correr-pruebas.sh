#!/usr/bin/env bash
# Lanza las baterias reiniciando el servidor ANTES de cada una.
#
# Por que: el servidor multihilo de Python aguanta bien una bateria, pero al
# encadenarlas se degrada y la siguiente falla por timeout en page.goto. Son
# falsos negativos (la misma bateria pasa sola). Con 125 tarjetas cada pagina
# pide bastante mas que antes y se nota.
#
#   bash tools/correr-pruebas.sh                    # todas
#   bash tools/correr-pruebas.sh test-web test-plans # las que digas
set -u
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BATERIAS=("$@")
if [ ${#BATERIAS[@]} -eq 0 ]; then
  BATERIAS=(test-web test-picks test-plans test-reservas test-disponibilidad test-gyg-widgets test-distintivos)
fi

arrancar_servidor() {
  local pid
  pid=$(netstat -ano 2>/dev/null | grep ':8099' | grep LISTENING | awk '{print $NF}' | head -1)
  [ -n "$pid" ] && taskkill //PID "$pid" //F >/dev/null 2>&1
  sleep 1
  # request_queue_size: por defecto son 5 conexiones en cola. Chrome abre muchas
  # a la vez y con 125 tarjetas se desborda: la navegacion se queda colgada y la
  # prueba falla por timeout sin que nada este roto.
  (cd "$RAIZ/web" && python -c "
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
class H(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
class S(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 256
S(('127.0.0.1',8099), H).serve_forever()
" >/dev/null 2>&1 &)
  for _ in $(seq 1 20); do
    curl -s -m 2 -o /dev/null http://127.0.0.1:8099/tickets.html && return 0
    sleep 1
  done
  return 1
}

fallos=0
for t in "${BATERIAS[@]}"; do
  [ -f "$RAIZ/tools/tests/$t.mjs" ] || { printf '%-22s (no existe)\n' "$t:"; continue; }
  # test-disponibilidad no usa navegador ni servidor.
  if [ "$t" != "test-disponibilidad" ]; then
    arrancar_servidor || { printf '%-22s (no arranca el servidor)\n' "$t:"; fallos=$((fallos+1)); continue; }
  fi
  printf '%-22s ' "$t:"
  salida=$(cd "$RAIZ/tools" && node "tests/$t.mjs" 2>&1)
  linea=$(printf '%s' "$salida" | grep -E '^=== .* pruebas OK ===')
  if [ -n "$linea" ]; then
    echo "$linea"
    printf '%s' "$salida" | grep -E '^ - ' | head -4
    printf '%s' "$salida" | grep -qE '^FAIL' && fallos=$((fallos+1))
  else
    echo "(error al ejecutar)"
    printf '%s' "$salida" | tail -4 | sed 's/^/    /'
    fallos=$((fallos+1))
  fi
done
echo
echo "baterias con fallos: $fallos"
