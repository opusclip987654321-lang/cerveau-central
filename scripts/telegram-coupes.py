#!/usr/bin/env python3
"""Choix de louis du 13/10 : couper les messages Telegram qui ne lui demandent aucune action.

À lancer sur le VPS Nūr (là où est le .env du cerveau) :
    python3 scripts/telegram-coupes.py              (montre tout, ne change rien)
    python3 scripts/telegram-coupes.py --appliquer  (coupe les messages dans les deux n8n)
    python3 scripts/telegram-coupes.py --remettre   (remet tout comme avant)

Comment : chaque nœud Telegram choisi est désactivé dans n8n. Un nœud désactivé laisse
passer la suite telle quelle : tout continue d'être enregistré (tables, Sheet, publications),
seul le message n'est plus envoyé.
Dans « ALERTES - Erreurs » (L'extrait politique), un tri « Action claire ? » est ajouté :
seules les alertes « 🔴 ACTION REQUISE » dont la consigne n'est pas « Rien… » partent encore.
Le script refuse de deviner : si un repère a changé, il s'arrête et le dit.
"""
import json
import pathlib
import sys
import urllib.request

APPLIQUER = "--appliquer" in sys.argv
REMETTRE = "--remettre" in sys.argv

# Numéros = la liste envoyée à louis le 13/10.
COUPES = {
    "principal": {  # n8n.nourmeet.com
        "IMPACTEUR A - DECOUVERTE LIVRES": ["TELEGRAM - envoyer"],  # 13 rapport de la découverte
        "IMPACTEUR B - DECOUVERTE YOUTUBE": ["TELEGRAM - envoyer"],  # 13
        "IMPACTEUR C - ENVOIS AUTOMATIQUES": ["TELEGRAM - retenus"],  # 15 invitations retenues
    },
    "actualite": {  # n8n.actualitevideo.fr
        "VEILLE 1 - Détection des moments forts": ["Prévenir Louis"],  # 16 « Je lance un Short »
        "PRODUCTION 1 - Extrait vidéo (Short)": ["Envoyer l'extrait"],  # 17 vidéo + Annuler
        "PRODUCTION 2 - Confrontation (Short)": ["Envoyer l'extrait"],  # 17
        "PUBLICATION 1 - Diffusion (YouTube privé + Facebook + Instagram auto, TikTok manuel)":
            ["Annoncer le créneau", "Signaler le doublon", "Envoyer le récap"],  # 18, 19, 21 (TikTok gardé)
        "ZAPPING 1 - Vidéo longue 19h (zapping / extrait long / confrontation)": ["Prévenir Louis"],  # 22
        "APPRENTISSAGE 1 - Bilan quotidien et leçons": ["Envoyer l'alerte"],  # 24 droits d'auteur
        "ALERTES - Erreurs": ["Annoncer le retour"],  # 26 « refonctionne » (25 : tri ci-dessous)
        "VEILLE AFRIQUE - Détection (Impacteur Afrique)": ["Prévenir Louis"],  # 27
        "PRODUCTION AFRIQUE - Extrait vidéo (Short Impacteur Afrique)":
            ["Prévenir (vidéo écartée)", "Envoyer l'extrait"],  # 28, 29
        "PUBLICATION AFRIQUE - Diffusion Impacteur Afrique (YouTube + Facebook + Instagram, TikTok manuel)":
            ["Annoncer le créneau", "Signaler le doublon", "Envoyer le récap"],  # 29 (TikTok gardé)
        "VIDÉO LONGUE AFRIQUE - 20h (zapping / extrait long / confrontation)": ["Prévenir Louis"],  # 30
    },
}
ALERTES = "ALERTES - Erreurs"
TRI = "Action claire ?"
AIGUILLAGE, ENVOI, SUITE = "Nouveau message ?", "Envoyer l'alerte", "Créer ou mettre à jour ?"

env = {}
for ligne in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
INSTANCES = {
    "principal": ((env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/"), env.get("N8N_API_KEY")),
    "actualite": ((env.get("N8N_ACTUALITE_URL") or "https://n8n.actualitevideo.fr").rstrip("/"), env.get("N8N_ACTUALITE_API_KEY")),
}
for nom, (_, cle) in INSTANCES.items():
    if not cle:
        sys.exit(f"Clé n8n manquante dans .env pour « {nom} » (N8N_API_KEY / N8N_ACTUALITE_API_KEY)")


def api(instance, methode, url, corps=None):
    base, cle = INSTANCES[instance]
    req = urllib.request.Request(
        base + url, method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"X-N8N-API-KEY": cle, "accept": "application/json", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "{}")


def stop(message):
    print(f"\n✋ {message}\nRien n'a été modifié. Colle cette sortie dans le fil Claude.")
    sys.exit(1)


def lien(noeud, sortie=0):
    return {"node": noeud, "type": "main", "index": sortie}


def trier_alertes(w, noeuds, changements):
    """25 : n'envoie que les alertes qui demandent une action claire."""
    sorties = w["connections"].get(AIGUILLAGE, {}).get("main", [])
    present = TRI in noeuds
    if REMETTRE:
        if not present:
            return
        w["nodes"] = [n for n in w["nodes"] if n["name"] != TRI]
        w["connections"].pop(TRI, None)
        sorties[0] = [lien(ENVOI)]
        changements.append(f"retire le tri « {TRI} » : toutes les erreurs repartent sur Telegram")
        return
    if present:
        return
    for nom in (AIGUILLAGE, ENVOI, SUITE):
        if nom not in noeuds:
            stop(f"Nœud « {nom} » introuvable dans {ALERTES}.")
    if not sorties or [c.get("node") for c in sorties[0]] != [ENVOI]:
        stop(f"« {AIGUILLAGE} » ne mène plus directement à « {ENVOI} » : {json.dumps(sorties, ensure_ascii=False)[:300]}")
    x, y = noeuds[ENVOI]["position"]
    w["nodes"].append({
        "name": TRI, "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [x, y - 200],
        "parameters": {"conditions": {
            "combinator": "and",
            "options": {"caseSensitive": True, "typeValidation": "loose"},
            "conditions": [{
                "leftValue": "={{ String($json.texte || '').includes('ACTION REQUISE') && !/Ce que tu dois faire :<\\/b> Rien/.test(String($json.texte || '')) }}",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                "rightValue": True,
            }],
        }, "options": {}},
    })
    sorties[0] = [lien(TRI)]
    # Oui → Telegram ; non → on enregistre l'alerte sans message (comme si l'envoi avait eu lieu).
    w["connections"][TRI] = {"main": [[lien(ENVOI)], [lien(SUITE)]]}
    changements.append(f"ajoute le tri « {TRI} » : seules les erreurs 🔴 ACTION REQUISE avec une vraie consigne partent")


total = 0
for instance, workflows_voulus in COUPES.items():
    print(f"\n=== {INSTANCES[instance][0]}")
    tous = api(instance, "GET", "/api/v1/workflows?limit=250")["data"]
    for nom_wf, noms in workflows_voulus.items():
        actifs = [w for w in tous if w["name"] == nom_wf and w.get("active")]
        if len(actifs) != 1:
            stop(f"« {nom_wf} » : {len(actifs)} copie(s) active(s), il en faut exactement une.")
        w = api(instance, "GET", f"/api/v1/workflows/{actifs[0]['id']}")
        noeuds = {n["name"]: n for n in w["nodes"]}
        changements = []
        for nom in noms:
            n = noeuds.get(nom)
            if not n or not n["type"].endswith(".telegram"):
                stop(f"Nœud Telegram « {nom} » introuvable dans « {nom_wf} ». Nœuds Telegram présents : "
                     + ", ".join(m["name"] for m in w["nodes"] if m["type"].endswith(".telegram")))
            if REMETTRE and n.get("disabled"):
                n.pop("disabled")
                changements.append(f"rallume « {nom} »")
            elif not REMETTRE and not n.get("disabled"):
                n["disabled"] = True
                changements.append(f"coupe « {nom} »")
        if nom_wf == ALERTES:
            trier_alertes(w, noeuds, changements)
        print(f"- {nom_wf}")
        for c in changements or ["déjà fait"]:
            print(f"    {c}")
        if changements and (APPLIQUER or REMETTRE):
            api(instance, "PUT", f"/api/v1/workflows/{w['id']}",
                {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
            try:
                api(instance, "POST", f"/api/v1/workflows/{w['id']}/activate")
            except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
                pass
        total += len(changements)

if not (APPLIQUER or REMETTRE):
    print(f"\n{total} changement(s) à faire. Rien n'a été modifié. Relance avec --appliquer pour enregistrer.")
elif total:
    print(f"\nEnregistré ({total} changement(s)). Effet immédiat, rien à redémarrer.")
else:
    print("\nTout était déjà fait, rien n'a changé.")
