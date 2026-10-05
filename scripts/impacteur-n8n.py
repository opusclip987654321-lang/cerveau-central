#!/usr/bin/env python3
"""Ajoute dans le n8n principal l'automatisation « CERVEAU - lecture Impacteur ».

Elle lit l'onglet Prospection du Google Sheet d'Impacteur quand le cerveau l'appelle
(adresse secrète tirée de RELEVE_JETON) et ne fait rien d'autre. Le nœud Google
Sheets est recopié de « IMPACTEUR C - ENVOIS AUTOMATIQUES » (même document, même
accès Google). À lancer une fois sur le VPS Nūr : python3 scripts/impacteur-n8n.py
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

NOM = "CERVEAU - lecture Impacteur"
SOURCE = "IMPACTEUR C - ENVOIS AUTOMATIQUES"
NOEUD_SOURCE = "LIRE FICHES"

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
chemin = "cerveau-impacteur-" + hashlib.sha256(("impacteur:" + jeton).encode()).hexdigest()[:32]


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
    source = next((w for w in workflows if w["name"] == SOURCE), None)
    if not source:
        sys.exit(f"Automatisation « {SOURCE} » introuvable.")
    sheets = next((n for n in source["nodes"] if n["name"] == NOEUD_SOURCE), None)
    if not sheets:
        sys.exit(f"Nœud « {NOEUD_SOURCE} » introuvable dans « {SOURCE} ».")
    # Même document et même onglet, mais toutes les lignes : pas de filtre.
    params = {k: v for k, v in sheets["parameters"].items() if k in ("authentication", "documentId", "sheetName")}
    params["operation"] = "read"
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
                "name": "Lire Prospection",
                "type": sheets["type"],
                "typeVersion": sheets["typeVersion"],
                "position": [240, 0],
                "parameters": params,
                "credentials": sheets.get("credentials", {}),
                "executeOnce": True,
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
            "Appel du cerveau": {"main": [[{"node": "Lire Prospection", "type": "main", "index": 0}]]},
            "Lire Prospection": {"main": [[{"node": "Répondre", "type": "main", "index": 0}]]},
        },
        "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none"},
    }
    cree = api("POST", "/api/v1/workflows", workflow)
    api("POST", f"/api/v1/workflows/{cree['id']}/activate")
    print(f"« {NOM} » ajoutée et allumée (id {cree['id']}).")

# Essai : le cerveau pourra-t-il lire le Sheet ?
try:
    with urllib.request.urlopen(f"{base}/webhook/{chemin}", timeout=60) as r:
        lignes = json.loads(r.read() or "[]")
    lignes = lignes if isinstance(lignes, list) else [lignes]
    print(f"Lecture OK : {len(lignes)} ligne(s).")
    if lignes:
        print("Colonnes :", ", ".join(lignes[0].keys()))
        statuts = {}
        for l in lignes:
            s = str(l.get("statut") or l.get("Statut") or l.get("status") or "?")
            statuts[s] = statuts.get(s, 0) + 1
        print("Statuts :", json.dumps(statuts, ensure_ascii=False))
except Exception as err:  # noqa: BLE001
    print("Lecture impossible :", err)
