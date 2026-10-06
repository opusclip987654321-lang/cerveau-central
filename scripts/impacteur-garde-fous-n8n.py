#!/usr/bin/env python3
"""Garde-fous Impacteur validés le 06/10 : brouillons dans le bon compte Gmail
(avec le logo de la chaîne) et alerte Telegram quand un texte ne colle pas.

À lancer sur le VPS Nūr :
    python3 scripts/impacteur-garde-fous-n8n.py              (montre tout, ne change rien)
    python3 scripts/impacteur-garde-fous-n8n.py --appliquer  (modifie n8n)

Ce que fait --appliquer :
1. IMPACTEUR D (actif) : les nœuds « créer brouillon » Afrique et Frexit reçoivent
   chacun l'accès Gmail de LEUR chaîne (copié depuis les nœuds d'envoi d'IMPACTEUR C,
   qui font déjà bien la séparation) ; le brouillon devient un vrai mail mis en forme
   avec le logo de la chaîne en signature (servi par le cerveau, adresse publique).
2. IMPACTEUR C (actif) : une invitation complète dont le texte ne correspond pas au
   modèle de sa chaîne (signature ou exemple) n'est plus écartée en silence : rien ne
   part, et un message Telegram te liste les fiches retenues pour que tu tranches.
Le script refuse de deviner : si un repère a changé, il s'arrête et montre la
structure réelle, à coller dans le fil Claude.
"""
import json
import pathlib
import sys
import urllib.request

APPLIQUER = "--appliquer" in sys.argv
NOM_C = "IMPACTEUR C - ENVOIS AUTOMATIQUES"
NOM_D = "IMPACTEUR D - TELEGRAM"
LOGOS = "https://cerveau.nourmeet.com/logos/"

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

# ── 2. np_envois : la colonne erreur existe-t-elle (cause des échecs Nūr Meet) ? ─
try:
    tables = api("GET", "/api/v1/data-tables?limit=100").get("data", [])
    t = next((x for x in tables if x.get("name") == "np_envois"), None)
    colonnes = {c.get("name") for c in (t or {}).get("columns", [])} or set((api("GET", f"/api/v1/data-tables/{t['id']}/rows?limit=1").get("data") or [{}])[0].keys())
    if "erreur" in colonnes:
        print("\nnp_envois : la colonne « erreur » existe — les causes d'échec s'enregistrent déjà.")
    else:
        print("\nnp_envois : PAS de colonne « erreur ». À ajouter dans n8n (Data tables → np_envois → Add column → erreur, type string), puis les prochains échecs porteront leur cause.")
except Exception as err:  # noqa: BLE001 — l'inventaire des colonnes ne doit pas bloquer les garde-fous.
    print(f"\nnp_envois : vérification impossible ({err}).")

# ── 3. Les workflows C et D ACTIFS (les copies éteintes sont ignorées). ─────────
def actif(nom):
    copies = [w for w in workflows if w["name"] == nom]
    actifs = [w for w in copies if w.get("active")]
    return copies, actifs

copies_c, actifs_c = actif(NOM_C)
copies_d, actifs_d = actif(NOM_D)
if len(actifs_c) != 1:
    stop(f"« {NOM_C} » : {len(actifs_c)} copie(s) active(s) sur {len(copies_c)} — il en faut exactement une.", *copies_c)
if len(actifs_d) != 1:
    stop(f"« {NOM_D} » : {len(actifs_d)} copie(s) active(s) sur {len(copies_d)} — il en faut exactement une (le bot ✅/🗑 doit être allumé).", *copies_d)
wc = api("GET", f"/api/v1/workflows/{actifs_c[0]['id']}")
wd = api("GET", f"/api/v1/workflows/{actifs_d[0]['id']}")
nc = {n["name"]: n for n in wc["nodes"]}
nd = {n["name"]: n for n in wd["nodes"]}

# ── 4. D : le compte Gmail de chaque branche, copié depuis les envois de C. ─────
changements = []
for branche in ("AFRIQUE", "FREXIT"):
    envoi = nc.get(f"GMAIL {branche} - envoyer")
    brouillon = nd.get(f"GMAIL {branche} - créer brouillon")
    if not envoi or not brouillon:
        stop(f"Nœud Gmail introuvable (branche {branche}).", wc, wd)
    bon = (envoi.get("credentials") or {}).get("gmailOAuth2")
    actuel = (brouillon.get("credentials") or {}).get("gmailOAuth2") or {}
    if not bon:
        stop(f"« GMAIL {branche} - envoyer » (C) n'a pas d'accès Gmail lisible.", wc)
    if actuel.get("id") != bon.get("id"):
        brouillon.setdefault("credentials", {})["gmailOAuth2"] = dict(bon)
        changements.append(f"D / brouillon {branche} : accès « {actuel.get('name') or '?'} » → « {bon['name']} » (le même que l'envoi {branche} de C)")
    else:
        changements.append(f"D / brouillon {branche} : déjà le bon accès (« {bon['name']} »)")

# ── 5. D : le brouillon devient un mail mis en forme, logo de la chaîne compris. ─
prep = nd.get("PREPARER BROUILLON IMMEDIAT")
if not prep:
    stop("« PREPARER BROUILLON IMMEDIAT » introuvable dans D.", wd)
code = prep["parameters"].get("jsCode", "")
if LOGOS in code:
    changements.append("D / brouillon : mise en forme + logo déjà en place")
else:
    a_retour, a_message = "return [{json:{", "message:String(p.message_auteur||''),"
    if a_retour not in code or a_message not in code:
        stop("Le code de « PREPARER BROUILLON IMMEDIAT » a changé (repères introuvables).", wd)
    constructeur = (
        "const escH=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n"
        f"const logoUrl=/afrique/i.test(String(p.chaine||''))?'{LOGOS}impacteur-afrique.png':'{LOGOS}impacteur-frexit.png';\n"
        "const message_html='<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111\">'"
        "+escH(String(p.message_auteur||'')).replace(/\\n/g,'<br>')"
        "+'<br><br><img src=\"'+logoUrl+'\" width=\"88\" height=\"88\" alt=\"'+escH(String(p.chaine||''))+'\" style=\"border-radius:50%\"></div>';\n"
    )
    code = code.replace(a_retour, constructeur + a_retour, 1).replace(a_message, "message:message_html,", 1)
    prep["parameters"]["jsCode"] = code
    changements.append("D / brouillon : mail mis en forme (retours à la ligne) + logo de la chaîne en signature (servi par le cerveau)")

# ── 6. C : les textes qui ne collent pas → message Telegram, plus de silence. ───
sel = nc.get("SELECTIONNER ENVOIS")
if not sel:
    stop("« SELECTIONNER ENVOIS » introuvable dans C.", wc)
code = sel["parameters"].get("jsCode", "")
if "RETENU ?" in nc and "retenus" in code:
    changements.append("C / règle 2 : déjà en place")
else:
    a_sortie = "const sortie=[];"
    a_coherence = "if(!message.includes(FOOTER)||!message.endsWith('Cordialement,\\nWalid\\n'+String(r.chaine).trim()))continue;"
    a_fin = "return sortie;"
    if a_sortie not in code or a_coherence not in code or a_fin not in code:
        stop("Le code de « SELECTIONNER ENVOIS » a changé (repères introuvables).", wc)
    # esc existe déjà dans ce code : le message Telegram part en mode HTML.
    remplacement = (
        "if(!message.includes(FOOTER)||!message.endsWith('Cordialement,\\nWalid\\n'+String(r.chaine).trim()))"
        "{retenus.push('👤 '+esc(String(r.auteur||'?'))+' ('+esc(String(r.chaine||'?'))+') — /valider '+String(r.cle_unique||''));continue;}"
    )
    alerte = (
        "if(retenus.length&&chat_id)sortie.push({json:{retenu:true,chat_id,"
        "telegram_message:'⚠️ '+retenus.length+' invitation(s) retenue(s) avant envoi : le texte ne correspond pas au modèle de la chaîne (signature ou exemple). Rien n\\'est parti.\\n'"
        "+retenus.join('\\n')+'\\n\\nCorrige la fiche dans le Sheet, ou /valider CLE pour créer un brouillon à envoyer toi-même.'},pairedItem:{item:0}});\n"
    )
    code = (
        code.replace(a_sortie, a_sortie + "\nconst retenus=[];", 1)
        .replace(a_coherence, remplacement, 1)
        .replace(a_fin, alerte + a_fin, 1)
    )
    sel["parameters"]["jsCode"] = code

    # Deux nouveaux nœuds, calqués sur des nœuds existants pour garder les bonnes versions :
    # un aiguillage (copié de « VALIDATION OK ? » de D) et un envoi Telegram (copié de D).
    modele_if = nd.get("VALIDATION OK ?")
    modele_tg = nd.get("TELEGRAM - envoyer")
    compte = nc.get("COMPTE GMAIL ?")
    if not modele_if or not modele_tg or not compte:
        stop("Nœud modèle introuvable (VALIDATION OK ? / TELEGRAM - envoyer dans D, COMPTE GMAIL ? dans C).", wc, wd)
    x, y = (sel.get("position") or [0, 0])
    aiguillage = json.loads(json.dumps(modele_if, ensure_ascii=False))
    aiguillage.update({"id": "cerveau-retenu-if", "name": "RETENU ?", "position": [x + 220, y + 180]})
    aiguillage["parameters"] = {
        "conditions": {
            "options": {"caseSensitive": False, "leftValue": "", "typeValidation": "strict", "version": 3},
            "conditions": [{"id": "cerveau-retenu-cond", "leftValue": "={{ $json.retenu ? 'OUI' : 'NON' }}", "rightValue": "OUI", "operator": {"type": "string", "operation": "equals"}}],
            "combinator": "and",
        },
        "options": {},
    }
    telegram = json.loads(json.dumps(modele_tg, ensure_ascii=False))
    telegram.update({"id": "cerveau-retenu-telegram", "name": "TELEGRAM - retenus", "position": [x + 440, y + 320]})
    wc["nodes"].extend([aiguillage, telegram])
    wc["connections"]["SELECTIONNER ENVOIS"] = {"main": [[{"node": "RETENU ?", "type": "main", "index": 0}]]}
    wc["connections"]["RETENU ?"] = {"main": [[{"node": "TELEGRAM - retenus", "type": "main", "index": 0}], [{"node": "COMPTE GMAIL ?", "type": "main", "index": 0}]]}
    changements.append("C / règle 2 : invitations au texte non conforme → liste envoyée sur Telegram (un seul message par tournée), rien ne part ; le reste suit le circuit normal")

print("\nCe qui sera fait :")
for c in changements:
    print(f"  - {c}")
print("\nAu passage : l'exemple d'interview en bas des invitations est pour l'instant celui d'Afrique, pour les deux chaînes (vérifié dans le code de C). Pour un exemple Frexit, donne à Claude le lien d'une interview Frexit.")

print("\n--- Structure d'IMPACTEUR D actif (à coller dans le fil Claude, aucun secret) ---")
print(structure(wd))
print("--- fin ---")

if not APPLIQUER:
    print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
    sys.exit(0)

for w in (wd, wc):
    api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
    try:
        api("POST", f"/api/v1/workflows/{w['id']}/activate")
    except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
        pass
print("\nEnregistré. Dès maintenant : brouillons dans le bon compte avec logo, et alerte Telegram pour les textes retenus.")
