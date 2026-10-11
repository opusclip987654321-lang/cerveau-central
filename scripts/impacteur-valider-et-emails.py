#!/usr/bin/env python3
"""Demandes de louis du 11/10 (suite) : le bouton Valider du site agit pour de vrai,
et c'est louis qui fournit les adresses e-mail (fin de la chasse automatique).

À lancer sur le VPS Nūr :
    python3 scripts/impacteur-valider-et-emails.py              (montre tout, ne change rien)
    python3 scripts/impacteur-valider-et-emails.py --appliquer  (modifie n8n et le .env)

Ce que fait --appliquer :
1. IMPACTEUR D : une porte d'entrée secrète (webhook) pour le site du cerveau ;
   Valider sur la page Impacteur = brouillon Gmail créé dans la boîte de la chaîne,
   Rejeter = fiche écartée, exactement comme ✅/🗑 sur Telegram (confirmations Telegram).
   L'adresse secrète est écrite dans le .env du cerveau (IMPACTEUR_VALIDATION_URL).
2. IMPACTEUR A et B : plus de recherche d'adresse (Brave contact retiré) ; la fiche est
   préparée, et Telegram demande à louis de mettre l'adresse dans la colonne
   email_contact du Sheet.
3. IMPACTEUR C et D : l'adresse écrite par louis dans email_contact passe en premier
   (envoi automatique à 10h07/15h07, ou brouillon via Valider / ✅).
Le script refuse de deviner : si un repère a changé, il s'arrête et montre la
structure réelle, à coller dans le fil Claude.
"""
import json
import pathlib
import secrets
import sys
import urllib.request
import uuid

APPLIQUER = "--appliquer" in sys.argv
NOM_A = "IMPACTEUR A - DECOUVERTE LIVRES"
NOM_B = "IMPACTEUR B - DECOUVERTE YOUTUBE"
NOM_C = "IMPACTEUR C - ENVOIS AUTOMATIQUES"
NOM_D = "IMPACTEUR D - TELEGRAM"
ENV_FICHIER = pathlib.Path(__file__).resolve().parent.parent / ".env"

env = {}
for ligne in ENV_FICHIER.read_text().splitlines():
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


workflows = api("GET", "/api/v1/workflows?limit=250")["data"]
print("Inventaire n8n (nom [état] id) :")
for w in sorted(workflows, key=lambda x: (x["name"], not x.get("active"))):
    print(f"  {w['name']} [{'ON' if w.get('active') else 'off'}] {w.get('id')}")


def actif(nom):
    copies = [w for w in workflows if w["name"] == nom]
    actifs = [w for w in copies if w.get("active")]
    if len(actifs) != 1:
        stop(f"« {nom} » : {len(actifs)} copie(s) active(s) sur {len(copies)} — il en faut exactement une.", *copies)
    return api("GET", f"/api/v1/workflows/{actifs[0]['id']}")


wa, wb, wc, wd = actif(NOM_A), actif(NOM_B), actif(NOM_C), actif(NOM_D)
na = {n["name"]: n for n in wa["nodes"]}
nb = {n["name"]: n for n in wb["nodes"]}
nc = {n["name"]: n for n in wc["nodes"]}
nd = {n["name"]: n for n in wd["nodes"]}
changements = []
modifies = set()


def noeud(table, nom, w):
    n = table.get(nom)
    if not n:
        stop(f"Nœud « {nom} » introuvable dans {w['name']}.", w)
    return n


def remplacer_code(w, n, ancre, nouveau, deja, message):
    code = n["parameters"].get("jsCode", "")
    if deja in code:
        changements.append(f"{message} : déjà en place")
        return
    if code.count(ancre) != 1:
        stop(f"Repère introuvable ou multiple dans « {n['name']} » ({w['name']}).", w)
    n["parameters"]["jsCode"] = code.replace(ancre, nouveau, 1)
    modifies.add(w["id"])
    changements.append(message)


# ── 1. D : la porte d'entrée du site (webhook secret) et son interprète. ─────────
lire_val = noeud(nd, "LIRE FICHES VALIDATION", wd)
url_env = env.get("IMPACTEUR_VALIDATION_URL", "")
webhook = nd.get("CERVEAU - demande (webhook)")
if webhook:
    chemin = str(webhook["parameters"].get("path", ""))
    changements.append("D / porte du site : déjà en place")
else:
    chemin = url_env.rsplit("/webhook/", 1)[1] if "/webhook/" in url_env else "cerveau-valider-" + secrets.token_hex(8)
    x, y = lire_val.get("position") or [1056, 2384]
    webhook = {
        "id": "cerveau-valider-webhook", "name": "CERVEAU - demande (webhook)",
        "type": "n8n-nodes-base.webhook", "typeVersion": 2, "webhookId": str(uuid.uuid4()),
        "position": [x - 440, y], "parameters": {"httpMethod": "POST", "path": chemin, "options": {}},
    }
    analyse_code = (
        "// Demande du site du cerveau (boutons Valider / Rejeter de la page Impacteur).\n"
        "// L'adresse du webhook est secrète (gardée dans le .env du cerveau) : elle vaut autorisation.\n"
        "const corps=$input.first().json.body||{};\n"
        "const store=$getWorkflowStaticData('global');\n"
        "if(!store.telegram_owner_user_id)return [];\n"
        "const choix=String(corps.choix||'');\n"
        "if(choix!=='valider'&&choix!=='rejeter')return [];\n"
        "const auteur=String(corps.auteur||'').trim().slice(0,120);\n"
        "const livre=String(corps.livre||'').trim().slice(0,160);\n"
        "if(!auteur)return [];\n"
        "return [{json:{route:'validation',action:choix,chat_id:String(store.telegram_chat_id||''),cle_unique:'',auteur,livre,origine:'site'}}];"
    )
    analyse = {
        "id": "cerveau-valider-analyse", "name": "CERVEAU - analyser demande",
        "type": "n8n-nodes-base.code", "typeVersion": 2,
        "position": [x - 220, y], "parameters": {"jsCode": analyse_code},
    }
    wd["nodes"].extend([webhook, analyse])
    wd["connections"]["CERVEAU - demande (webhook)"] = {"main": [[{"node": "CERVEAU - analyser demande", "type": "main", "index": 0}]]}
    wd["connections"]["CERVEAU - analyser demande"] = {"main": [[{"node": "LIRE FICHES VALIDATION", "type": "main", "index": 0}]]}
    modifies.add(wd["id"])
    changements.append("D / porte du site : Valider/Rejeter sur le site passe par n8n, confirmations sur Telegram")

# ── 2. D : PREPARER VALIDATION comprend les demandes du site et l'email de louis. ─
prep_val = noeud(nd, "PREPARER VALIDATION", wd)
remplacer_code(wd, prep_val,
               "const req=$('ANALYSER MESSAGE').first().json;",
               "let req;try{req=$('ANALYSER MESSAGE').first().json;}catch(e){req=$('CERVEAU - analyser demande').first().json;}",
               "CERVEAU - analyser demande",
               "D / validation : accepte les demandes venues du site")
remplacer_code(wd, prep_val,
               "const cle=String(req.cle_unique||'').trim();",
               "let cle=String(req.cle_unique||'').trim();",
               "let cle=String(req.cle_unique||'').trim();",
               "D / validation : la clé devient modifiable (fiche retrouvée par auteur + livre)")
remplacer_code(wd, prep_val,
               "const row=rows.find(r=>String(r.cle_unique||'').trim()===cle);",
               "const normR=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();\n"
               "const row=cle?rows.find(r=>String(r.cle_unique||'').trim()===cle)"
               ":rows.find(r=>normR(r.auteur)===normR(req.auteur)&&normR(r.livre||'')===normR(req.livre||'')&&String(r.statut||'').trim().toUpperCase().startsWith('A_VERIFIER'));\n"
               "if(row&&!cle)cle=String(row.cle_unique||'').trim();",
               "normR(req.auteur)",
               "D / validation : une demande du site retrouve la fiche par auteur + livre")
remplacer_code(wd, prep_val,
               "telegram_message:'❌ Aucune fiche trouvée pour '+cle+'.'",
               "telegram_message:'❌ Aucune fiche trouvée pour '+(cle||String(req.auteur||'?'))+'.'",
               "(cle||String(req.auteur||'?'))",
               "D / validation : message d'erreur lisible pour une demande du site")
remplacer_code(wd, prep_val,
               "}else{\n  const best=candidats.find(x=>x&&x.email&&!publicDomains.has(String(x.email).split('@')[1]||''))||candidats.find(x=>x&&x.email);",
               "}else{\n  const saisie=String(row.email_contact||'').trim().toLowerCase();\n"
               "  const best=saisie?{email:saisie,source:String(row.source_contact_validee||'')}"
               ":(candidats.find(x=>x&&x.email&&!publicDomains.has(String(x.email).split('@')[1]||''))||candidats.find(x=>x&&x.email));",
               "const saisie=String(row.email_contact||'')",
               "D / validation : l'adresse mise par louis dans email_contact passe en premier")
remplacer_code(wd, prep_val,
               "telegram_message:'❌ Aucun email candidat pour '+cle+'.\\nRéponds : /email '+cle+' adresse@retiree.invalid'",
               "telegram_message:'❌ Pas d\\'adresse pour '+cle+'.\\nMets-la dans la colonne email_contact du Sheet, ou réponds : /email '+cle+' adresse@retiree.invalid'",
               "colonne email_contact du Sheet, ou réponds",
               "D / validation : le message « pas d'adresse » explique la colonne du Sheet")

# ── 3. A et B : plus de chasse aux adresses ; Telegram demande l'adresse à louis. ─
DOSSIER_A = (
    "// Dossier par candidat : plus de recherche d'adresse (louis met l'email dans la\n"
    "// colonne email_contact du Sheet, son choix du 11/10).\n"
    "const rows=$input.all();\n"
    "const out=[];\n"
    "for(let i=0;i<rows.length;i++){\n"
    " const base=rows[i].json;\n"
    " out.push({json:{...base,recherches_auteur:'',emails_candidats:'[]',sources_contacts:'[]'},pairedItem:{item:i}});\n"
    "}\n"
    "return out;"
)
DOSSIER_B = (
    "// Dossier par invité : plus de recherche d'adresse (louis met l'email dans la\n"
    "// colonne email_contact du Sheet, son choix du 11/10).\n"
    "const rows=$input.all();\n"
    "const out=[];\n"
    "for(let i=0;i<rows.length;i++){\n"
    " const base=rows[i].json;\n"
    " out.push({json:{...base,\n"
    "  recherches_auteur:'',emails_candidats:'[]',sources_contacts:'[]',\n"
    "  informations_a_verifier:JSON.stringify(['SOURCE_YOUTUBE : invité déduit du titre/description de la vidéo.','VIDEO : '+base.source_livre,'THEME_PROPOSE : '+String(base.theme||'')])\n"
    " },pairedItem:{item:i}});\n"
    "}\n"
    "return out;"
)
ANCRE_NOTIF = "best?('✉️ Email proposé : '+html(best.email)):'✉️ Aucun email trouvé automatiquement — utilise le bouton Email ci-dessous','',"
NOUVEAU_NOTIF = ("best?('✉️ Email proposé : '+html(best.email)):'✉️ À toi de jouer : mets l\\'adresse dans la colonne email_contact du Sheet "
                 "(envoi automatique à 10h07/15h07), ou réponds /email ci-dessous','',")

for w, table, aiguillage, brave, dossier_code in (
    (wa, na, "CANDIDATS ?", "BRAVE - contact auteur", DOSSIER_A),
    (wb, nb, "INVITES ?", "BRAVE - contact invité", DOSSIER_B),
):
    lettre = "A" if w is wa else "B"
    dossier = noeud(table, "PREPARER DOSSIER", w)
    code = dossier["parameters"].get("jsCode", "")
    if "plus de recherche d'adresse" in code:
        changements.append(f"{lettre} / adresses : déjà en place")
    else:
        if "recherches_auteur:JSON.stringify(results).slice(0,20000)," not in code:
            stop(f"Le code de « PREPARER DOSSIER » a changé ({w['name']}).", w)
        dossier["parameters"]["jsCode"] = dossier_code
        ifnode = noeud(table, aiguillage, w)
        cibles = w["connections"].get(ifnode["name"], {}).get("main", [[]])
        if not cibles or not cibles[0] or cibles[0][0].get("node") != brave:
            if cibles and cibles[0] and cibles[0][0].get("node") == "PREPARER DOSSIER":
                pass
            else:
                stop(f"Le câblage de « {aiguillage} » a changé ({w['name']}).", w)
        cibles[0] = [{"node": "PREPARER DOSSIER", "type": "main", "index": 0}]
        w["nodes"] = [n for n in w["nodes"] if n["name"] != brave]
        w["connections"].pop(brave, None)
        table.pop(brave, None)
        modifies.add(w["id"])
        changements.append(f"{lettre} / adresses : recherche retirée, la fiche se prépare sans Brave")
    remplacer_code(w, noeud(table, "PREPARER NOTIFICATIONS", w),
                   ANCRE_NOTIF, NOUVEAU_NOTIF, "colonne email_contact du Sheet",
                   f"{lettre} / Telegram : chaque fiche demande l'adresse à louis (colonne email_contact)")

# ── 4. C : l'adresse écrite par louis dans email_contact part en premier. ────────
sel = noeud(nc, "SELECTIONNER ENVOIS", wc)
remplacer_code(wc, sel,
               " const best=candidats.find(x=>x&&x.email&&!publicDomains.has(String(x.email).split('@')[1]||''))||candidats.find(x=>x&&x.email);\n"
               " if(!best)continue; // pas d'email -> reste en validation manuelle (/email via Telegram)",
               " // L'adresse écrite par louis dans la colonne email_contact passe en premier (11/10).\n"
               " const saisie=String(r.email_contact||'').trim().toLowerCase();\n"
               " const best=saisie?{email:saisie,source:String(r.source_contact_validee||'')}"
               ":(candidats.find(x=>x&&x.email&&!publicDomains.has(String(x.email).split('@')[1]||''))||candidats.find(x=>x&&x.email));\n"
               " if(!best)continue; // pas d'email -> louis l'ajoute dans la colonne email_contact du Sheet (ou /email via Telegram)",
               "const saisie=String(r.email_contact||'')",
               "C / envois : l'adresse mise par louis dans email_contact part en premier")

print("\nCe qui sera fait :")
for c in changements:
    print(f"  - {c}")

url_webhook = f"{base}/webhook/{chemin}"
if url_env == url_webhook:
    print("\n.env : IMPACTEUR_VALIDATION_URL déjà en place.")
elif url_env:
    print("\n⚠ .env : IMPACTEUR_VALIDATION_URL existe mais ne correspond pas à la porte du site : il sera remplacé.")
else:
    print("\n.env : la ligne IMPACTEUR_VALIDATION_URL sera ajoutée (l'adresse secrète de la porte du site).")

if not APPLIQUER:
    print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
    sys.exit(0)

for w in (wa, wb, wc, wd):
    if w["id"] not in modifies:
        continue
    api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
    try:
        api("POST", f"/api/v1/workflows/{w['id']}/activate")
    except Exception:  # noqa: BLE001 — déjà actif : n8n peut répondre une erreur sans gravité.
        pass

if url_env != url_webhook:
    lignes = [l for l in ENV_FICHIER.read_text().splitlines() if not l.startswith("IMPACTEUR_VALIDATION_URL=")]
    lignes.append(f"IMPACTEUR_VALIDATION_URL={url_webhook}")
    ENV_FICHIER.write_text("\n".join(lignes) + "\n")
    print("\n.env mis à jour (IMPACTEUR_VALIDATION_URL).")

print("\nEnregistré. Dernière étape pour que le site connaisse la porte :")
print("  cd ~/cerveau-central && docker compose up -d --force-recreate")
