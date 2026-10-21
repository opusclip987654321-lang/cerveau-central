#!/usr/bin/env python3
"""Ajoute dans le n8n principal l'automatisation « CERVEAU - lecture des boîtes ».

Quand le cerveau l'appelle (adresse secrète tirée de RELEVE_JETON), elle lit les
mails des 3 derniers jours de la boîte de réception de 6 comptes Gmail de louis
(hors promotions, réseaux sociaux, forums) et ne fait rien d'autre : ni envoi,
ni libellé, ni « lu ». Le tri des urgents se fait dans le cerveau (src/boites.js).

Les comptes déjà connus de n8n sont posés tout seuls (gougamwalid = « Gmail account 2 »,
Impacteur Afrique = « Gmail account », Impacteur Frexit = « Gmail - Impacteur Frexit »).
Les autres nœuds attendent que louis choisisse ou crée le compte Google dans n8n.
Créée ÉTEINTE. À lancer une fois sur le VPS Nūr : python3 scripts/boites-n8n.py
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

NOM = "CERVEAU - lecture des boîtes"
REQUETE = "in:inbox newer_than:3d -category:promotions -category:social -category:forums"

# (id dans le cerveau, nom du nœud, credential n8n déjà existant ou None). Même ordre que src/boites.js.
BOITES = [
    ("opusclip", "Boîte opusclip987654321", None),
    ("walidvideos12", "Boîte walidvideos12", None),
    ("impacteurmedia", "Boîte impacteurmedia", None),
    ("gougamwalid", "Boîte gougamwalid", "Gmail account 2"),
    ("impacteurfrexit", "Boîte impacteurfrexit", "Gmail - Impacteur Frexit"),
    ("impacteurafrique", "Boîte impacteurafrique", "Gmail account"),
]

env = {}
for ligne in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

base = (env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/")
cle = env.get("N8N_API_KEY")
jeton = env.get("RELEVE_JETON")
if not cle or not jeton:
    sys.exit("Il manque N8N_API_KEY ou RELEVE_JETON dans .env")
chemin = "cerveau-boites-" + hashlib.sha256(("boites:" + jeton).encode()).hexdigest()[:32]


def api(methode, url, corps=None):
    req = urllib.request.Request(
        base + url,
        method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"X-N8N-API-KEY": cle, "accept": "application/json", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "{}")


workflows = api("GET", "/api/v1/workflows?limit=250")["data"]

# Les comptes Gmail déjà utilisés par les autres automatisations : {nom: id}.
comptes = {}
for w in workflows:
    for n in w.get("nodes", []):
        c = (n.get("credentials") or {}).get("gmailOAuth2")
        if c and c.get("id") and c.get("name"):
            comptes[c["name"]] = c["id"]
print("Comptes Gmail connus de n8n :", ", ".join(sorted(comptes)) or "aucun")

# Rassemble les 6 lectures : une ligne d'état par boîte, puis ses mails.
CODE = r"""
const boites = %s;
const sortie = [];
let precedents = '';
for (const [boite, noeud] of boites) {
  let items = [];
  try { items = $(noeud).all(); } catch (e) { sortie.push({ json: { boite, erreur: 'pas lue : ' + e.message } }); continue; }
  const panne = items.find((i) => i.json && i.json.error);
  if (panne) { sortie.push({ json: { boite, erreur: String(panne.json.error.message || panne.json.error).slice(0, 300) } }); continue; }
  const mails = items.filter((i) => i.json && i.json.id);
  // Un nœud éteint laisse passer les mails du précédent : on ne les compte pas deux fois.
  const ids = mails.map((i) => i.json.id).join(',');
  if (ids && ids === precedents) { sortie.push({ json: { boite, erreur: 'nœud éteint dans n8n' } }); continue; }
  precedents = ids;
  sortie.push({ json: { boite, lus: mails.length } });
  for (const i of mails) {
    const m = i.json;
    sortie.push({ json: { boite, id: m.id, threadId: m.threadId, From: m.From, To: m.To, Subject: m.Subject, snippet: m.snippet, internalDate: m.internalDate,
      labelIds: m.labelIds || (m.labels || []).map((l) => l.id) } });
  }
}
return sortie;
""" % json.dumps([[b, n] for b, n, _ in BOITES], ensure_ascii=False)

existant = next((w for w in workflows if w["name"] == NOM), None)
if existant:
    print(f"« {NOM} » existe déjà (id {existant['id']}).")
else:
    nodes = [
        {
            "id": "b0",
            "name": "Appel du cerveau",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [0, 0],
            "webhookId": chemin,
            "parameters": {"path": chemin, "httpMethod": "GET", "responseMode": "responseNode", "options": {}},
        }
    ]
    connections = {}
    precedent = "Appel du cerveau"
    a_choisir = []
    for i, (boite, noeud, compte) in enumerate(BOITES, start=1):
        n = {
            "id": f"b{i}",
            "name": noeud,
            "type": "n8n-nodes-base.gmail",
            "typeVersion": 2.1,
            "position": [220 * i, 0],
            "parameters": {"operation": "getAll", "limit": 50, "simple": True, "filters": {"q": REQUETE}},
            "executeOnce": True,
            "alwaysOutputData": True,
            "onError": "continueRegularOutput",
        }
        if compte and compte in comptes:
            n["credentials"] = {"gmailOAuth2": {"id": comptes[compte], "name": compte}}
        else:
            a_choisir.append(noeud)
        nodes.append(n)
        connections[precedent] = {"main": [[{"node": noeud, "type": "main", "index": 0}]]}
        precedent = noeud
    nodes.append(
        {
            "id": "b7",
            "name": "Rassembler",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [220 * (len(BOITES) + 1), 0],
            "parameters": {"jsCode": CODE},
        }
    )
    nodes.append(
        {
            "id": "b8",
            "name": "Répondre",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [220 * (len(BOITES) + 2), 0],
            "parameters": {"respondWith": "allIncomingItems", "options": {}},
        }
    )
    connections[precedent] = {"main": [[{"node": "Rassembler", "type": "main", "index": 0}]]}
    connections["Rassembler"] = {"main": [[{"node": "Répondre", "type": "main", "index": 0}]]}
    workflow = {
        "name": NOM,
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none"},
    }
    cree = api("POST", "/api/v1/workflows", workflow)
    print(f"« {NOM} » créée (id {cree['id']}), éteinte pour l'instant.")
    if a_choisir:
        print("Nœuds qui attendent un compte Google :", ", ".join(a_choisir))

# Essai : le cerveau peut-il déjà lire ?
try:
    with urllib.request.urlopen(f"{base}/webhook/{chemin}", timeout=120) as r:
        lignes = json.loads(r.read() or "[]")
    lignes = lignes if isinstance(lignes, list) else [lignes]
    for l in lignes:
        if not l.get("id"):
            print(f"  {l.get('boite')} : {'ERREUR ' + l['erreur'] if l.get('erreur') else str(l.get('lus')) + ' mail(s) lus'}")
except Exception as err:  # noqa: BLE001
    print("Lecture pas encore possible (normal tant que l'automatisation n'est pas allumée) :", err)
