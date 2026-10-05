#!/usr/bin/env python3
"""Ajoute dans le n8n principal l'automatisation « CERVEAU - lecture Cambodge ».

Elle lit les mails étiquetés « Cambodge » dans la boîte Gmail de louis quand le
cerveau l'appelle (adresse secrète tirée de RELEVE_JETON) et ne fait rien d'autre.
Créée ÉTEINTE et sans accès : louis choisit le compte « Gmail Walid » sur le nœud
Gmail dans n8n, enregistre, puis allume l'automatisation.
À lancer une fois sur le VPS Nūr : python3 scripts/cambodge-n8n.py
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

NOM = "CERVEAU - lecture Cambodge"

env = {}
for ligne in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

base = (env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/")
cle = env.get("N8N_API_KEY")
jeton = env.get("RELEVE_JETON")
if not cle or not jeton:
    sys.exit("Il manque N8N_API_KEY ou RELEVE_JETON dans .env")
chemin = "cerveau-cambodge-" + hashlib.sha256(("cambodge:" + jeton).encode()).hexdigest()[:32]


def api(methode, url, corps=None):
    req = urllib.request.Request(
        base + url,
        method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"X-N8N-API-KEY": cle, "accept": "application/json", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "{}")


workflows = api("GET", "/api/v1/workflows?limit=250")["data"]
existant = next((w for w in workflows if w["name"] == NOM), None)
if existant:
    print(f"« {NOM} » existe déjà (id {existant['id']}).")
else:
    workflow = {
        "name": NOM,
        "nodes": [
            {
                "id": "a1",
                "name": "Appel du cerveau",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 2,
                "position": [0, 0],
                "webhookId": chemin,
                "parameters": {"path": chemin, "httpMethod": "GET", "responseMode": "responseNode", "options": {}},
            },
            {
                "id": "a2",
                "name": "Lire les mails Cambodge",
                "type": "n8n-nodes-base.gmail",
                "typeVersion": 2.1,
                "position": [240, 0],
                "parameters": {
                    "operation": "getAll",
                    "limit": 100,
                    "simple": True,
                    "filters": {"q": "label:cambodge"},
                },
                "alwaysOutputData": True,
            },
            {
                "id": "a3",
                "name": "Répondre",
                "type": "n8n-nodes-base.respondToWebhook",
                "typeVersion": 1.1,
                "position": [480, 0],
                "parameters": {"respondWith": "allIncomingItems", "options": {}},
            },
        ],
        "connections": {
            "Appel du cerveau": {"main": [[{"node": "Lire les mails Cambodge", "type": "main", "index": 0}]]},
            "Lire les mails Cambodge": {"main": [[{"node": "Répondre", "type": "main", "index": 0}]]},
        },
        "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none"},
    }
    cree = api("POST", "/api/v1/workflows", workflow)
    print(f"« {NOM} » créée (id {cree['id']}), éteinte pour l'instant.")
    print("Dans n8n : ouvre-la, clique sur « Lire les mails Cambodge », choisis le compte")
    print("« Gmail Walid » (Credential), Save, puis allume l'automatisation (bouton Active).")

# Essai : le cerveau peut-il déjà lire ?
try:
    with urllib.request.urlopen(f"{base}/webhook/{chemin}", timeout=60) as r:
        lignes = json.loads(r.read() or "[]")
    lignes = lignes if isinstance(lignes, list) else [lignes]
    print(f"Lecture OK : {len(lignes)} mail(s) étiquetés Cambodge.")
except Exception as err:  # noqa: BLE001
    print("Lecture pas encore possible (normal tant que l'automatisation n'est pas allumée) :", err)
