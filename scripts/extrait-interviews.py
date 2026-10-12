#!/usr/bin/env python3
"""Demande de louis du 12/10 : la veille de L'extrait politique cherche aussi les
interviews longues des personnalités de sa liste sur TOUTES les chaînes YouTube,
pas seulement sur les chaînes suivies.

À lancer sur le VPS Nūr (là où est le .env du cerveau) :
    python3 scripts/extrait-interviews.py              (montre tout, ne change rien)
    python3 scripts/extrait-interviews.py --appliquer  (modifie n8n.actualitevideo.fr)

Ce que fait --appliquer, dans VEILLE 1 (toutes les heures) :
1. Une recherche YouTube « vidéos longues (plus de 20 min) publiées depuis 3 h qui
   citent une des personnalités » s'ajoute aux flux des chaînes suivies.
   Elle utilise la clé YOUTUBE_API_KEY du cerveau, rangée dans un accès n8n
   (100 points de quota par heure, 2 400 par jour sur 10 000).
2. Les vidéos trouvées passent par la même notation que les autres : une vidéo où
   aucune personnalité de la liste ne parle reçoit 0. Les chaînes en liste noire
   (anti-strike) et Impacteur Afrique restent écartées.
La liste des personnalités est celle de scripts/extrait-personnalites.py.
Le script refuse de deviner : si un repère a changé, il s'arrête et le dit.
"""
import json
import pathlib
import sys
import urllib.request

APPLIQUER = "--appliquer" in sys.argv
NOM_VEILLE = "VEILLE 1 - Détection des moments forts"
NOM_ACCES = "YouTube recherche (clé du cerveau)"
RECHERCHE = "Recherche interviews"
AJOUT = "Ajouter les interviews"
ICI = pathlib.Path(__file__).resolve().parent

# La liste vient de l'autre script, sans l'exécuter (il parle à n8n au chargement).
texte_liste = (ICI / "extrait-personnalites.py").read_text()
debut = texte_liste.index("PERSONNALITES = [")
PERSONNALITES = eval(texte_liste[debut + len("PERSONNALITES = "):texte_liste.index("]", debut) + 1])  # noqa: S307 — notre propre fichier
REQUETE = "|".join(f'"{p}"' for p in PERSONNALITES)

env = {}
for ligne in (ICI.parent / ".env").read_text().splitlines():
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


def stop(message):
    print(f"\n✋ {message}\nRien n'a été modifié. Colle cette sortie dans le fil Claude.")
    sys.exit(1)


CODE_AJOUT = r"""
// Interviews des personnalités trouvées par la recherche YouTube, ajoutées aux nouvelles vidéos des chaînes suivies.
const HOURS = 6;
const st = $getWorkflowStaticData('global');
st.seen = st.seen || {};
const rows = $('Lire sources').first().json.data || [];
const bloque = new Set(rows.filter(r => r.compte === 'afrique' || ['blacklisted', 'ignored'].includes(r.statut)).map(r => r.channel_id));
const now = Date.now();
const out = $('Nouvelles vidéos').all().filter(i => i.json.video_id).map(i => ({ json: i.json }));
for (const it of $('Recherche interviews').all()) for (const v of (it.json.items || [])) {
  const vid = v.id && v.id.videoId; const sn = v.snippet || {};
  if (!vid || st.seen[vid] || bloque.has(sn.channelId)) continue;
  if (['live', 'upcoming'].includes(sn.liveBroadcastContent)) continue;
  if (now - Date.parse(sn.publishedAt) > HOURS * 3600e3) continue;
  st.seen[vid] = now;
  out.push({ json: { video_id: vid, publiee_le: sn.publishedAt, channel_id: sn.channelId, source_nom: sn.channelTitle,
    source_statut: 'usable', categorie: 'interview' } });
}
return out;
"""

# ── 1. Le workflow actif. ───────────────────────────────────────────────────────
workflows = api("GET", "/api/v1/workflows?limit=250")["data"]
actifs = [w for w in workflows if w["name"] == NOM_VEILLE and w.get("active")]
if len(actifs) != 1:
    stop(f"« {NOM_VEILLE} » : {len(actifs)} copie(s) active(s), il en faut exactement une.")
w = api("GET", f"/api/v1/workflows/{actifs[0]['id']}")
noeuds = {n["name"]: n for n in w["nodes"]}
for nom in ("Nouvelles vidéos", "Lots de 50", "Préparer candidats", "Lire sources"):
    if nom not in noeuds:
        stop(f"Nœud « {nom} » introuvable dans {NOM_VEILLE}.")
changements = []

parametres_recherche = {
    "method": "GET",
    "url": "https://www.googleapis.com/youtube/v3/search",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpQueryAuth",
    "sendQuery": True,
    "queryParameters": {"parameters": [
        {"name": "part", "value": "snippet"},
        {"name": "type", "value": "video"},
        {"name": "order", "value": "date"},
        {"name": "maxResults", "value": "50"},
        {"name": "videoDuration", "value": "long"},
        {"name": "relevanceLanguage", "value": "fr"},
        {"name": "publishedAfter", "value": "={{ new Date(Date.now() - 3 * 3600e3).toISOString() }}"},
        {"name": "q", "value": REQUETE},
    ]},
    "options": {},
}

deja = RECHERCHE in noeuds
if deja:
    noeuds[RECHERCHE]["parameters"] = parametres_recherche  # liste remise à jour
    noeuds[AJOUT]["parameters"]["jsCode"] = CODE_AJOUT
    changements.append("Recherche des interviews : déjà branchée, liste des personnalités remise à jour")
else:
    x, y = noeuds["Nouvelles vidéos"]["position"]
    w["nodes"].append({"name": RECHERCHE, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
                       "position": [x + 60, y + 220], "executeOnce": True, "onError": "continueRegularOutput",
                       "parameters": parametres_recherche, "credentials": {}})
    w["nodes"].append({"name": AJOUT, "type": "n8n-nodes-base.code", "typeVersion": 2,
                       "position": [x + 280, y + 220], "parameters": {"jsCode": CODE_AJOUT}})
    noeuds["Nouvelles vidéos"]["alwaysOutputData"] = True  # la recherche tourne même sans nouveauté des chaînes suivies
    suite = w["connections"].get("Nouvelles vidéos")
    if [[c.get("node") for c in groupe] for groupe in (suite or {}).get("main", [])] != [["Lots de 50"]]:
        stop(f"« Nouvelles vidéos » ne mène plus directement à « Lots de 50 » : {json.dumps(suite, ensure_ascii=False)}")
    w["connections"]["Nouvelles vidéos"] = {"main": [[{"node": RECHERCHE, "type": "main", "index": 0}]]}
    w["connections"][RECHERCHE] = {"main": [[{"node": AJOUT, "type": "main", "index": 0}]]}
    w["connections"][AJOUT] = {"main": [[{"node": "Lots de 50", "type": "main", "index": 0}]]}
    code = noeuds["Préparer candidats"]["parameters"]["jsCode"]
    if code.count("$('Nouvelles vidéos').all()") != 1:
        stop("Repère « $('Nouvelles vidéos').all() » introuvable dans « Préparer candidats ».")
    noeuds["Préparer candidats"]["parameters"]["jsCode"] = code.replace("$('Nouvelles vidéos').all()", f"$('{AJOUT}').all()")
    changements += [
        "VEILLE 1 : recherche YouTube toutes les heures des vidéos longues (plus de 20 min) où apparaît une personnalité",
        "VEILLE 1 : ces vidéos sont notées avec les autres (0 si aucune personnalité de la liste n'y parle)",
        f"Accès n8n « {NOM_ACCES} » créé avec la clé YouTube du cerveau",
    ]

print(f"Personnalités cherchées ({len(PERSONNALITES)}) : {', '.join(PERSONNALITES)}")
print("\nCe qui sera fait :")
for c in changements:
    print(f"  - {c}")

if not APPLIQUER:
    print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
    sys.exit(0)

if not deja:
    acces = api("POST", "/api/v1/credentials", {"name": NOM_ACCES, "type": "httpQueryAuth", "data": {"name": "key", "value": cle_yt}})
    if not acces.get("id"):
        stop(f"n8n n'a pas créé l'accès : {json.dumps(acces, ensure_ascii=False)[:300]}")
    next(n for n in w["nodes"] if n["name"] == RECHERCHE)["credentials"] = {"httpQueryAuth": {"id": acces["id"], "name": NOM_ACCES}}

api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
try:
    api("POST", f"/api/v1/workflows/{w['id']}/activate")
except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
    pass
print("\nEnregistré. Dès la prochaine veille (chaque heure), les interviews longues des"
      "\npersonnalités sont cherchées sur toutes les chaînes YouTube.")
