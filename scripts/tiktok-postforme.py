#!/usr/bin/env python3
"""Choix de louis du 14/10 : publier les Shorts sur TikTok tout seuls, via Post for Me
(mode Quickstart : leur appli TikTok, déjà validée par TikTok).

À lancer sur le VPS Nūr (là où est le .env du cerveau, qui doit contenir POSTFORME_API_KEY) :
    python3 scripts/tiktok-postforme.py --comptes    (liste les comptes reliés à Post for Me, ne change rien)
    python3 scripts/tiktok-postforme.py              (montre ce qui sera fait, ne change rien)
    python3 scripts/tiktok-postforme.py --appliquer  (branche TikTok dans n8n.actualitevideo.fr)
    python3 scripts/tiktok-postforme.py --remettre   (revient au TikTok à la main)

Ce que fait --appliquer, dans PUBLICATION 1 (L'extrait politique) et PUBLICATION AFRIQUE :
1. Un nœud « Publier sur TikTok » envoie le Short à Post for Me, avec la même légende que
   Facebook et le lien public temporaire de la vidéo (celui que Facebook utilise déjà).
   Un échec TikTok n'empêche pas Facebook et Instagram.
2. Le message Telegram « À publier sur TikTok » et la file de l'atelier sont désactivés :
   louis n'a plus rien à faire.
3. Le récapitulatif note le résultat TikTok ; un échec part dans les alertes comme les autres.
La clé reste dans le .env du serveur : le script la range dans un accès n8n « Post for Me ».
POSTFORME_TIKTOK_BROUILLON=1 dans le .env : la vidéo arrive en brouillon dans l'appli TikTok
(notification, louis publie d'un geste) au lieu d'être publiée directement.
Le script refuse de deviner : si un repère a changé, il s'arrête et le dit.
"""
import json
import pathlib
import sys
import urllib.error
import urllib.request

APPLIQUER = "--appliquer" in sys.argv
REMETTRE = "--remettre" in sys.argv
COMPTES = "--comptes" in sys.argv

# Workflow → repère du compte TikTok (cherché dans le nom d'utilisateur ou le nom affiché).
WORKFLOWS = {
    "PUBLICATION 1 - Diffusion (YouTube privé + Facebook + Instagram auto, TikTok manuel)": "extrait",
    "PUBLICATION AFRIQUE - Diffusion Impacteur Afrique (YouTube + Facebook + Instagram, TikTok manuel)": "impacteur_afrique",
}
NOEUD = "Publier sur TikTok"
AVANT, APRES = "Lien public temporaire", "Meta en pause ?"
MANUELS = ["File TikTok", "Récupérer le fichier", "Envoyer pour TikTok"]  # File TikTok : PUBLICATION 1 seulement
NOM_ACCES = "Post for Me"
LIGNE_MAIN = "`📲 TikTok : à publier à la main (vidéo ci-dessus)`"
LIGNE_AUTO = "tkLigne"
REPERE_LIGNES = "const lignes = ["
CODE_TIKTOK = r"""// ---- TikTok (Post for Me) ----
const tk = get('Publier sur TikTok') || {};
const tkErr = tk.error ? (tk.error.message || JSON.stringify(tk.error)) : (tk.id ? '' : 'échec sans message');
const tkLigne = tkErr ? `❌ TikTok : ${esc(court(tkErr))} — détail dans l'alerte` : `✅ TikTok : envoyé à Post for Me (${esc(tk.id)})`;
if (tkErr) ev.push({ type: 'echec', plateforme: 'tiktok', workflow: W, noeud: 'Publier sur TikTok', video, brut: tkErr, exec_id: String($execution.id),
  impact: `« ${titre} » n'est pas publié sur TikTok.` });
"""

env = {}
for ligne in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
base = (env.get("N8N_ACTUALITE_URL") or "https://n8n.actualitevideo.fr").rstrip("/")
cle = env.get("N8N_ACTUALITE_API_KEY") or sys.exit("N8N_ACTUALITE_API_KEY manquant dans .env")
pfm = (env.get("POSTFORME_URL") or "https://api.postforme.dev/v1").rstrip("/")
cle_pfm = env.get("POSTFORME_API_KEY")
brouillon = env.get("POSTFORME_TIKTOK_BROUILLON", "") in ("1", "oui", "true")


def stop(message):
    print(f"\n✋ {message}\nRien n'a été modifié. Colle cette sortie dans le fil Claude.")
    sys.exit(1)


def appel(url, cles, methode="GET", corps=None):
    req = urllib.request.Request(url, method=methode, data=json.dumps(corps).encode() if corps is not None else None,
                                 headers={**cles, "accept": "application/json", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "{}")


def api(methode, url, corps=None):
    return appel(base + url, {"X-N8N-API-KEY": cle}, methode, corps)


def comptes_tiktok():
    if not cle_pfm:
        stop("POSTFORME_API_KEY manquant dans .env (commande : echo 'POSTFORME_API_KEY=ta_cle' >> ~/cerveau-central/.env).")
    try:
        rep = appel(f"{pfm}/social-accounts?platform=tiktok&limit=100", {"Authorization": f"Bearer {cle_pfm}"})
    except urllib.error.HTTPError as e:
        stop(f"Post for Me répond {e.code} sur {pfm}/social-accounts : {e.read()[:400].decode(errors='replace')}")
    liste = rep.get("data", rep) if isinstance(rep, dict) else rep
    if not isinstance(liste, list):
        stop(f"Réponse inattendue de Post for Me : {json.dumps(rep, ensure_ascii=False)[:600]}")
    return [c for c in liste if str(c.get("platform", "tiktok")).lower().startswith("tiktok")]


def nom(c):
    return f"{c.get('username') or ''} {c.get('display_name') or c.get('name') or ''}".lower()


if COMPTES:
    cs = comptes_tiktok()
    print(f"Comptes TikTok reliés à Post for Me : {len(cs)}")
    for c in cs:
        print(f"  - {c.get('id')} | @{c.get('username')} | {c.get('display_name') or c.get('name') or ''} | {c.get('status') or ''}")
    if cs:
        print(f"\nExemple complet (à coller dans le fil Claude) :\n{json.dumps(cs[0], ensure_ascii=False)[:800]}")
    sys.exit(0)

ids = {}
if not REMETTRE:
    cs = comptes_tiktok()
    for wf, repere in WORKFLOWS.items():
        trouves = [c for c in cs if repere in nom(c).replace(" ", "_") or repere in nom(c)]
        if len(trouves) != 1:
            stop(f"Compte TikTok « {repere} » : {len(trouves)} trouvé(s) parmi {[nom(c).strip() for c in cs]}.")
        ids[wf] = trouves[0]["id"]

workflows = api("GET", "/api/v1/workflows?limit=250")["data"]
a_enregistrer, changements, acces_id = [], [], None
for wf in WORKFLOWS:
    actifs = [w for w in workflows if w["name"] == wf and w.get("active")]
    if len(actifs) != 1:
        stop(f"« {wf} » : {len(actifs)} copie(s) active(s), il en faut exactement une.")
    w = api("GET", f"/api/v1/workflows/{actifs[0]['id']}")
    noeuds = {n["name"]: n for n in w["nodes"]}
    court_nom = wf.split(" - ")[0]
    for n in (AVANT, APRES, "Récapitulatif", "Envoyer pour TikTok", "Récupérer le fichier"):
        if n not in noeuds:
            stop(f"Nœud « {n} » introuvable dans {court_nom}.")
    for n in w["nodes"]:  # l'accès existe peut-être déjà (2e workflow ou relance)
        if n["name"] == NOEUD and n.get("credentials", {}).get("httpHeaderAuth"):
            acces_id = acces_id or n["credentials"]["httpHeaderAuth"]["id"]
    recap = noeuds["Récapitulatif"]["parameters"]
    branche = NOEUD in noeuds

    if REMETTRE:
        if not branche:
            changements.append(f"{court_nom} : déjà au TikTok à la main")
            continue
        w["nodes"] = [n for n in w["nodes"] if n["name"] != NOEUD]
        w["connections"].pop(NOEUD, None)
        w["connections"][AVANT] = {"main": [[{"node": APRES, "type": "main", "index": 0}]]}
        for n in MANUELS:
            if n in noeuds:
                noeuds[n].pop("disabled", None)
        code = recap["jsCode"]
        if code.count(CODE_TIKTOK) == 1:
            code = code.replace(CODE_TIKTOK, "")
        recap["jsCode"] = code.replace(f", {LIGNE_AUTO}].filter", f", {LIGNE_MAIN}].filter")
        changements.append(f"{court_nom} : retour au TikTok à la main (message Telegram remis)")
        a_enregistrer.append(w)
        continue

    corps = ("={{ JSON.stringify({ caption: $('Préparer').first().json.legende.slice(0, 2200), "
             f"social_accounts: ['{ids[wf]}'], media: [{{ url: $('{AVANT}').first().json.url }}], "
             f"platform_configurations: {{ tiktok: {{ privacy_status: 'public'{', is_draft: true' if brouillon else ''} }} }} }}) }}}}")
    parametres = {"method": "POST", "url": f"{pfm}/social-posts", "authentication": "genericCredentialType",
                  "genericAuthType": "httpHeaderAuth", "sendBody": True, "specifyBody": "json", "jsonBody": corps,
                  "options": {"timeout": 120000}}
    if branche:
        if noeuds[NOEUD]["parameters"] != parametres:
            noeuds[NOEUD]["parameters"] = parametres
            changements.append(f"{court_nom} : envoi TikTok déjà branché, réglages remis à jour")
            a_enregistrer.append(w)
        else:
            changements.append(f"{court_nom} : déjà branché, rien à faire")
        continue

    suite = w["connections"].get(AVANT)
    if [[c.get("node") for c in g] for g in (suite or {}).get("main", [])] != [[APRES]]:
        stop(f"« {AVANT} » ne mène plus directement à « {APRES} » dans {court_nom} : {json.dumps(suite, ensure_ascii=False)}")
    code = recap["jsCode"]
    if code.count(LIGNE_MAIN) != 1 or code.count(REPERE_LIGNES) != 1:
        stop(f"Repère de la ligne TikTok introuvable dans le récapitulatif de {court_nom}.")
    recap["jsCode"] = code.replace(REPERE_LIGNES, CODE_TIKTOK + REPERE_LIGNES).replace(LIGNE_MAIN, LIGNE_AUTO)
    x, y = noeuds[AVANT]["position"]
    w["nodes"].append({"name": NOEUD, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [x + 50, y - 200],
                       "onError": "continueRegularOutput", "parameters": parametres, "credentials": {}})
    w["connections"][AVANT] = {"main": [[{"node": NOEUD, "type": "main", "index": 0}]]}
    w["connections"][NOEUD] = {"main": [[{"node": APRES, "type": "main", "index": 0}]]}
    for n in MANUELS:
        if n in noeuds:
            noeuds[n]["disabled"] = True
    changements += [f"{court_nom} : chaque Short part aussi sur TikTok via Post for Me ({'brouillon' if brouillon else 'public'})",
                    f"{court_nom} : message Telegram « À publier sur TikTok » coupé"]
    a_enregistrer.append(w)

print("Ce qui sera fait :")
for c in changements:
    print(f"  - {c}")
if not (APPLIQUER or REMETTRE):
    print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
    sys.exit(0)
if not a_enregistrer:
    print("\nRien à enregistrer.")
    sys.exit(0)

for w in a_enregistrer:
    n = next((n for n in w["nodes"] if n["name"] == NOEUD), None)
    if n is not None and not n["credentials"]:
        if not acces_id:
            acces = api("POST", "/api/v1/credentials", {"name": NOM_ACCES, "type": "httpHeaderAuth",
                                                         "data": {"name": "Authorization", "value": f"Bearer {cle_pfm}"}})
            acces_id = acces.get("id") or stop(f"n8n n'a pas créé l'accès : {json.dumps(acces, ensure_ascii=False)[:300]}")
        n["credentials"] = {"httpHeaderAuth": {"id": acces_id, "name": NOM_ACCES}}
    api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"],
                                                 "settings": w.get("settings", {})})
    try:
        api("POST", f"/api/v1/workflows/{w['id']}/activate")
    except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
        pass
print("\nEnregistré." + ("" if REMETTRE else " Le prochain Short validé part aussi sur TikTok."))
