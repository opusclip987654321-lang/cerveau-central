#!/usr/bin/env python3
"""Choix de louis du 15/10 : L'extrait politique ralentit (Petites histoires vraies
marche mieux, le budget économisé va là-bas).
- 2 Shorts par jour au plus (au lieu d'un par créneau de 3 h entre 7 h et 22 h) ;
- 1 vidéo longue par semaine sur YouTube : le dimanche à 19 h, avec le meilleur
  des 7 derniers jours (au lieu d'un zapping chaque soir avec les 30 dernières heures).
Impacteur Afrique (veille, Shorts, vidéo de 20 h) n'est pas touché.

À lancer sur le VPS Nūr (là où est le .env du cerveau) :
    python3 scripts/extrait-ralentir.py              (montre tout, ne change rien)
    python3 scripts/extrait-ralentir.py --appliquer  (modifie n8n.actualitevideo.fr)
    python3 scripts/extrait-ralentir.py --remettre   (revient au rythme d'avant)

Ce que fait --appliquer :
1. VEILLE 1 (toutes les heures), nœud « Sélection » : l'IA ne lance plus de Short
   quand 2 Shorts ont déjà été lancés dans la journée (heure de Paris).
   La veille continue de noter les vidéos : la vidéo du dimanche s'en sert.
2. ZAPPING 1, déclencheur : 17 h 30 le dimanche seulement (publication à 19 h).
3. ZAPPING 1 : candidats pris sur 7 jours au lieu de 30 h, et les textes « chaque
   soir », « à demain », « du jour » deviennent « chaque dimanche », « dimanche
   prochain », « de la semaine » (consignes de Claude, fin de vidéo, description).
Les noms des automatisations ne changent pas (telegram-coupes.py et
tiktok-postforme.py les retrouvent par leur nom). Ce script ne touche ni PUBLICATION 1
ni les nœuds Telegram : les trois scripts s'appliquent dans n'importe quel ordre.
Le script refuse de deviner : si un repère a changé, il s'arrête et le dit.
"""
import json
import pathlib
import sys
import urllib.request

APPLIQUER = "--appliquer" in sys.argv or "--remettre" in sys.argv
REMETTRE = "--remettre" in sys.argv
NOM_VEILLE = "VEILLE 1 - Détection des moments forts"
NOM_ZAPPING = "ZAPPING 1 - Vidéo longue 19h (zapping / extrait long / confrontation)"
ICI = pathlib.Path(__file__).resolve().parent

env = {}
for ligne in (ICI.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
base = (env.get("N8N_ACTUALITE_URL") or "https://n8n.actualitevideo.fr").rstrip("/")
cle = env.get("N8N_ACTUALITE_API_KEY") or sys.exit("N8N_ACTUALITE_API_KEY manquant dans .env")


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


# ── Les remplacements : (nœud, ancien texte, nouveau texte, ce que ça change). ───
COMPTE_JOUR = """const histo = ($('Lire historique décisions').first().json.data || []).filter(r => r.compte !== 'afrique');
// Choix de louis du 15/10 : 2 Shorts lancés par l'IA par jour au plus (heure de Paris)
const MAX_SHORTS_JOUR = 2;
const jourParis = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const shortsDuJour = histo.filter(r => r.decision === 'choix_ia' && r.statut !== 'abandonnee' && r.decision_le && jourParis(Date.parse(r.decision_le)) === jourParis(tNow)).length;"""

VEILLE = [
    ("Sélection",
     "const histo = ($('Lire historique décisions').first().json.data || []).filter(r => r.compte !== 'afrique');",
     COMPTE_JOUR,
     "Shorts : compte des Shorts lancés aujourd'hui"),
    ("Sélection",
     "(heure >= 7 && heure < 22 && enCours === 0)",
     "(heure >= 7 && heure < 22 && enCours === 0 && shortsDuJour < MAX_SHORTS_JOUR)",
     "Shorts : plus de lancement après le 2e de la journée"),
]

ZAPPING = [
    ("Choisir les candidats",
     "// Vidéo longue quotidienne L'Extrait politique (19h) : candidats = vidéos repérées par VEILLE 1 depuis 30 h",
     "// Vidéo longue hebdomadaire L'Extrait politique (dimanche 19h, choix de louis du 15/10) : candidats = vidéos repérées par VEILLE 1 depuis 7 jours",
     "Vidéo longue : commentaire"),
    ("Choisir les candidats",
     "now - Date.parse(v.publiee_le) < 30 * 3600e3",
     "now - Date.parse(v.publiee_le) < 7 * 24 * 3600e3",
     "Vidéo longue : candidats des 7 derniers jours au lieu de 30 h"),
    ("Choisir les candidats",
     "vidéos sur 30 h)`",
     "vidéos sur 7 jours)`",
     "Vidéo longue : message d'erreur"),
    ("Préparer les moments",
     "qui publie chaque soir à 19h une vidéo longue",
     "qui publie chaque dimanche à 19h une vidéo longue (le meilleur de la semaine)",
     "Consigne de Claude (choix des moments) : chaque dimanche"),
    ("Rédaction",
     "Chaque soir à 19h, une vidéo longue.",
     "Chaque dimanche à 19h, une vidéo longue : le meilleur de la semaine.",
     "Consigne de Claude (conducteur) : chaque dimanche"),
    ("Rédaction",
     "le meilleur de la politique française du jour ;",
     "le meilleur de la politique française de la semaine ;",
     "Consigne de Claude : le meilleur de la semaine"),
    ("Rédaction",
     "(rendez-vous demain + abonnement)",
     "(rendez-vous dimanche prochain + abonnement)",
     "Voix de fin : rendez-vous dimanche prochain"),
    ("Conducteur",
     "zapping: `Le zapping du ${prev.dateLabel}`, extrait_long: 'Le moment fort du jour'",
     "zapping: 'Le zapping de la semaine', extrait_long: 'Le moment fort de la semaine'",
     "Écran d'ouverture : « de la semaine »"),
    ("Conducteur",
     "outro_gros: 'À DEMAIN, 19H'",
     "outro_gros: 'DIMANCHE PROCHAIN, 19H'",
     "Écran de fin : « DIMANCHE PROCHAIN, 19H »"),
    ("Conducteur",
     "le meilleur de la politique française, chaque soir'",
     "le meilleur de la politique française, chaque dimanche'",
     "Écran de fin : « chaque dimanche »"),
    ("Description",
     "le meilleur de la politique française, chaque soir à 19h.",
     "le meilleur de la politique française, chaque dimanche à 19h.",
     "Description YouTube : « chaque dimanche à 19h »"),
]
CRON_AVANT, CRON_APRES = "30 17 * * *", "30 17 * * 0"


def actif(nom):
    tous = [w for w in api("GET", "/api/v1/workflows?limit=250")["data"] if w["name"] == nom and w.get("active")]
    if len(tous) != 1:
        stop(f"« {nom} » : {len(tous)} copie(s) active(s), il en faut exactement une.")
    return api("GET", f"/api/v1/workflows/{tous[0]['id']}")


changements, modifies = [], set()


def remplacer(w, liste):
    noeuds = {n["name"]: n for n in w["nodes"]}
    for nom, avant, apres, message in liste:
        if REMETTRE:
            avant, apres = apres, avant
        n = noeuds.get(nom) or stop(f"Nœud « {nom} » introuvable dans {w['name']}.")
        code = n["parameters"].get("jsCode")
        if code is None:
            stop(f"« {nom} » ({w['name']}) n'est plus un nœud de code.")
        # Déjà en place : le nouveau texte est là et l'ancien n'existe plus qu'à l'intérieur de lui.
        if code.count(apres) == 1 and code.count(avant) == apres.count(avant):
            changements.append(f"{message} : déjà en place")
            continue
        if code.count(avant) != 1:
            stop(f"Repère introuvable ou multiple dans « {nom} » ({w['name']}) :\n    {avant[:120]}")
        n["parameters"]["jsCode"] = code.replace(avant, apres, 1)
        modifies.add(w["id"])
        changements.append(message)


wv, wz = actif(NOM_VEILLE), actif(NOM_ZAPPING)
remplacer(wv, VEILLE)
remplacer(wz, ZAPPING)

# Le déclencheur du zapping : 17 h 30 chaque jour → le dimanche seulement.
declencheurs = [n for n in wz["nodes"] if n["type"].endswith("scheduleTrigger")]
if len(declencheurs) != 1:
    stop(f"{NOM_ZAPPING} : {len(declencheurs)} déclencheur(s) horaire(s), il en faut exactement un.")
regles = declencheurs[0]["parameters"].get("rule", {}).get("interval", [])
avant, apres = (CRON_APRES, CRON_AVANT) if REMETTRE else (CRON_AVANT, CRON_APRES)
if [r.get("expression") for r in regles] == [apres]:
    changements.append("Vidéo longue : déclencheur déjà réglé")
elif [r.get("expression") for r in regles] == [avant]:
    regles[0]["expression"] = apres
    modifies.add(wz["id"])
    changements.append("Vidéo longue : " + ("de nouveau chaque jour à 17 h 30" if REMETTRE else "17 h 30 le dimanche seulement au lieu de chaque jour") + " (publication à 19 h)")
else:
    stop(f"Déclencheur inattendu dans {NOM_ZAPPING} : {json.dumps(regles, ensure_ascii=False)}")

print("Retour au rythme d'avant :" if REMETTRE else "Ralentissement de L'extrait politique (Impacteur Afrique inchangé) :")
for c in changements:
    print(f"  - {c}")

if not APPLIQUER:
    print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
    sys.exit(0)
if not modifies:
    print("\nTout est déjà en place, rien à enregistrer.")
    sys.exit(0)

for w in (wv, wz):
    if w["id"] not in modifies:
        continue
    api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
    try:
        api("POST", f"/api/v1/workflows/{w['id']}/activate")
    except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
        pass
    print(f"Enregistré : {w['name']}")
if REMETTRE:
    print("\nRythme d'avant rétabli : un Short par créneau de 3 h et la vidéo longue chaque soir.")
else:
    print("\nC'est en place : 2 Shorts par jour au plus dès la prochaine veille, et la vidéo longue"
          "\nle dimanche à 19 h (la prochaine sort dimanche, plus rien les autres soirs).")
