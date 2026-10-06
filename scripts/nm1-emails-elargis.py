#!/usr/bin/env python3
"""Nūr Meet : recherche d'e-mails élargie (accord de louis du 06/10/2026).

Aujourd'hui, l'automatisation « Nour Meet 1 » ne lit que l'accueil et la page
contact d'un site. Ce script lui apprend à lire aussi les mentions légales, la
page de réservation et la page Facebook quand aucun e-mail n'a été trouvé, et
ajoute un « repêchage » quotidien à 11h07 : chaque jour, 40 restaurants déjà
notés « sans e-mail » sont relus avec cette recherche élargie. Un e-mail
trouvé suit le circuit normal (exclusions, doublons, rédaction, envoi).

À lancer sur le VPS Nūr :
    python3 scripts/nm1-emails-elargis.py              (montre tout, ne change rien)
    python3 scripts/nm1-emails-elargis.py --appliquer  (modifie n8n)
"""
import json
import os
import pathlib
import sys
import urllib.request

NOM_NM1 = "Nour Meet 1 - Recherche et envoi automatique"
NOUVEAUX = ["Repêchage à 11 h 07", "Repêchage ?", "Repêchage : stock sans e-mail",
            "Repêchage : préparer", "Lire les mentions légales",
            "Lire la page de réservation", "Lire la page Facebook"]


def env_fichier():
    valeurs = {}
    chemin = pathlib.Path(__file__).resolve().parent.parent / ".env"
    if chemin.exists():
        for ligne in chemin.read_text().splitlines():
            ligne = ligne.strip()
            if ligne and not ligne.startswith("#") and "=" in ligne:
                cle, _, val = ligne.partition("=")
                valeurs[cle.strip()] = val.strip().strip('"').strip("'")
    return valeurs


def creer_api():
    env = {**env_fichier(), **os.environ}
    base = (env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/")
    jeton = env.get("N8N_API_KEY")
    if not jeton:
        print("✋ N8N_API_KEY introuvable (dans .env ou l'environnement).")
        sys.exit(1)

    def api(methode, chemin, corps=None):
        donnees = json.dumps(corps).encode() if corps is not None else None
        req = urllib.request.Request(base + chemin, data=donnees, method=methode,
                                     headers={"X-N8N-API-KEY": jeton, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as rep:
            return json.loads(rep.read().decode() or "{}")
    return api


def structure(w):
    lignes = [f"### {w['name']} [{'ON' if w.get('active') else 'off'}] id={w['id']}"]
    for n in w["nodes"]:
        acces = f" accès={json.dumps(n.get('credentials', {}), ensure_ascii=False)}" if n.get("credentials") else ""
        lignes.append(f"-- {n['name']} ({n['type']}){acces}")
        lignes.append(json.dumps(n.get("parameters", {}), ensure_ascii=False))
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
    return next((n for n in w["nodes"] if n["name"] == nom), None)


def remplacer(w, nom_noeud, ancre, nouveau, description):
    n = noeud(w, nom_noeud)
    if n is None:
        stop(f"Nœud « {nom_noeud} » introuvable dans la copie active.", w)
    code = n["parameters"].get("jsCode", "")
    if code.count(ancre) != 1:
        stop(f"Repère introuvable ou multiple dans « {nom_noeud} » ({description}) : "
             f"le code du workflow actif ne correspond pas à celui que Claude a lu.", w)
    n["parameters"]["jsCode"] = code.replace(ancre, nouveau, 1)


def clone(n):
    return json.loads(json.dumps(n))


# ---------------------------------------------------------------------------
# Les modifications, appliquées à l'objet workflow en mémoire.
# ---------------------------------------------------------------------------

def patcher(wn, changements):
    deja = noeud(wn, "Repêchage ?") is not None

    # 1) « Analyser l'accueil » : repérer aussi les liens mentions légales,
    #    réservation et Facebook (seulement si l'accueil n'a donné aucun e-mail).
    analyser = noeud(wn, "Analyser l'accueil")
    if analyser is None:
        stop("Nœud « Analyser l'accueil » introuvable.", wn)
    if "legales_url" not in analyser["parameters"].get("jsCode", ""):
        a_retour = "return { json: { ...p, emails_accueil: emails(html), indices_accueil: indices(texte(html)), contact_url } };"
        n_retour = (
            "const listeAccueil = emails(html);\n"
            "  const lienAbs = (l) => { try { return l ? new URL(l, p.site).href : ''; } catch (e) { return ''; } };\n"
            "  const mLeg = (String(html).match(/href=[\"']([^\"'#]*(?:mention|l[ée]gal|cgu|cgv)[^\"']*)[\"']/i) || [])[1];\n"
            "  const mRes = (String(html).match(/href=[\"']([^\"'#]*(?:reserv|booking|book)[^\"']*)[\"']/i) || [])[1];\n"
            "  const mFb = (String(html).match(/href=[\"']((?:https?:)?\\/\\/(?:www\\.|m\\.|fr-fr\\.)?facebook\\.com\\/[^\"'#?]+)[\"']/i) || [])[1];\n"
            "  const rRes = lienAbs(mRes);\n"
            "  const legales_url = listeAccueil.length ? '' : lienAbs(mLeg);\n"
            "  const reservation_url = listeAccueil.length ? '' : (rRes && rRes !== contact_url ? rRes : '');\n"
            "  const facebook_url = listeAccueil.length ? '' : (mFb ? (String(mFb).startsWith('http') ? mFb : 'https:' + mFb) : '');\n"
            "  return { json: { ...p, emails_accueil: listeAccueil, indices_accueil: indices(texte(html)), contact_url, legales_url, reservation_url, facebook_url } };"
        )
        remplacer(wn, "Analyser l'accueil", a_retour, n_retour, "liens annexes")
        changements.append("Accueil : repère aussi les liens mentions légales, réservation et Facebook (quand l'accueil n'a pas d'e-mail)")

    # 2) Trois lectures de pages annexes entre « Lire la page contact » et
    #    « Qualifier et rédiger » (clonées du nœud contact : mêmes réglages).
    contact = noeud(wn, "Lire la page contact")
    if contact is None:
        stop("Nœud « Lire la page contact » introuvable.", wn)
    if not deja:
        x, y = contact.get("position", [0, 0])
        pages = [("Lire les mentions légales", "legales_url"),
                 ("Lire la page de réservation", "reservation_url"),
                 ("Lire la page Facebook", "facebook_url")]
        for i, (nom, champ) in enumerate(pages):
            n = clone(contact)
            n.update({"id": f"cerveau-annexe-{i}", "name": nom, "position": [x + 220 * (i + 1), y + 180]})
            n["parameters"]["url"] = '={{ $("Analyser l\'accueil").item.json.' + champ + " || 'https://site-absent.invalid' }}"
            wn["nodes"].append(n)
        wn["connections"]["Lire la page contact"] = {"main": [[{"node": "Lire les mentions légales", "type": "main", "index": 0}]]}
        wn["connections"]["Lire les mentions légales"] = {"main": [[{"node": "Lire la page de réservation", "type": "main", "index": 0}]]}
        wn["connections"]["Lire la page de réservation"] = {"main": [[{"node": "Lire la page Facebook", "type": "main", "index": 0}]]}
        wn["connections"]["Lire la page Facebook"] = {"main": [[{"node": "Qualifier et rédiger", "type": "main", "index": 0}]]}
        changements.append("Sans e-mail après la page contact : lecture des mentions légales, de la page de réservation et de la page Facebook")

    # 3) « Qualifier et rédiger » : prendre aussi les e-mails des pages annexes,
    #    et noter la vraie page où l'adresse a été trouvée.
    qualifier = noeud(wn, "Qualifier et rédiger")
    if qualifier is None:
        stop("Nœud « Qualifier et rédiger » introuvable.", wn)
    if "htmlLeg" not in qualifier["parameters"].get("jsCode", ""):
        a1 = "return $input.all().map((it, i) => {\n  const p = base[i].json; const html = it.json.html || '';\n  const ic = indices(texte(html)); const ia = p.indices_accueil || {};"
        n1 = ("return $input.all().map((it, i) => {\n"
              "  const p = base[i].json;\n"
              "  const html = $('Lire la page contact').all()[i].json.html || '';\n"
              "  const htmlLeg = $('Lire les mentions légales').all()[i].json.html || '';\n"
              "  const htmlRes = $('Lire la page de réservation').all()[i].json.html || '';\n"
              "  const htmlFb = $('Lire la page Facebook').all()[i].json.html || '';\n"
              "  const ic = indices(texte(html)); const ia = p.indices_accueil || {};")
        remplacer(wn, "Qualifier et rédiger", a1, n1, "lecture des pages annexes")
        a2 = "const liste = [...new Set([...(p.emails_accueil || []), ...emails(html)])];"
        n2 = "const liste = [...new Set([...(p.emails_accueil || []), ...emails(html), ...emails(htmlLeg), ...emails(htmlRes), ...emails(htmlFb)])];"
        remplacer(wn, "Qualifier et rédiger", a2, n2, "e-mails des pages annexes")
        a3 = "const email_source = email ? ((p.emails_accueil || []).includes(email) ? p.site : p.contact_url) : '';"
        n3 = ("const email_source = email ? ((p.emails_accueil || []).includes(email) ? p.site : "
              "emails(html).includes(email) ? p.contact_url : emails(htmlLeg).includes(email) ? p.legales_url : "
              "emails(htmlRes).includes(email) ? p.reservation_url : p.facebook_url) : '';")
        remplacer(wn, "Qualifier et rédiger", a3, n3, "source de l'adresse")
        changements.append("La fiche note la vraie page où l'adresse a été trouvée (source de l'e-mail)")

    # 4) Repêchage quotidien du stock « sans_email » à 11h07, par le circuit normal.
    if not deja:
        trigger = noeud(wn, "Chaque jour à 9 h")
        config = noeud(wn, "Configuration et requêtes du jour")
        si_email = noeud(wn, "E-mail trouvé ?")
        maj = noeud(wn, "Mettre à jour le prospect")
        tri = noeud(wn, "Trier et garder les 50 meilleurs")
        for manquant, n in [("Chaque jour à 9 h", trigger), ("Configuration et requêtes du jour", config),
                            ("E-mail trouvé ?", si_email), ("Mettre à jour le prospect", maj),
                            ("Trier et garder les 50 meilleurs", tri)]:
            if n is None:
                stop(f"Nœud « {manquant} » introuvable.", wn)
        x, y = config.get("position", [0, 0])

        # Le nœud de configuration reconnaît le lancement « repêchage ».
        a_cfg = "const jour = Math.floor(Date.now() / 86400000);"
        n_cfg = ("// Lancement « repêchage » de 11h07 : configuration seule, sans requêtes Google.\n"
                 "let repechage = false;\n"
                 "try { $('Repêchage à 11 h 07').first(); repechage = true; } catch (e) {}\n"
                 "if (repechage) return [{ json: { ...CONFIG, repechage: true } }];\n"
                 "const jour = Math.floor(Date.now() / 86400000);")
        remplacer(wn, "Configuration et requêtes du jour", a_cfg, n_cfg, "détection du repêchage")

        t2 = clone(trigger)
        t2.update({"id": "cerveau-repechage-trigger", "name": "Repêchage à 11 h 07",
                   "position": [x - 220, y + 220]})
        t2["parameters"] = {"rule": {"interval": [{"field": "cronExpression", "expression": "7 11 * * *"}]}}

        si = clone(si_email)
        si.update({"id": "cerveau-repechage-if", "name": "Repêchage ?", "position": [x + 220, y]})
        si["parameters"] = {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                                           "conditions": [{"id": "cerveau-repechage-cond",
                                                           "leftValue": "={{ $json.repechage ? 'OUI' : 'NON' }}",
                                                           "operator": {"type": "string", "operation": "equals"},
                                                           "rightValue": "OUI"}],
                                           "combinator": "and"}, "options": {}}

        stock = clone(maj)
        stock.update({"id": "cerveau-repechage-stock", "name": "Repêchage : stock sans e-mail",
                      "position": [x + 440, y + 220]})
        stock["parameters"] = {"operation": "get",
                               "dataTableId": {"__rl": True, "mode": "name", "value": "np_prospects"},
                               "matchType": "allConditions",
                               "filters": {"conditions": [{"keyName": "statut", "keyValue": "sans_email"}]},
                               "options": {}}

        preparer = clone(tri)
        preparer.update({"id": "cerveau-repechage-preparer", "name": "Repêchage : préparer",
                         "position": [x + 660, y + 220]})
        preparer["parameters"] = {"jsCode": (
            "// 40 fiches « sans_email » par jour, en rotation pour couvrir tout le stock.\n"
            "const lignes = $input.all().map((x) => x.json)\n"
            "  .filter((r) => String(r.site || '').trim() && String(r.statut || '') === 'sans_email');\n"
            "const jour = Math.floor(Date.now() / 86400000);\n"
            "const N = 40;\n"
            "const debut = lignes.length ? (jour * N) % lignes.length : 0;\n"
            "const choisies = lignes.slice(debut, debut + N);\n"
            "if (choisies.length < N) choisies.push(...lignes.slice(0, Math.min(N - choisies.length, Math.max(0, debut))));\n"
            "return choisies.map((r) => ({ json: {\n"
            "  place_id: r.place_id, nom: r.nom || '', adresse: r.adresse || '', ville: r.ville || '', code_postal: r.code_postal || '',\n"
            "  site: r.site, telephone: r.telephone || '', maps_url: r.maps_url || '', note: r.note ?? null, nb_avis: r.nb_avis ?? null,\n"
            "  niveau_prix: r.niveau_prix || '', groupes: false, alcool_google: false, indices_google: r.indices_google || '',\n"
            "} }));")}

        wn["nodes"] += [t2, si, stock, preparer]
        wn["connections"]["Repêchage à 11 h 07"] = {"main": [[{"node": "Configuration et requêtes du jour", "type": "main", "index": 0}]]}
        wn["connections"]["Configuration et requêtes du jour"] = {"main": [[{"node": "Repêchage ?", "type": "main", "index": 0}]]}
        wn["connections"]["Repêchage ?"] = {"main": [[{"node": "Repêchage : stock sans e-mail", "type": "main", "index": 0}],
                                                     [{"node": "Google Places : recherche texte", "type": "main", "index": 0}]]}
        wn["connections"]["Repêchage : stock sans e-mail"] = {"main": [[{"node": "Repêchage : préparer", "type": "main", "index": 0}]]}
        wn["connections"]["Repêchage : préparer"] = {"main": [[{"node": "Au plus 120 sites à lire", "type": "main", "index": 0}]]}
        changements.append("Repêchage : chaque jour à 11h07, 40 restaurants « sans e-mail » du stock sont relus avec la recherche élargie ; un e-mail trouvé suit le circuit normal (exclusions, doublons, rédaction, envoi)")

        # 5) Les enregistrements de prospects deviennent des « upsert » sur place_id :
        #    un restaurant repêché met à jour SA fiche au lieu d'en créer une deuxième.
        for nom in ("Enregistrer le prospect", "Enregistrer (sans e-mail)"):
            n = noeud(wn, nom)
            if n is None:
                stop(f"Nœud « {nom} » introuvable.", wn)
            if n["parameters"].get("operation") != "upsert":
                n["parameters"] = {"operation": "upsert",
                                   "dataTableId": {"__rl": True, "mode": "name", "value": "np_prospects"},
                                   "matchType": "allConditions",
                                   "filters": {"conditions": [{"keyName": "place_id", "keyValue": "={{ $json.place_id }}"}]},
                                   "columns": n["parameters"].get("columns", {"mappingMode": "autoMapInputData", "value": {}, "matchingColumns": [], "schema": [], "attemptToConvertTypes": False, "convertFieldsToString": False}),
                                   "options": {}}
        changements.append("Une fiche repêchée est mise à jour (plus de doublon possible dans np_prospects)")


def principal():
    appliquer = "--appliquer" in sys.argv
    api = creer_api()
    workflows = api("GET", "/api/v1/workflows?limit=250").get("data", [])

    print("Inventaire n8n (nom [état] id) :")
    for w in sorted(workflows, key=lambda x: (x["name"], not x.get("active"))):
        print(f"  {w['name']} [{'ON' if w.get('active') else 'off'}] {w['id']}")

    actifs = [w for w in workflows if w["name"] == NOM_NM1 and w.get("active")]
    if len(actifs) != 1:
        stop(f"Il faut exactement UNE copie active de « {NOM_NM1} » (trouvées : {len(actifs)}).",
             *[api("GET", f"/api/v1/workflows/{w['id']}") for w in workflows if w["name"] == NOM_NM1])
    wn = api("GET", f"/api/v1/workflows/{actifs[0]['id']}")

    cfg = noeud(wn, "Configuration et requêtes du jour")
    mode_test = bool(cfg and "MODE_TEST: true" in cfg["parameters"].get("jsCode", ""))
    print(f"\nCopie active : {wn['id']} — MODE_TEST {'ACTIVÉ (3 mails de test seulement)' if mode_test else 'coupé (envois réels)'}")

    changements = []
    patcher(wn, changements)

    print("\nCe qui sera fait :" if changements else "\nRien à faire : tout est déjà en place.")
    for c in changements:
        print(f"  - {c}")

    print("\n--- Structure de Nour Meet 1 actif, après modification (à coller dans le fil Claude, aucun secret) ---")
    print(structure(wn))
    print("--- fin ---")

    if not appliquer:
        print("\nRien n'a été modifié. Relance avec --appliquer pour enregistrer.")
        return
    if not changements:
        return

    api("PUT", f"/api/v1/workflows/{wn['id']}",
        {"name": wn["name"], "nodes": wn["nodes"], "connections": wn["connections"], "settings": wn.get("settings", {})})
    api("POST", f"/api/v1/workflows/{wn['id']}/activate")
    print("\nEnregistré. Dès maintenant : recherche élargie pour les nouveaux restaurants, et repêchage du stock sans e-mail chaque jour à 11h07.")


if __name__ == "__main__":
    principal()
