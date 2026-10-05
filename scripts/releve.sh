#!/bin/sh
# Relevé d'un VPS pour le cerveau central : place, mémoire, conteneurs Docker.
# Lancé chaque heure par cron ; n'écrit rien, ne modifie rien, envoie juste le relevé.
# Réglages dans ~/.cerveau-releve :
#   CERVEAU_URL=https://cerveau.nourmeet.com
#   RELEVE_JETON=...      (le même que dans le .env du cerveau)
#   SERVEUR=vps-youtube   (id du serveur dans config/serveurs.json)
set -u
. "$HOME/.cerveau-releve"

section() { printf '### %s\n' "$1"; }
{
  section hote; hostname
  section coeurs; nproc
  section charge; cat /proc/loadavg
  section memoire; grep -E '^(MemTotal|MemAvailable):' /proc/meminfo
  section disques; df -B1 -P -x tmpfs -x devtmpfs -x overlay -x squashfs -x efivarfs 2>/dev/null | tail -n +2
  if command -v docker >/dev/null 2>&1; then
    section conteneurs; docker ps -a --size --format '{{json .}}' 2>/dev/null
    section stats; docker stats --no-stream --format '{{json .}}' 2>/dev/null
    section docker; docker system df --format '{{json .}}' 2>/dev/null
    section volumes; docker system df -v --format '{{json .Volumes}}' 2>/dev/null
  fi
  section dossiers; du -sxB1 /opt/* "$HOME"/* 2>/dev/null | sort -rn | head -n 20
} | curl -fsS -m 60 -X POST -H "Authorization: Bearer $RELEVE_JETON" -H 'content-type: text/plain' \
    --data-binary @- "$CERVEAU_URL/api/releve?serveur=$SERVEUR"
