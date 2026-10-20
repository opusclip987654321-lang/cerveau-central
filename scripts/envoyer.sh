#!/bin/sh
# Lance une commande, l'affiche à l'écran comme d'habitude, puis envoie sa sortie au cerveau
# (POST /api/sorties) : le fil Claude la relit lui-même, louis n'a plus rien à coller.
# Usage, depuis le VPS Nūr :
#   ~/cerveau-central/scripts/envoyer.sh python3 scripts/nour-meet-etat.py
#   ~/cerveau-central/scripts/envoyer.sh "docker ps | grep cerveau"
#   ~/cerveau-central/scripts/envoyer.sh -n verif-caddy "docker logs caddy --tail 50"
# -n nom : le nom sous lequel le fil retrouvera la sortie (par défaut, le script lancé).
# La commande tourne depuis ~/cerveau-central. Seul RELEVE_JETON est lu dans le .env ;
# le cerveau masque ensuite tout ce qui ressemble à un jeton avant de garder la sortie.
set -u
ICI=$(cd "$(dirname "$0")/.." && pwd)

NOM=""
if [ "${1:-}" = "-n" ]; then NOM=${2:-}; shift 2; fi
if [ $# -eq 0 ]; then
  echo "Usage : scripts/envoyer.sh [-n nom] commande..." >&2
  exit 2
fi
COMMANDE=$*
if [ -z "$NOM" ]; then
  for mot in "$@"; do
    case "$mot" in *.py|*.sh) NOM=$(basename "$mot"); break ;; esac
  done
  [ -n "$NOM" ] || NOM=$(printf '%s' "$1" | awk '{print $1}' | xargs basename 2>/dev/null)
fi

# Le jeton et l'adresse : le .env du cerveau, sinon ~/.cerveau-releve (autres serveurs).
JETON=$(sed -n 's/^[[:space:]]*RELEVE_JETON[[:space:]]*=[[:space:]]*//p' "$ICI/.env" 2>/dev/null | tail -n 1 | tr -d "\"'\r")
URL=${CERVEAU_URL:-http://127.0.0.1:8090}
SERVEUR=$(hostname)
if [ -z "$JETON" ] && [ -f "$HOME/.cerveau-releve" ]; then
  . "$HOME/.cerveau-releve"
  JETON=${RELEVE_JETON:-}
  URL=${CERVEAU_URL:-$URL}
  SERVEUR=${SERVEUR:-$(hostname)}
fi

SORTIE=$(mktemp)
CODE=$(mktemp)
trap 'rm -f "$SORTIE" "$CODE"' EXIT
DEBUT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# Python sans tampon : la sortie s'affiche au fil de l'eau malgré le tee.
# Un seul argument entre guillemets = une ligne de shell (tubes, ;) ; plusieurs = lancés tels quels.
{ (cd "$ICI" && export PYTHONUNBUFFERED=1 && if [ $# -eq 1 ]; then sh -c "$1"; else "$@"; fi) 2>&1; echo $? >"$CODE"; } | tee "$SORTIE"
RETOUR=$(cat "$CODE")
FIN=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ -z "$JETON" ]; then
  echo "(Pas de RELEVE_JETON trouvé : sortie NON envoyée au cerveau.)" >&2
  exit "$RETOUR"
fi
ID=$({
  printf 'script: %s\ncommande: %s\ncode: %s\ndebut: %s\nfin: %s\nserveur: %s\n\n' "$NOM" "$(printf '%s' "$COMMANDE" | tr '\r\n' '  ')" "$RETOUR" "$DEBUT" "$FIN" "$SERVEUR"
  tail -c 1900000 "$SORTIE"
} | curl -fsS -m 30 -X POST -H "Authorization: Bearer $JETON" -H 'content-type: text/plain; charset=utf-8' \
    --data-binary @- "$URL/api/sorties" 2>&1)
if [ $? -eq 0 ]; then
  echo "--- Sortie envoyée au cerveau ($NOM, code $RETOUR, n° $ID) : rien à coller, dis juste « fait » dans le fil."
else
  echo "--- Envoi au cerveau raté ($ID) : copie la sortie ci-dessus dans le fil." >&2
fi
exit "$RETOUR"
