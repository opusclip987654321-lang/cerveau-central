#!/usr/bin/env python3
"""Loop Nūr Meet restaurateurs (19/10) : Nour Meet 1 et 3 suivent la méthode de la loop.

Chaque matin, avant d'écrire, « Nour Meet 1 » (premiers mails) et « Nour Meet 3 »
(relances) lisent sur le cerveau la méthode en cours de la loop : textes des trois
mails, recherches Google Maps (le type de restaurant visé), jours de relance et nombre
de premiers mails par jour. Le lien des mails est marqué (utm_campaign=v<version>-<type>)
pour relier chaque visite, réponse et inscription à la version de texte qui l'a amenée,
et la recherche qui a trouvé chaque restaurant est gardée sur sa fiche (indices_google).
Si le cerveau ne répond pas, les mails partent avec les textes d'avant : rien ne s'arrête.
Rien d'autre ne change (envoi OVH, exclusions, réponses, pixel).

À lancer sur le VPS Nūr (là où est le .env du cerveau) :
    python3 scripts/nour-meet-loop-n8n.py              (montre tout, ne change rien)
    python3 scripts/nour-meet-loop-n8n.py --appliquer  (modifie Nour Meet 1 et 3)
Le script refuse de deviner : si un repère a changé, il s'arrête et montre la
structure réelle, à coller dans le fil Claude.
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

APPLIQUER = "--appliquer" in sys.argv
NOM_NM1 = "Nour Meet 1 - Recherche et envoi automatique"
NOM_NM3 = "Nour Meet 3 - Relances automatiques"
NOEUD = "LOOP - lire la méthode"
MARQUE = "LOOP Nūr Meet"
ICI = pathlib.Path(__file__).resolve().parent

env = {}
for ligne in (ICI.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
base = (env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/")
cle = env.get("N8N_API_KEY")
jeton = env.get("RELEVE_JETON")
if not cle or not jeton:
    sys.exit("Il manque N8N_API_KEY ou RELEVE_JETON dans .env")
cerveau = (env.get("CERVEAU_URL") or "https://cerveau.nourmeet.com").rstrip("/")
# Même calcul que src/loop-nour-meet.js (cheminMethode).
url_methode = cerveau + "/loop/nour-meet/" + hashlib.sha256(("loop-nour-meet:" + jeton).encode()).hexdigest()[:32]


def api(methode, chemin, corps=None):
    req = urllib.request.Request(
        base + chemin, method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={"X-N8N-API-KEY": cle, "accept": "application/json", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "{}")


def structure(w):
    lignes = [f"### {w['name']} [{'ON' if w.get('active') else 'off'}] id={w.get('id')}"]
    for n in w["nodes"]:
        lignes.append(f"-- {n['name']} ({n['type']})")
        p = dict(n.get("parameters", {}))
        code = p.pop("jsCode", None)
        lignes.append(json.dumps(p, ensure_ascii=False)[:800])
        if code:
            lignes.append(code[:3000])
    lignes.append("connections = " + json.dumps(w.get("connections", {}), ensure_ascii=False))
    return "\n".join(lignes)


def stop(message, *workflows):
    print(f"\n✋ {message}")
    print("Rien n'a été modifié. Colle toute cette sortie dans le fil Claude :")
    for w in workflows:
        print()
        print(structure(w))
    sys.exit(1)


def noeud(w, nom):
    return next((n for n in w["nodes"] if n["name"] == nom), None) or stop(f"Nœud « {nom} » introuvable dans {w['name']}.", w)


def remplacer(w, nom, ancre, nouveau, quoi, changements):
    n = noeud(w, nom)
    code = n["parameters"].get("jsCode", "")
    if nouveau in code:
        return
    if code.count(ancre) != 1:
        stop(f"Repère introuvable ou multiple dans « {nom} » ({quoi}).", w)
    n["parameters"]["jsCode"] = code.replace(ancre, nouveau, 1)
    changements.append(f"{w['name']} : {quoi}")


def lien(nom, vers):
    return {"main": [[{"node": vers, "type": "main", "index": 0}]]}


def brancher_lecture(w, declencheurs, suivant, position, changements):
    """Ajoute le nœud qui lit la méthode entre les déclencheurs et `suivant`."""
    if any(n["name"] == NOEUD for n in w["nodes"]):
        return
    for d in declencheurs:
        if w["connections"].get(d) != lien(d, suivant):
            stop(f"« {d} » ne mène plus directement à « {suivant} ».", w)
    w["nodes"].append({
        "parameters": {"url": url_methode, "options": {"timeout": 15000, "response": {"response": {"responseFormat": "json"}}}},
        "name": NOEUD, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": position,
        # Cerveau injoignable = on continue avec les textes d'origine.
        "onError": "continueRegularOutput", "alwaysOutputData": True,
    })
    for d in declencheurs:
        w["connections"][d] = lien(d, NOEUD)
    w["connections"][NOEUD] = lien(NOEUD, suivant)
    changements.append(f"{w['name']} : lit la méthode de la loop sur le cerveau avant d'écrire")


LIRE = """// LOOP Nūr Meet (cerveau, 19/10) : la méthode du jour. Absente ou illisible = textes d'origine.
let METHODE = null;
try { const m = $('LOOP - lire la méthode').first().json; if (m && m.version && m.textes) METHODE = m; } catch (e) {}
if (METHODE) {
  if (METHODE.parJour) CONFIG.PROPOSITIONS_PAR_JOUR = METHODE.parJour;
  if (Array.isArray(METHODE.relanceJours) && METHODE.relanceJours.length === 2) { CONFIG.RELANCE_1_APRES_JOURS = METHODE.relanceJours[0]; CONFIG.RELANCE_2_APRES_JOURS = METHODE.relanceJours[1]; }
  CONFIG.METHODE = METHODE;
}
"""

MAIL_LOOP = """// LOOP Nūr Meet : le texte de la méthode du cerveau, avec le lien marqué (version et type de mail).
function mailLoop(p, C, type) {
  const g = C.METHODE.textes[type];
  const lien = `${C.LIEN_CANDIDATURE}?utm_source=prospection&utm_medium=email&utm_campaign=v${C.METHODE.version}-${type}`;
  const v = { nom: p.nom, lieu: p.ville ? `${p.nom} à ${p.ville}` : p.nom, accroche: phraseAccroche(p), lien, pied: PIED(C) };
  const r = (t) => String(t).replace(/\\{(nom|lieu|accroche|lien|pied)\\}/g, (_, k) => v[k] ?? '');
  return { objet: r(g.objet), corps: r(g.corps) };
}

const esc = (s) =>"""


def patcher_nm1(w, changements):
    brancher_lecture(w, ["Chaque jour à 9 h", "Repêchage à 11 h 07"], "Configuration et requêtes du jour", [-2900, 112], changements)
    cfg = "Configuration et requêtes du jour"
    remplacer(w, cfg, "const THEMES = [", "let THEMES = [", "les recherches deviennent modifiables", changements)
    remplacer(w, cfg, "// 10 requêtes par jour", LIRE + "if (METHODE && Array.isArray(METHODE.recherches) && METHODE.recherches.length) THEMES = METHODE.recherches;\n// 10 requêtes par jour",
              "textes, recherches, relances et volume pris dans la méthode", changements)
    remplacer(w, "Aplatir, garder l'IDF, dédoublonner", "for (const it of $input.all()) {",
              "for (const [k, it] of $input.all().entries()) {\n  // LOOP Nūr Meet : la recherche qui a trouvé ce restaurant, gardée sur sa fiche.\n"
              "  let req = ''; try { const q = $('Configuration et requêtes du jour').all()[k].json; req = String(q.textQuery || ''); if (q.zone && req.endsWith(q.zone)) req = req.slice(0, -q.zone.length).trim(); } catch (e) {}",
              "la recherche qui a trouvé le restaurant est lue", changements)
    remplacer(w, "Aplatir, garder l'IDF, dédoublonner", "indices_google: indices.join(', '),",
              "indices_google: [indices.join(', '), req ? 'recherche : ' + req : ''].filter(Boolean).join(' · '),",
              "la recherche est gardée sur la fiche (indices_google)", changements)
    q = "Qualifier et rédiger"
    remplacer(w, q, "const esc = (s) =>", MAIL_LOOP, "fonction des textes de la loop", changements)
    remplacer(w, q, "const m = mailInitial(f, C);", "const m = C.METHODE ? mailLoop(f, C, 'initial') : mailInitial(f, C);", "premier mail écrit avec la méthode", changements)


def patcher_nm3(w, changements):
    brancher_lecture(w, ["Chaque jour à 9 h 30"], "Configuration", [-2900, 112], changements)
    remplacer(w, "Configuration", "return [{ json: CONFIG }];", LIRE + "return [{ json: CONFIG }];", "relances et textes pris dans la méthode", changements)
    q = "Qui relancer aujourd'hui ?"
    remplacer(w, q, "const esc = (s) =>", MAIL_LOOP, "fonction des textes de la loop", changements)
    remplacer(w, q, "const m = mailRelance(p, n, C);", "const m = C.METHODE ? mailLoop(p, C, 'relance' + n) : mailRelance(p, n, C);", "relances écrites avec la méthode", changements)


def actif(workflows, nom):
    tous = [w for w in workflows if w["name"] == nom and w.get("active")]
    if len(tous) != 1:
        stop(f"« {nom} » : {len(tous)} copie(s) active(s), il en faut exactement une.")
    return api("GET", f"/api/v1/workflows/{tous[0]['id']}")


def principal():
    try:
        with urllib.request.urlopen(url_methode, timeout=20) as r:
            m = json.loads(r.read())
        assert m.get("version") and m.get("textes")
    except Exception as err:  # noqa: BLE001
        sys.exit(f"✋ Le cerveau ne donne pas encore la méthode ({err}). Attends sa mise à jour (10 min) puis relance.")
    print(f"Méthode lue sur le cerveau : version {m['version']}, {m['parJour']} premiers mails/jour, relances J+{m['relanceJours'][0]} et J+{m['relanceJours'][1]}.")
    print(f"  Premier mail : « {m['textes']['initial']['objet']} »")

    workflows = api("GET", "/api/v1/workflows?limit=250").get("data", [])
    w1, w3 = actif(workflows, NOM_NM1), actif(workflows, NOM_NM3)
    changements = []
    patcher_nm1(w1, changements)
    patcher_nm3(w3, changements)
    print("\nCe qui sera fait :" if changements else "\nRien à faire : tout est déjà en place.")
    for c in changements:
        print(f"  - {c}")
    if not APPLIQUER:
        print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
        return
    for w in (w1, w3):
        if any(c.startswith(w["name"]) for c in changements):
            api("PUT", f"/api/v1/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})})
            api("POST", f"/api/v1/workflows/{w['id']}/activate")
            print(f"Enregistré : {w['name']}")
    print("\nDemain 9 h, les premiers mails partent avec la version de la loop ; 9 h 30, les relances.")


if __name__ == "__main__":
    principal()
