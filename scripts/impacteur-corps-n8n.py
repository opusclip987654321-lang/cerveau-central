#!/usr/bin/env python3
"""Fait enregistrer par IMPACTEUR C le texte envoyé et le compte utilisé.

À lancer sur le VPS Nūr, après avoir ajouté les colonnes « corps » et
« compte_envoi » dans la ligne d'en-tête de l'onglet Prospection du Sheet :
    python3 scripts/impacteur-corps-n8n.py              (montre ce qui sera fait)
    python3 scripts/impacteur-corps-n8n.py --appliquer  (modifie n8n)

Sur chaque branche d'« IMPACTEUR C - ENVOIS AUTOMATIQUES », le nœud
« SAUVER ENVOI » écrira en plus :
- corps = le texte du mail réellement envoyé ({{ $json.message_html }}) ;
- compte_envoi = le nom de l'accès Gmail de la branche (la vraie trace du
  compte qui a envoyé, plus une simple déclaration).
Rien d'autre ne change : aucun envoi, aucune règle nouvelle.
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

NOM = "IMPACTEUR C - ENVOIS AUTOMATIQUES"
# Par branche : le nœud Gmail (porte le nom de l'accès), le nœud code qui prépare
# la ligne du Sheet (c'est LUI qui doit porter corps et compte_envoi, car le nœud
# d'écriture ne voit que ce qu'il produit), et le nœud d'écriture dans le Sheet.
BRANCHES = {
    "AFRIQUE": ("GMAIL AFRIQUE - envoyer", "MARQUER ENVOYE AFRIQUE", "SAUVER ENVOI AFRIQUE"),
    "FREXIT": ("GMAIL FREXIT - envoyer", "MARQUER ENVOYE FREXIT", "SAUVER ENVOI FREXIT"),
}
ANCRE = "statut:'ENVOYE',"

env = {}
for ligne in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

base = (env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/")
cle = env.get("N8N_API_KEY") or sys.exit("N8N_API_KEY manquant dans .env")
jeton = env.get("RELEVE_JETON") or sys.exit("RELEVE_JETON manquant dans .env")
appliquer = "--appliquer" in sys.argv


def api(methode, url, corps=None):
    req = urllib.request.Request(
        base + url,
        method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"X-N8N-API-KEY": cle, "accept": "application/json", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "{}")


# 1. Les colonnes doivent déjà exister dans le Sheet, sinon l'envoi planterait.
chemin = "cerveau-impacteur-" + hashlib.sha256(("impacteur:" + jeton).encode()).hexdigest()[:32]
with urllib.request.urlopen(f"{base}/webhook/{chemin}", timeout=60) as r:
    lignes = json.loads(r.read() or "[]")
lignes = lignes if isinstance(lignes, list) else [lignes]
colonnes = set(lignes[0].keys()) if lignes else set()
manquantes = {"corps", "compte_envoi"} - colonnes
if manquantes:
    sys.exit(
        f"Il manque {', '.join(sorted(manquantes))} dans la ligne d'en-tête de l'onglet Prospection du Sheet.\n"
        "Ajoute ces colonnes (deux cellules en haut, peu importe la position), puis relance ce script."
    )
print("Colonnes corps et compte_envoi trouvées dans le Sheet : OK.")

# 2. Le workflow actif, et ses quatre nœuds.
workflows = api("GET", "/api/v1/workflows?limit=250")["data"]
w = next((x for x in workflows if x["name"] == NOM), None)
if not w:
    sys.exit(f"Automatisation « {NOM} » introuvable.")
noeuds = {n["name"]: n for n in w["nodes"]}

changements = []
for branche, (nom_gmail, nom_marqueur, nom_sauver) in BRANCHES.items():
    gmail, marqueur, sauver = noeuds.get(nom_gmail), noeuds.get(nom_marqueur), noeuds.get(nom_sauver)
    if not gmail or not marqueur or not sauver:
        sys.exit(f"Nœud introuvable dans « {NOM} » ({nom_gmail} / {nom_marqueur} / {nom_sauver}).")
    compte = (gmail.get("credentials", {}).get("gmailOAuth2") or {}).get("name") or f"compte {branche}"
    # 2a. Le nœud code ajoute corps (le texte vraiment passé au nœud Gmail) et
    #     compte_envoi (le nom de l'accès Gmail de la branche) à la ligne produite.
    code = marqueur["parameters"].get("jsCode", "")
    deja = "corps:" in code
    if not deja:
        if ANCRE not in code:
            sys.exit(f"Le code de « {nom_marqueur} » a changé (repère « {ANCRE} » introuvable) : à re-regarder avec Claude avant de patcher.")
        litteral = compte.replace("\\", "\\\\").replace("'", "\\'")
        marqueur["parameters"]["jsCode"] = code.replace(ANCRE, f"{ANCRE}\n  corps:String(o.message_html||''),compte_envoi:'{litteral}',", 1)
    # 2b. Le nœud d'écriture recopie ces deux champs dans les colonnes du Sheet.
    valeurs = sauver["parameters"]["columns"].setdefault("value", {})
    valeurs["corps"] = "={{ $json.corps }}"
    valeurs["compte_envoi"] = "={{ $json.compte_envoi }}"
    changements.append((branche, compte, deja))

comptes = [c for _, c, _ in changements]
if len(set(comptes)) == 1:
    print(f"⚠ Les deux branches utilisent le même accès Gmail (« {comptes[0]} ») : à signaler à Claude, c'est louche.")
for branche, compte, deja in changements:
    if compte.strip().lower() in ("gmail account", "gmail"):
        print(f"ℹ {branche} : l'accès Gmail s'appelle juste « {compte} ». Tu peux le renommer dans n8n (Credentials) avant d'appliquer, pour une trace plus claire.")
    print(f"{branche} : corps = texte envoyé, compte_envoi = « {compte} »{' (déjà en place, sera réécrit)' if deja else ''}")

# 3. La structure complète de C, à coller dans le fil Claude : elle sert à
#    préparer le garde-fou avant envoi (règles Afrique/Frexit validées le 06/10).
print("\n--- Structure d'IMPACTEUR C (à coller dans le fil Claude, aucun secret dedans) ---")
for n in w["nodes"]:
    p = n.get("parameters", {})
    extrait = json.dumps({k: p[k] for k in ("conditions", "rules", "jsCode", "functionCode", "mode", "value1", "value2", "operation") if k in p}, ensure_ascii=False)
    print(f"- {n['name']} ({n['type']})" + (f" :: {extrait[:500]}" if extrait != "{}" else ""))
print("connections =", json.dumps(w["connections"], ensure_ascii=False)[:3000])
print("--- fin de la structure ---\n")

if not appliquer:
    print("Rien n'a été modifié. Relance avec --appliquer pour enregistrer les colonnes corps et compte_envoi dans n8n.")
    sys.exit(0)

# 3. Enregistrer, en gardant le workflow tel quel pour tout le reste.
corps_put = {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})}
api("PUT", f"/api/v1/workflows/{w['id']}", corps_put)
if w.get("active"):
    try:
        api("POST", f"/api/v1/workflows/{w['id']}/activate")
    except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
        pass
print("Enregistré. Dès le prochain envoi, le Sheet gardera le texte et le compte ; le cerveau les affichera à la synchronisation suivante.")
