#!/usr/bin/env python3
"""Demande de louis du 12/10 : les Shorts de L'extrait politique ne montrent plus
que des personnalités choisies (liste PERSONNALITES ci-dessous), sans autocensure.

À lancer sur le VPS Nūr (là où est le .env du cerveau, avec la clé du n8n actualité) :
    python3 scripts/extrait-personnalites.py              (montre tout, ne change rien)
    python3 scripts/extrait-personnalites.py --appliquer  (modifie n8n.actualitevideo.fr)

Ce que fait --appliquer :
1. VEILLE 1 (actif) : Claude ne donne une bonne note qu'aux vidéos où parle une
   personnalité de la liste ; toutes les autres reçoivent 0 et ne deviennent
   jamais des Shorts. La consigne « reste neutre politiquement » est retirée.
2. PRODUCTION 1 (actif) : l'extrait choisi doit montrer une de ces personnalités
   en train de parler, tel quel, sans l'adoucir.
3. Sources de la veille : la chaîne YouTube de chaque personnalité est cherchée
   (clé YOUTUBE_API_KEY du cerveau) et ajoutée aux sources si elle n'y est pas.
Le zapping de 19h, la confrontation et Impacteur Afrique ne changent pas.
Le script refuse de deviner : si un repère a changé, il s'arrête et le dit.
"""
import json
import pathlib
import sys
import unicodedata
import urllib.parse
import urllib.request

APPLIQUER = "--appliquer" in sys.argv
PERSONNALITES = [
    "Florian Philippot", "Alain Soral", "Juan Branco", "François Asselineau",
    "Nicolas Dupont-Aignan", "Jean Lassalle", "Étienne Chouard", "Idriss Aberkane", "Didier Raoult",
    "Éric Zemmour", "Marion Maréchal", "Sarah Knafo",
    "Jean-Luc Mélenchon", "Rima Hassan", "François Ruffin",
]
NOM_VEILLE = "VEILLE 1 - Détection des moments forts"
NOM_PROD = "PRODUCTION 1 - Extrait vidéo (Short)"
LISTE = ", ".join(PERSONNALITES)

ANCIEN_VEILLE = "Reste neutre politiquement : juge le potentiel éditorial, pas l'opinion exprimée."
NOUVEAU_VEILLE = (
    f"LIGNE ÉDITORIALE : la chaîne ne publie QUE des moments où l'une de ces personnalités parle elle-même : {LISTE}. "
    "Si aucune d'elles ne s'exprime dans la vidéo (d'après le titre, la description et la source), mets score 0 et format « aucun ». "
    "Pas d'autocensure : ne baisse jamais la note à cause des opinions exprimées ou du caractère clivant de la personne."
)
ANCIEN_PROD = "- reste neutre : tu montres le moment, tu ne prends pas parti."
NOUVEAU_PROD = (
    f"- l'extrait doit montrer l'une de ces personnalités en train de parler : {LISTE} (de préférence celle citée dans l'angle) ; "
    "tu montres le moment tel quel, sans l'adoucir ni le censurer."
)

env = {}
for ligne in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
base = (env.get("N8N_ACTUALITE_URL") or "https://n8n.actualitevideo.fr").rstrip("/")
cle = env.get("N8N_ACTUALITE_API_KEY") or sys.exit("N8N_ACTUALITE_API_KEY manquant dans .env")
cle_yt = env.get("YOUTUBE_API_KEY") or sys.exit("YOUTUBE_API_KEY manquant dans .env")


def api(methode, url, corps=None):
    req = urllib.request.Request(
        base + url, method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"X-N8N-API-KEY": cle, "accept": "application/json", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "{}")


def youtube(chemin, **params):
    url = f"https://www.googleapis.com/youtube/v3/{chemin}?" + urllib.parse.urlencode({**params, "key": cle_yt})
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read())


def simple(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return "".join(c for c in s if c.isalnum())


def stop(message):
    print(f"\n✋ {message}\nRien n'a été modifié. Colle cette sortie dans le fil Claude.")
    sys.exit(1)


# ── 1. Les deux workflows actifs. ───────────────────────────────────────────────
workflows = api("GET", "/api/v1/workflows?limit=250")["data"]


def actif(nom):
    actifs = [w for w in workflows if w["name"] == nom and w.get("active")]
    if len(actifs) != 1:
        stop(f"« {nom} » : {len(actifs)} copie(s) active(s), il en faut exactement une.")
    return api("GET", f"/api/v1/workflows/{actifs[0]['id']}")


wv, wp = actif(NOM_VEILLE), actif(NOM_PROD)
changements, modifies = [], set()


def remplacer(w, nom_noeud, ancre, nouveau, debut_marque, fin_marque, message):
    n = next((x for x in w["nodes"] if x["name"] == nom_noeud), None) or stop(f"Nœud « {nom_noeud} » introuvable dans {w['name']}.")
    code = n["parameters"].get("jsCode", "")
    if debut_marque in code:
        # Déjà passé : on remet la liste à jour (elle peut avoir changé dans ce script).
        debut = code.find(debut_marque)
        fin = code.find(fin_marque, debut)
        if fin < 0:
            stop(f"Consigne déjà modifiée à la main dans « {nom_noeud} » ({w['name']}).")
        fin += len(fin_marque)
        ancienne = code[debut:fin]
        if ancienne == nouveau:
            changements.append(f"{message} : déjà en place")
            return
        n["parameters"]["jsCode"] = code[:debut] + nouveau + code[fin:]
    else:
        if code.count(ancre) != 1:
            stop(f"Repère introuvable ou multiple dans « {nom_noeud} » ({w['name']}).")
        n["parameters"]["jsCode"] = code.replace(ancre, nouveau, 1)
    modifies.add(w["id"])
    changements.append(message)


remplacer(wv, "Préparer candidats", ANCIEN_VEILLE, NOUVEAU_VEILLE, "LIGNE ÉDITORIALE", "caractère clivant de la personne.",
          "VEILLE 1 : seules les vidéos où parle une personnalité de la liste sont retenues")
remplacer(wp, "Préparer la demande", ANCIEN_PROD, NOUVEAU_PROD, "- l'extrait doit montrer l'une de ces personnalités", "sans l'adoucir ni le censurer.",
          "PRODUCTION 1 : l'extrait montre une personnalité de la liste en train de parler")

# ── 2. Les chaînes des personnalités dans les sources de la veille. ─────────────
lire = next((n for n in wv["nodes"] if n["name"] == "Lire sources"), None) or stop("Nœud « Lire sources » introuvable.")
table = lire["parameters"]["url"].split("/data-tables/")[1].split("/")[0]
sources = api("GET", f"/api/v1/data-tables/{table}/rows?limit=250").get("data", [])
if not sources:
    stop("La table des sources est vide ou illisible.")
colonnes = set(sources[0])
for c in ("channel_id", "nom", "statut"):
    if c not in colonnes:
        stop(f"Colonne « {c} » absente de la table des sources (colonnes : {sorted(colonnes)}).")
connues = {s["channel_id"]: s for s in sources}

print("Chaînes des personnalités :")
a_ajouter = []
for p in PERSONNALITES:
    nom_famille = simple(p.split()[-1])
    trouve = None
    for r in youtube("search", part="snippet", type="channel", maxResults=5, q=p).get("items", []):
        titre = r["snippet"]["channelTitle"]
        # « X - Topic » = chaîne musicale créée automatiquement par YouTube : pas de vidéos à extraire.
        if nom_famille in simple(titre) and not titre.rstrip().endswith("- Topic"):
            trouve = r["snippet"]
            break
    if not trouve:
        print(f"  - {p} : aucune chaîne à son nom trouvée, ses passages seront repérés sur les autres sources")
        continue
    cid = trouve["channelId"]
    stats = (youtube("channels", part="statistics", id=cid).get("items") or [{}])[0].get("statistics", {})
    abonnes = int(stats.get("subscriberCount") or 0)
    if cid in connues:
        etat = connues[cid].get("statut")
        print(f"  - {p} : « {trouve['channelTitle']} » déjà suivie (statut {etat})")
        continue
    print(f"  - {p} : « {trouve['channelTitle']} » ({abonnes:,} abonnés) → ajoutée".replace(",", " "))
    ligne = {"channel_id": cid, "nom": trouve["channelTitle"], "statut": "usable"}
    if "categorie" in colonnes:
        ligne["categorie"] = "personnalité"
    if "compte" in colonnes:
        ligne["compte"] = ""
    a_ajouter.append(ligne)
if a_ajouter:
    changements.append(f"Sources : {len(a_ajouter)} chaîne(s) de personnalités ajoutée(s) à la veille")

print("\nCe qui sera fait :")
for c in changements:
    print(f"  - {c}")

if not APPLIQUER:
    print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
    sys.exit(0)

for w in (wv, wp):
    if w["id"] not in modifies:
        continue
    api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
    try:
        api("POST", f"/api/v1/workflows/{w['id']}/activate")
    except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
        pass
if a_ajouter:
    api("POST", f"/api/v1/data-tables/{table}/rows", {"data": a_ajouter})
print("\nEnregistré. Dès la prochaine veille (chaque heure), les Shorts ne montrent plus"
      "\nque les personnalités de la liste.")
