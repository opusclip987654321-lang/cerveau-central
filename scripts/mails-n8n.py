#!/usr/bin/env python3
"""Repère, en LECTURE SEULE, où brancher la copie du texte des mails.

À lancer une fois sur le VPS Nūr : python3 scripts/mails-n8n.py
Le script ne modifie rien dans n8n. Il affiche :
- les nœuds qui écrivent dans les tableaux np_envois et np_reponses
  (et leurs colonnes actuelles), pour y ajouter la colonne « corps » ;
- les nœuds d'envoi de mail de Nour Meet (où vit le texte envoyé) ;
- les nœuds d'Impacteur qui envoient le mail et écrivent dans le Sheet
  (pour les colonnes « corps » et « compte_envoi »).
La sortie ne contient aucun secret : seuls les noms des accès sont cités.
"""
import json
import pathlib
import sys
import urllib.request

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


def court(valeur, taille=240):
    texte = json.dumps(valeur, ensure_ascii=False)
    return texte if len(texte) <= taille else texte[:taille] + "…"


def montre(w, n, raison):
    p = n.get("parameters", {})
    print(f"\n[{'ON ' if w.get('active') else 'off'}] {w['name']} :: {n['name']} ({n.get('type')}) — {raison}")
    print(f"  accès : {list((n.get('credentials') or {}).keys())}")
    for champ in ("operation", "resource", "dataTableId", "documentId", "sheetName", "columns", "fieldsUi", "fields", "dataToSend", "subject", "toEmail", "fromEmail", "message", "text", "html", "emailType", "options"):
        if champ in p:
            print(f"  {champ} = {court(p[champ])}")


for w in workflows:
    for n in w.get("nodes", []):
        t = str(n.get("type", "")).lower()
        brut = json.dumps(n.get("parameters", {}), ensure_ascii=False)
        if "datatable" in t and ("np_envois" in brut or "np_reponses" in brut):
            table = "np_envois" if "np_envois" in brut else "np_reponses"
            montre(w, n, f"écrit ou lit {table}")
        elif ("emailsend" in t or "smtp" in t) and "NOUR" in w["name"].upper():
            montre(w, n, "envoi du mail (le texte envoyé passe ici)")
        elif "gmail" in t and "IMPACTEUR" in w["name"].upper() and str(n.get("parameters", {}).get("operation", "send")) in ("send", "sendAndWait", "create"):
            montre(w, n, "envoi (ou brouillon) du mail d'invitation")
        elif "googlesheets" in t.replace(".", "") and "IMPACTEUR" in w["name"].upper() and str(n.get("parameters", {}).get("operation", "")) in ("append", "update", "appendOrUpdate"):
            montre(w, n, "écrit dans le Sheet Impacteur")

print("\nFini. Copie toute cette sortie dans le fil Claude : elle sert à préparer le branchement exact.")
