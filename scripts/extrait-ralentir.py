#!/usr/bin/env python3
"""Choix de louis du 15/10 : L'extrait politique ralentit (Petites histoires vraies
marche mieux, le budget économisé va là-bas).
- 2 Shorts par jour au plus (au lieu d'un par créneau de 3 h entre 7 h et 22 h) ;
- 1 vidéo longue par semaine sur YouTube : le dimanche à 19 h, avec le meilleur
  des 7 derniers jours (au lieu d'un zapping chaque soir avec les 30 dernières heures).
Complément de louis du 15/10 : Impacteur Afrique passe aussi à une vidéo longue par
semaine, le samedi à 20 h (ses Shorts sont déjà à 2 par jour, 12 h et 18 h, dans
PUBLICATION AFRIQUE : pas touchés ici).

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
4. VIDÉO LONGUE AFRIQUE : même chose, 16 h 45 le samedi seulement (publication à
   20 h), candidats sur 7 jours, textes « chaque samedi », « samedi prochain ».
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
NOM_AFRIQUE = "VIDÉO LONGUE AFRIQUE - 20h (zapping / extrait long / confrontation)"
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
AFRIQUE = [
    ("Choisir les candidats",
     "// Vidéo longue quotidienne Impacteur Afrique : candidats = vidéos repérées par VEILLE AFRIQUE depuis 30 h",
     "// Vidéo longue hebdomadaire Impacteur Afrique (samedi 20h, choix de louis du 15/10) : candidats = vidéos repérées par VEILLE AFRIQUE depuis 7 jours",
     "Afrique : commentaire"),
    ("Choisir les candidats",
     "now - Date.parse(v.publiee_le) < 30 * 3600e3",
     "now - Date.parse(v.publiee_le) < 7 * 24 * 3600e3",
     "Afrique : candidats des 7 derniers jours au lieu de 30 h"),
    ("Choisir les candidats",
     "vidéos sur 30 h)`",
     "vidéos sur 7 jours)`",
     "Afrique : message d'erreur"),
    ("Préparer les moments",
     "qui publie chaque soir à 20h une vidéo longue",
     "qui publie chaque samedi à 20h une vidéo longue (le meilleur de la semaine)",
     "Afrique, consigne de Claude (choix des moments) : chaque samedi"),
    ("Rédaction",
     "Chaque soir à 20h, une vidéo longue.",
     "Chaque samedi à 20h, une vidéo longue : le meilleur de la semaine.",
     "Afrique, consigne de Claude (conducteur) : chaque samedi"),
    ("Rédaction",
     "le meilleur de l'actualité africaine du jour ;",
     "le meilleur de l'actualité africaine de la semaine ;",
     "Afrique, consigne de Claude : le meilleur de la semaine"),
    ("Rédaction",
     "(rendez-vous demain + abonnement)",
     "(rendez-vous samedi prochain + abonnement)",
     "Afrique, voix de fin : rendez-vous samedi prochain"),
    ("Conducteur",
     "zapping: `L'actualité africaine du ${prev.dateLabel}`, extrait_long: 'Le moment fort du jour'",
     "zapping: \"L'actualité africaine de la semaine\", extrait_long: 'Le moment fort de la semaine'",
     "Afrique, écran d'ouverture : « de la semaine »"),
    ("Conducteur",
     "outro_gros: 'À DEMAIN, 20H'",
     "outro_gros: 'SAMEDI PROCHAIN, 20H'",
     "Afrique, écran de fin : « SAMEDI PROCHAIN, 20H »"),
    ("Description",
     "l'actualité africaine en français, chaque soir à 20h.",
     "l'actualité africaine en français, chaque samedi à 20h.",
     "Afrique, description YouTube : « chaque samedi à 20h »"),
]


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


def declencheur(w, cron_avant, cron_apres, quoi):
    """Le déclencheur horaire de la vidéo longue : chaque jour → un jour par semaine."""
    declencheurs = [n for n in w["nodes"] if n["type"].endswith("scheduleTrigger")]
    if len(declencheurs) != 1:
        stop(f"{w['name']} : {len(declencheurs)} déclencheur(s) horaire(s), il en faut exactement un.")
    regles = declencheurs[0]["parameters"].get("rule", {}).get("interval", [])
    avant, apres = (cron_apres, cron_avant) if REMETTRE else (cron_avant, cron_apres)
    if [r.get("expression") for r in regles] == [apres]:
        changements.append(f"{quoi} : déclencheur déjà réglé")
    elif [r.get("expression") for r in regles] == [avant]:
        regles[0]["expression"] = apres
        modifies.add(w["id"])
        changements.append(f"{quoi} : " + ("de nouveau chaque jour" if REMETTRE else "un jour par semaine au lieu de chaque jour"))
    else:
        stop(f"Déclencheur inattendu dans {w['name']} : {json.dumps(regles, ensure_ascii=False)}")


wv, wz, wa = actif(NOM_VEILLE), actif(NOM_ZAPPING), actif(NOM_AFRIQUE)
remplacer(wv, VEILLE)
remplacer(wz, ZAPPING)
declencheur(wz, "30 17 * * *", "30 17 * * 0", "Vidéo longue : montage le dimanche à 17 h 30 (publication à 19 h)")
remplacer(wa, AFRIQUE)
declencheur(wa, "45 16 * * *", "45 16 * * 6", "Afrique : montage le samedi à 16 h 45 (publication à 20 h)")

print("Retour au rythme d'avant :" if REMETTRE else "Ralentissement de L'extrait politique et de la vidéo longue d'Impacteur Afrique :")
for c in changements:
    print(f"  - {c}")

if not APPLIQUER:
    print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
    sys.exit(0)
if not modifies:
    print("\nTout est déjà en place, rien à enregistrer.")
    sys.exit(0)

for w in (wv, wz, wa):
    if w["id"] not in modifies:
        continue
    api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
    try:
        api("POST", f"/api/v1/workflows/{w['id']}/activate")
    except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
        pass
    print(f"Enregistré : {w['name']}")
if REMETTRE:
    print("\nRythme d'avant rétabli : un Short par créneau de 3 h et les vidéos longues chaque soir.")
else:
    print("\nC'est en place : 2 Shorts par jour au plus dès la prochaine veille, la vidéo longue"
          "\nde L'extrait politique le dimanche à 19 h et celle d'Impacteur Afrique le samedi à 20 h.")
