#!/bin/bash
#
# Copia el código a la VPS y corre el instalador.
#
#   VPS=root@1.2.3.4 deploy/subir.sh              # con clave/agente SSH
#   VPS=root@1.2.3.4 SSHPASS=... deploy/subir.sh  # o password, si no hay clave
#
# Ni credenciales ni el host adentro, a propósito: este repo es público.
#
set -euo pipefail

VPS=${VPS:?definí VPS, por ejemplo: VPS=root@1.2.3.4 deploy/subir.sh}
DESTINO=/opt/clima-uy
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

if [ -n "${SSHPASS:-}" ]; then
  command -v sshpass > /dev/null || { echo "falta sshpass" >&2; exit 1; }
  SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new)
  RSYNC_RSH="sshpass -e ssh -o StrictHostKeyChecking=accept-new"
else
  SSH=(ssh -o StrictHostKeyChecking=accept-new)
  RSYNC_RSH="ssh -o StrictHostKeyChecking=accept-new"
fi

echo "▸ Copiando a $VPS:$DESTINO"
"${SSH[@]}" "$VPS" "mkdir -p $DESTINO"

# Solo lo que hace falta para correr. Sin .git, sin dist, sin node_modules.
rsync -az --delete --rsh="$RSYNC_RSH" \
  --exclude '.git' --exclude 'dist' --exclude 'node_modules' \
  "$RAIZ"/{server.js,package.json} "$RAIZ"/lib "$RAIZ"/public "$RAIZ"/deploy \
  "$VPS:$DESTINO/"

echo "▸ Instalando"
"${SSH[@]}" "$VPS" "bash $DESTINO/deploy/instalar.sh"
