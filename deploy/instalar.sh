#!/bin/bash
#
# Instala Clima UY en la VPS. Idempotente: se puede correr de nuevo sin romper.
#
# Se ejecuta COMO ROOT EN LA VPS, con el código ya copiado en /opt/clima-uy.
# Lo llama deploy/subir.sh desde la máquina local.
#
# ⚠️  Esta VPS corre el scanner OSINT (barrido de 2.5M IPs, 04:00-18:00 UY,
#     pico 1 GB de 1.9 GB, sin swap). Este script:
#       - NO toca nada bajo /home/deploy ni las units de osint
#       - NO hace apt upgrade / dist-upgrade
#       - instala solo desde los repos oficiales de Debian
#       - deja el servicio con límites de cgroup para no competirle memoria
#
set -euo pipefail

DESTINO=/opt/clima-uy
DOMINIO=api-clima.anderkitty.pink

msg() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# --- Guarda: no correr mientras el barrido está activo ----------------------
if pgrep -x scanner > /dev/null 2>&1; then
  echo "El scanner OSINT está corriendo ahora mismo." >&2
  echo "Instalá cuando termine (corre 04:00-18:00 hora UY), o forzá con FORZAR=1." >&2
  [ "${FORZAR:-0}" = "1" ] || exit 1
fi

msg "Paquetes (solo repos de Debian, sin upgrade)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends nodejs caddy
node --version
caddy version | head -1

msg "Servicio Node"
id -u deploy > /dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin deploy
chown -R deploy:deploy "$DESTINO"
install -m 644 "$DESTINO/deploy/clima-uy.service" /etc/systemd/system/clima-uy.service

msg "Caddy (TLS automático)"
install -d -m 755 /var/log/caddy
chown caddy:caddy /var/log/caddy
install -m 644 "$DESTINO/deploy/Caddyfile" /etc/caddy/Caddyfile
install -d -m 755 /etc/systemd/system/caddy.service.d
install -m 644 "$DESTINO/deploy/caddy-limites.conf" /etc/systemd/system/caddy.service.d/limites.conf
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

msg "Arrancando"
systemctl daemon-reload
systemctl enable --now clima-uy.service
systemctl reload-or-restart caddy.service

sleep 3
msg "Estado"
systemctl is-active clima-uy.service caddy.service || true
systemctl show clima-uy.service -p MemoryCurrent -p MemoryMax --value | paste -sd' / '

msg "Prueba local (sin pasar por TLS)"
curl -sf -o /dev/null -w 'api/ahora.json → HTTP %{http_code} en %{time_total}s\n' \
  http://127.0.0.1:8080/api/ahora.json || echo "FALLÓ"

echo
if getent hosts "$DOMINIO" > /dev/null 2>&1; then
  msg "DNS ya resuelve — probando HTTPS"
  curl -sf -o /dev/null -w "https://$DOMINIO → HTTP %{http_code}\n" "https://$DOMINIO/api/ahora.json" \
    || echo "Todavía no; Caddy puede tardar en emitir el certificado."
else
  echo "⚠  $DOMINIO todavía no resuelve."
  echo "   Creá el registro A ($DOMINIO → $(curl -s4 --max-time 5 ifconfig.me || echo 'la IP de esta VPS'))"
  echo "   y Caddy pide el certificado solo, sin reinstalar nada."
fi
