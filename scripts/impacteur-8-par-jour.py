#!/usr/bin/env python3
"""Demandes de louis du 11/10 : 8 contacts par jour et fin du garde-fou
« auteur décédé » sur les invitations Impacteur.

À lancer sur le VPS Nūr :
    python3 scripts/impacteur-8-par-jour.py              (montre tout, ne change rien)
    python3 scripts/impacteur-8-par-jour.py --appliquer  (modifie n8n)

Ce que fait --appliquer :
1. IMPACTEUR C (actif) : le plafond d'envoi passe de 5 à 8 invitations par jour.
2. IMPACTEUR A (actif) : la découverte de livres prépare jusqu'à 6 fiches par jour
   (au lieu de 4), pour nourrir le nouveau plafond.
3. IMPACTEUR A et B (actifs) : plus aucune invitation n'est écartée parce que
   l'auteur serait décédé ; un doute reste signalé sur la fiche, sans bloquer.
Le script refuse de deviner : si un repère a changé, il s'arrête et montre la
structure réelle, à coller dans le fil Claude.
"""
import json
import pathlib
import sys
import urllib.request

APPLIQUER = "--appliquer" in sys.argv
NOM_A = "IMPACTEUR A - DECOUVERTE LIVRES"
NOM_B = "IMPACTEUR B - DECOUVERTE YOUTUBE"
NOM_C = "IMPACTEUR C - ENVOIS AUTOMATIQUES"

env = {}
for ligne in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
base = (env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/")
cle = env.get("N8N_API_KEY") or sys.exit("N8N_API_KEY manquant dans .env")


def api(methode, url, corps=None):
    req = urllib.request.Request(
        base + url, method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"X-N8N-API-KEY": cle, "accept": "application/json", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "{}")


def structure(w):
    """La structure d'un workflow, lisible et sans secret, à coller dans le fil Claude."""
    lignes = [f"### {w['name']} [{'ON' if w.get('active') else 'off'}] id={w.get('id')}"]
    for n in w["nodes"]:
        if n.get("type") == "n8n-nodes-base.stickyNote":
            continue
        acces = {k: (v or {}).get("name") for k, v in (n.get("credentials") or {}).items()}
        lignes.append(f"-- {n['name']} ({n['type']})" + (f" accès={json.dumps(acces, ensure_ascii=False)}" if acces else ""))
        lignes.append(json.dumps(n.get("parameters", {}), ensure_ascii=False))
    lignes.append("connections = " + json.dumps(w["connections"], ensure_ascii=False))
    return "\n".join(lignes)


def stop(message, *workflows):
    print(f"\n✋ {message}")
    print("Rien n'a été modifié. Colle toute cette sortie dans le fil Claude :")
    for w in workflows:
        print()
        print(structure(w))
    sys.exit(1)


# ── 1. Inventaire : tous les workflows, avec doublons de nom visibles. ──────────
workflows = api("GET", "/api/v1/workflows?limit=250")["data"]
print("Inventaire n8n (nom [état] id) :")
for w in sorted(workflows, key=lambda x: (x["name"], not x.get("active"))):
    print(f"  {w['name']} [{'ON' if w.get('active') else 'off'}] {w.get('id')}")


# ── 2. Les workflows A, B et C ACTIFS (les copies éteintes sont ignorées). ──────
def actif(nom):
    copies = [w for w in workflows if w["name"] == nom]
    actifs = [w for w in copies if w.get("active")]
    if len(actifs) != 1:
        stop(f"« {nom} » : {len(actifs)} copie(s) active(s) sur {len(copies)} — il en faut exactement une.", *copies)
    return api("GET", f"/api/v1/workflows/{actifs[0]['id']}")


wa, wb, wc = actif(NOM_A), actif(NOM_B), actif(NOM_C)
na = {n["name"]: n for n in wa["nodes"]}
nb = {n["name"]: n for n in wb["nodes"]}
nc = {n["name"]: n for n in wc["nodes"]}
changements = []
modifies = set()


def remplacer(w, noeud, champ_lire, champ_ecrire, ancre, nouveau, deja, message):
    """Remplace `ancre` par `nouveau` dans un champ texte d'un nœud, une seule fois.
    `deja` est la trace du remplacement déjà fait (idempotence)."""
    texte = champ_lire(noeud)
    if deja in texte:
        changements.append(f"{message} : déjà en place")
        return
    if texte.count(ancre) != 1:
        stop(f"Repère introuvable ou multiple dans « {noeud['name']} » ({w['name']}).", w)
    champ_ecrire(noeud, texte.replace(ancre, nouveau, 1))
    modifies.add(w["id"])
    changements.append(message)


def code_lire(n):
    return n["parameters"].get("jsCode", "")


def code_ecrire(n, t):
    n["parameters"]["jsCode"] = t


def prompt_lire(n):
    try:
        return n["parameters"]["messages"]["values"][0]["content"]
    except (KeyError, IndexError, TypeError):
        return ""


def prompt_ecrire(n, t):
    n["parameters"]["messages"]["values"][0]["content"] = t


def noeud(table, nom, w):
    n = table.get(nom)
    if not n:
        stop(f"Nœud « {nom} » introuvable.", w)
    return n


# ── 3. C : plafond d'envoi 5 → 8 par jour. ──────────────────────────────────────
sel = noeud(nc, "SELECTIONNER ENVOIS", wc)
remplacer(wc, sel, code_lire, code_ecrire,
          "const PLAFOND_JOUR=5;", "const PLAFOND_JOUR=8;", "const PLAFOND_JOUR=8;",
          "C / plafond : 8 invitations par jour au lieu de 5")
if "Plafond 5/jour." in code_lire(sel):
    code_ecrire(sel, code_lire(sel).replace("Plafond 5/jour.", "Plafond 8/jour.", 1))
    modifies.add(wc["id"])
# La note épinglée de C (visible dans n8n) suit le même chiffre, sans bloquer si absente.
for n in wc["nodes"]:
    if n.get("type") == "n8n-nodes-base.stickyNote" and "plafond 5 envois/jour" in str(n["parameters"].get("content", "")):
        n["parameters"]["content"] = n["parameters"]["content"].replace("plafond 5 envois/jour", "plafond 8 envois/jour")
        modifies.add(wc["id"])

# ── 4. A : jusqu'à 6 fiches découvertes par jour (au lieu de 4). ────────────────
config_a = noeud(na, "CONFIG - chaîne du jour", wa)
remplacer(wa, config_a, code_lire, code_ecrire,
          "max_fiches:4", "max_fiches:6", "max_fiches:6",
          "A / découverte : jusqu'à 6 fiches de livres par jour au lieu de 4")

# ── 5. A et B : fin du garde-fou « auteur décédé ». ─────────────────────────────
ANCIEN_A = ("Mets invitation_possible à false UNIQUEMENT si le décès de l'auteur lui-même est "
            "manifeste et certain dans les données ; tout doute (homonymie, identité) se signale "
            "dans informations_a_verifier sans bloquer.")
ANCIEN_B = ("Mets invitation_possible à false UNIQUEMENT si le décès de la personne elle-même est "
            "manifeste et certain ; un doute se signale dans informations_a_verifier sans bloquer.")
NOUVEAU = ("Mets toujours invitation_possible à true : tout doute (décès supposé, homonymie, "
           "identité) se signale dans informations_a_verifier sans bloquer.")
ANCIEN_CODE = "const possible=data.invitation_possible!==false;"
NOUVEAU_CODE = "const possible=true;"

remplacer(wa, noeud(na, "CLAUDE - rédiger invitations", wa), prompt_lire, prompt_ecrire,
          ANCIEN_A, NOUVEAU, NOUVEAU,
          "A / garde-fou décédés : retiré de la consigne d'écriture (le doute reste signalé)")
remplacer(wa, noeud(na, "VERIFIER ET FINALISER", wa), code_lire, code_ecrire,
          ANCIEN_CODE, NOUVEAU_CODE, NOUVEAU_CODE,
          "A / garde-fou décédés : la fiche n'est plus bloquée")
remplacer(wb, noeud(nb, "CLAUDE - rédiger invitation", wb), prompt_lire, prompt_ecrire,
          ANCIEN_B, NOUVEAU, NOUVEAU,
          "B / garde-fou décédés : retiré de la consigne d'écriture (le doute reste signalé)")
remplacer(wb, noeud(nb, "VERIFIER ET FINALISER", wb), code_lire, code_ecrire,
          ANCIEN_CODE, NOUVEAU_CODE, NOUVEAU_CODE,
          "B / garde-fou décédés : la fiche n'est plus bloquée")

print("\nCe qui sera fait :")
for c in changements:
    print(f"  - {c}")
print("\nAu passage : les fiches déjà marquées « décès à vérifier » dans le Sheet restent"
      "\nbloquées ; pour les relancer, passe leur statut à A_VERIFIER dans le Sheet.")

if not APPLIQUER:
    print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
    sys.exit(0)

for w in (wa, wb, wc):
    if w["id"] not in modifies:
        continue
    api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
    try:
        api("POST", f"/api/v1/workflows/{w['id']}/activate")
    except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
        pass
print("\nEnregistré. Dès la prochaine tournée : jusqu'à 8 invitations par jour, et plus"
      "\naucun blocage pour auteur décédé (le doute reste signalé sur la fiche).")
