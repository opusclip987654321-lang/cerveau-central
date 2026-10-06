#!/usr/bin/env python3
"""Sauvegarde chaque nuit toutes les automatisations des deux n8n dans un dépôt GitHub PRIVÉ.

Pourquoi : les automatisations n'existent que sur les serveurs. Si un VPS tombe ou si une
automatisation est cassée par erreur, ce dépôt permet de la réimporter telle qu'elle était
(n8n → Import from file), à n'importe quelle date passée.

À lancer sur le VPS Nūr (là où est le .env du cerveau, avec les deux clés n8n) :
    python3 scripts/sauvegarde-n8n.py            # exporte, enregistre et envoie sur GitHub
    python3 scripts/sauvegarde-n8n.py --essai    # exporte seulement, n'envoie rien

Lecture seule côté n8n. Les accès (credentials) n'en sortent que par leur nom, jamais leur
valeur ; une clé écrite en clair dans un nœud est remplacée par un repère « à ressaisir » ;
les données d'essai épinglées (pinData, souvent de vrais mails) sont retirées.
En cas d'échec, une alerte part sur le Telegram du cerveau.
Réglage facultatif dans le .env : SAUVEGARDE_N8N_DOSSIER (par défaut ~/sauvegarde-n8n).
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parent.parent
# Une entrée par n8n : dossier dans la sauvegarde, variable de l'adresse, variable de la clé.
INSTANCES = [
    ("n8n-nourmeet", "N8N_URL", "N8N_API_KEY"),
    ("n8n-actualite", "N8N_ACTUALITE_URL", "N8N_ACTUALITE_API_KEY"),
]
# Ce qu'il faut pour réimporter une automatisation ; le reste (pinData, dates, statistiques) change sans raison.
CHAMPS_GARDES = ["id", "name", "active", "nodes", "connections", "settings", "tags"]


def lire_env(chemin):
    env = {}
    if chemin.exists():
        for ligne in chemin.read_text().splitlines():
            if "=" in ligne and not ligne.lstrip().startswith("#"):
                k, v = ligne.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def lire_workflows(base, cle):
    """Toutes les automatisations, page par page (l'API n8n renvoie au plus 250 par page)."""
    workflows, curseur = [], None
    while True:
        params = {"limit": "250"}
        if curseur:
            params["cursor"] = curseur
        req = urllib.request.Request(
            f"{base}/api/v1/workflows?{urllib.parse.urlencode(params)}",
            headers={"X-N8N-API-KEY": cle, "accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            page = json.loads(r.read())
        workflows += page.get("data", [])
        curseur = page.get("nextCursor")
        if not curseur:
            return workflows


CHAMP_SECRET = re.compile(r"(api[_-]?key|apikey|token|secret|password|passwd|authorization|bearer)", re.I)
VALEUR_SECRETE = re.compile(r"(\bBearer\s+\S{12,}|\bsk-[A-Za-z0-9_-]{16,}|\bxox[abp]-\S+|\bAIza[0-9A-Za-z_-]{30,}|\bghp_[A-Za-z0-9]{30,}|\b\d{8,10}:[A-Za-z0-9_-]{30,})")
MASQUE = "[RETIRÉ DE LA SAUVEGARDE : à ressaisir]"


def masquer(valeur, nom="", compte=None):
    """Retire les clés écrites en clair dans les nœuds (en-têtes, champs « token »…) ; n8n s'en passe à l'import."""
    compte = compte if compte is not None else [0]
    if isinstance(valeur, dict):
        # Paire {name: "Authorization", value: "..."} des en-têtes et paramètres HTTP.
        if isinstance(valeur.get("name"), str) and CHAMP_SECRET.search(valeur["name"]) and isinstance(valeur.get("value"), str) and valeur["value"] and not valeur["value"].startswith("={{"):
            compte[0] += 1
            return {**valeur, "value": MASQUE}
        return {k: masquer(v, k, compte) for k, v in valeur.items()}
    if isinstance(valeur, list):
        return [masquer(v, nom, compte) for v in valeur]
    if isinstance(valeur, str) and valeur:
        # Une expression n8n ({{ $credentials… }}) ne contient pas la clé elle-même.
        if CHAMP_SECRET.search(nom) and not valeur.startswith("={{"):
            compte[0] += 1
            return MASQUE
        if VALEUR_SECRETE.search(valeur):
            compte[0] += 1
            return VALEUR_SECRETE.sub(MASQUE, valeur)
    return valeur


def nom_de_fichier(w):
    # L'id en suffixe : deux automatisations peuvent porter le même nom.
    lisible = re.sub(r"[^a-z0-9]+", "-", w["name"].lower()).strip("-")[:80] or "sans-nom"
    return f"{lisible}--{w['id']}.json"


def ecrire_instance(dossier, workflows):
    """Écrit un fichier par automatisation ; renvoie le nombre de clés retirées."""
    dossier.mkdir(parents=True, exist_ok=True)
    attendus, compte = set(), [0]
    for w in workflows:
        nom = nom_de_fichier(w)
        attendus.add(nom)
        propre = {k: w[k] for k in CHAMPS_GARDES if k in w}
        propre["nodes"] = [{**n, "parameters": masquer(n.get("parameters", {}), "", compte)} for n in propre.get("nodes", [])]
        (dossier / nom).write_text(json.dumps(propre, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    # Une automatisation supprimée dans n8n disparaît aussi ici (elle reste dans l'historique git).
    for f in dossier.glob("*.json"):
        if f.name not in attendus:
            f.unlink()
    return compte[0]


def git(dossier, *args):
    return subprocess.run(["git", "-C", str(dossier), *args], check=True, capture_output=True, text=True).stdout


def telegram(env, texte):
    jeton, chat = env.get("TELEGRAM_BOT_TOKEN"), env.get("TELEGRAM_CHAT_ID")
    if not (jeton and chat):
        return
    donnees = urllib.parse.urlencode({"chat_id": chat, "text": texte}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{jeton}/sendMessage", data=donnees, timeout=20)
    except Exception:
        pass


def main():
    essai = "--essai" in sys.argv
    env = lire_env(RACINE / ".env")
    dossier = pathlib.Path(os.path.expanduser(env.get("SAUVEGARDE_N8N_DOSSIER") or "~/sauvegarde-n8n"))
    if not essai and not (dossier / ".git").exists():
        sys.exit(f"{dossier} n'est pas un dépôt git : voir « Sauvegarde des automatisations n8n » dans le README.")

    resume, erreurs = [], []
    for sous_dossier, var_url, var_cle in INSTANCES:
        base, cle = (env.get(var_url) or "").rstrip("/"), env.get(var_cle)
        if not (base and cle):
            continue
        try:
            workflows = lire_workflows(base, cle)
        except Exception as e:
            # On ne touche pas aux fichiers de ce n8n : une panne ne doit pas effacer la sauvegarde.
            erreurs.append(f"{sous_dossier} : {e}")
            continue
        retirees = ecrire_instance(dossier / sous_dossier, workflows)
        resume.append(f"{sous_dossier} : {len(workflows)} automatisations" + (f" ({retirees} clés en clair retirées)" if retirees else ""))

    print("\n".join(resume + [f"ERREUR {e}" for e in erreurs]) or "Aucun n8n configuré dans .env.")
    if essai:
        print(f"Essai : fichiers écrits dans {dossier}, rien envoyé.")
    elif resume:
        git(dossier, "add", "-A")
        if git(dossier, "status", "--porcelain").strip():
            git(dossier, "commit", "-q", "-m", "Sauvegarde : " + ", ".join(resume))
            git(dossier, "push", "-q")
            print("Changements envoyés sur GitHub.")
        else:
            print("Aucun changement depuis la dernière sauvegarde.")

    if erreurs or not resume:
        telegram(env, "⚠️ Sauvegarde n8n incomplète : " + ("; ".join(erreurs) or "aucun n8n lu"))
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        telegram(lire_env(RACINE / ".env"), f"⚠️ Sauvegarde n8n : l'envoi sur GitHub a échoué ({(e.stderr or '').strip()[:300]})")
        sys.exit(f"git a échoué : {e.stderr}")
