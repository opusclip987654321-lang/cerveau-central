#!/bin/sh
# Affiche la clé des loops sur l'abonnement Claude, tirée de RELEVE_JETON (src/cle-loops.js).
# louis la colle une fois dans le fil qui crée les tâches programmées ; elle n'ouvre que /api/loop/*
# et la lecture de /api/code, /api/decisions, /api/sorties.
ICI=$(cd "$(dirname "$0")/.." && pwd)
JETON=$(sed -n 's/^[[:space:]]*RELEVE_JETON[[:space:]]*=[[:space:]]*//p' "$ICI/.env" 2>/dev/null | tail -n 1 | tr -d "\"'\r")
[ -n "$JETON" ] || { echo "RELEVE_JETON introuvable dans $ICI/.env" >&2; exit 1; }
printf 'loops-abonnement:%s' "$JETON" | sha256sum | cut -c1-40
