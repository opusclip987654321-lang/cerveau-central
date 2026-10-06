#!/usr/bin/env python3
"""Exporte, en LECTURE SEULE, la structure complète d'automatisations n8n.

À lancer sur le VPS Nūr puis coller la sortie dans le fil Claude :
    python3 scripts/export-n8n.py
(par défaut : Nour Meet 1, Nour Meet 3 et toutes les automatisations dont le
nom commence par IMPACTEUR ; on peut passer d'autres noms en arguments)

Le script ne modifie rien. Les accès (credentials) ne sortent que par leur
nom ; aucune clé ni mot de passe n'apparaît : les nœuds n8n n'en contiennent pas.
"""
import json
import pathlib
import sys
import urllib.request

PAR_DEFAUT = [
    "Nour Meet 1 - Recherche et envoi automatique",
    "Nour Meet 3 - Relances automatiques",
]

env = {}
for ligne in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

base = (env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/")
cle = env.get("N8N_API_KEY") or sys.exit("N8N_API_KEY manquant dans .env")

req = urllib.request.Request(base + "/api/v1/workflows?limit=250", headers={"X-N8N-API-KEY": cle, "accept": "application/json"})
with urllib.request.urlopen(req, timeout=30) as r:
    workflows = json.loads(r.read())["data"]

noms = sys.argv[1:] or PAR_DEFAUT + sorted(x["name"] for x in workflows if x["name"].upper().startswith("IMPACTEUR"))
for nom in noms:
    w = next((x for x in workflows if x["name"] == nom), None)
    if not w:
        print(f"\n### « {nom} » : introuvable.")
        continue
    print(f"\n### {w['name']} [{'ON' if w.get('active') else 'off'}]")
    for n in w["nodes"]:
        if n.get("type") == "n8n-nodes-base.stickyNote":
            continue
        acces = {k: (v or {}).get("name") for k, v in (n.get("credentials") or {}).items()}
        print(f"\n-- {n['name']} ({n['type']})" + (f" accès={json.dumps(acces, ensure_ascii=False)}" if acces else ""))
        print(json.dumps(n.get("parameters", {}), ensure_ascii=False))
    print("\nconnections =", json.dumps(w["connections"], ensure_ascii=False))
print("\nFini. Colle toute cette sortie dans le fil Claude.")
