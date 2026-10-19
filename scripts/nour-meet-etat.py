#!/usr/bin/env python3
"""Loop Nūr Meet restaurateurs (19/10), étape 0 : l'état des lieux chiffré.

LECTURE SEULE : ne modifie rien, ni dans n8n, ni sur le site.
Lit la prospection (tableaux n8n np_prospects, np_envois, np_ouvertures, np_reponses,
np_exclusions) et la base du site Nūr Meet (formules, restaurateurs inscrits,
abonnements, visites de la page restaurateurs), puis imprime un bilan court :
mails envoyés par type, ouvertures, réponses (et quel mail les a déclenchées),
réponses par zone et par profil de restaurant, inscriptions reliées aux mails,
et le texte des réponses (sans adresse e-mail) pour que Claude les classe.

À lancer sur le VPS Nūr :
    python3 ~/cerveau-central/scripts/nour-meet-etat.py
Toute la sortie est à coller dans le fil Claude.
"""
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

ICI = pathlib.Path(__file__).resolve().parent
env = {}
for ligne in (ICI.parent / ".env").read_text().splitlines():
    if "=" in ligne and not ligne.lstrip().startswith("#"):
        k, v = ligne.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
base = (env.get("N8N_URL") or "https://n8n.nourmeet.com").rstrip("/")
cle = env.get("N8N_API_KEY")
if not cle:
    sys.exit("Il manque N8N_API_KEY dans .env")


def api(url):
    req = urllib.request.Request(base + url, headers={"X-N8N-API-KEY": cle, "accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or "{}")


def tableau(nom, tables):
    t = next((x for x in tables if x.get("name") == nom), None)
    if not t:
        return None
    lignes, curseur = [], None
    for _ in range(80):
        rep = api(f"/api/v1/data-tables/{t['id']}/rows?limit=250" + (f"&cursor={urllib.parse.quote(curseur)}" if curseur else ""))
        lignes += rep.get("data") or []
        curseur = rep.get("nextCursor")
        if not curseur:
            break
    return lignes


def date(v):
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def pct(a, b):
    return f"{round(100 * a / b)} %" if b else "—"


def semaine(d):
    return f"{d.isocalendar()[0]}-S{d.isocalendar()[1]:02d}"


def propre(texte):
    """Le texte écrit par le restaurant, sans l'historique cité ni adresse e-mail."""
    t = re.split(r"\r?\n(?:>|Le .{0,120}a écrit|On .{0,120}wrote|De ?:|From ?:|Envoyé ?:|-{2,} ?(?:Original|Message d'origine)|_{5,})", str(texte or ""), flags=re.I)[0]
    t = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[adresse]", t)
    t = re.sub(r"(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}", "[téléphone]", t)
    return re.sub(r"\s+", " ", t).strip()


print(f"# État des lieux Nūr Meet restaurateurs ({datetime.now().strftime('%d/%m/%Y %H:%M')})\n")
tables = api("/api/v1/data-tables?limit=100").get("data") or []
P = tableau("np_prospects", tables) or []
E = tableau("np_envois", tables) or []
O = tableau("np_ouvertures", tables) or []
R = tableau("np_reponses", tables)
X = tableau("np_exclusions", tables) or []
pas_test = lambda l: l.get("statut") != "test" and "test" not in str(l.get("nom") or "").lower()
P = [p for p in P if pas_test(p)]
E = [e for e in E if pas_test(e)]
print("## 1. Prospection (n8n)")
print(f"Restaurants trouvés : {len(P)} · avec e-mail : {sum(1 for p in P if p.get('email'))}")
print("Statuts :", ", ".join(f"{k} {v}" for k, v in Counter(p.get("statut") or "?" for p in P).most_common()))
env_ok = [e for e in E if e.get("statut") == "envoye"]
print("Mails envoyés :", len(env_ok), "·", ", ".join(f"{k} {v}" for k, v in Counter(e.get("type") or "?" for e in env_ok).most_common()))
print("Autres statuts d'envoi :", ", ".join(f"{k} {v}" for k, v in Counter(e.get("statut") or "?" for e in E if e.get("statut") != "envoye").most_common()) or "aucun")
causes = Counter(str(e.get("erreur") or "sans cause")[:90] for e in E if e.get("statut") == "echec")
if causes:
    print("Échecs (top 5) :", " | ".join(f"{n} × {c}" for c, n in causes.most_common(5)))
dates_env = sorted(d for d in (date(e.get("date_decision")) for e in env_ok) if d)
if dates_env:
    print(f"Premier envoi : {dates_env[0]:%d/%m/%Y} · dernier : {dates_env[-1]:%d/%m/%Y}")
    print("Premiers mails par semaine :", ", ".join(f"{s} {n}" for s, n in sorted(Counter(semaine(date(e['date_decision'])) for e in env_ok if e.get("type") == "initial" and date(e.get("date_decision"))).items())))

# Ouvertures : première ouverture de chaque envoi, et qui l'a ouvert (proxy d'images = ouverture douteuse).
premiere = {}
agents = Counter()
for o in O:
    i = str(o.get("envoi_id"))
    if i not in premiere:
        premiere[i] = o
        a = str(o.get("agent") or "").lower()
        agents["proxy Google (Gmail)" if "googleimageproxy" in a else "Outlook / Microsoft" if ("outlook" in a or "microsoft" in a) else "autre" if a else "inconnu"] += 1
ouverts = {str(e.get("id")) for e in env_ok} & set(premiere)
print(f"Ouvertures (au moins une fois) : {len(ouverts)} sur {len(env_ok)} envois ({pct(len(ouverts), len(env_ok))})")
print("  par type :", ", ".join(f"{t} {pct(sum(1 for e in env_ok if e.get('type') == t and str(e.get('id')) in ouverts), sum(1 for e in env_ok if e.get('type') == t))}" for t in ("initial", "relance1", "relance2")))
print("  ouvert par :", ", ".join(f"{k} {v}" for k, v in agents.most_common()))

# Réponses : quel mail les a déclenchées (le dernier mail parti avant la réponse).
par_email = defaultdict(list)
for e in env_ok:
    if e.get("email") and date(e.get("date_decision")):
        par_email[str(e["email"]).lower()].append(e)
rep = [p for p in P if p.get("date_reponse")]
print(f"\nRéponses (date_reponse) : {len(rep)} restaurants · {pct(len(rep), len({str(e.get('email')).lower() for e in env_ok}))} des restaurants contactés")
print("  dont statut :", ", ".join(f"{k} {v}" for k, v in Counter(p.get("statut") or "?" for p in rep).most_common()))
declencheur = Counter()
delais = []
for p in rep:
    dr = date(p.get("date_reponse"))
    avant = [e for e in par_email.get(str(p.get("email") or "").lower(), []) if dr and date(e["date_decision"]) <= dr]
    if avant:
        dernier = max(avant, key=lambda e: date(e["date_decision"]))
        declencheur[dernier.get("type") or "?"] += 1
        delais.append((dr - date(dernier["date_decision"])).total_seconds() / 86400)
    else:
        declencheur["aucun mail trouvé avant"] += 1
print("  après quel mail :", ", ".join(f"{k} {v}" for k, v in declencheur.most_common()))
if delais:
    delais.sort()
    print(f"  délai médian de réponse : {delais[len(delais) // 2]:.1f} jour(s)")
print("Exclusions :", ", ".join(f"{k} {v}" for k, v in Counter(x.get("motif") or "?" for x in X).most_common()) or "aucune")


def segment(nom, cle_de):
    groupes = defaultdict(lambda: [0, 0])
    for p in P:
        if not p.get("date_premier_envoi"):
            continue
        g = groupes[cle_de(p)]
        g[0] += 1
        g[1] += 1 if p.get("date_reponse") and p.get("statut") == "repondu" else 0
    lignes = sorted(groupes.items(), key=lambda kv: -kv[1][0])
    print(f"  {nom} : " + " · ".join(f"{k} {v[1]}/{v[0]}" for k, v in lignes[:12]))


print("\n## 2. Qui répond (réponses hors refus / restaurants contactés)")
dep = lambda p: "Paris" if str(p.get("code_postal") or "").startswith("75") else f"dép. {str(p.get('code_postal') or '??')[:2]}"
segment("zone", dep)
segment("score", lambda p: f"score {int(p.get('score') or 0) // 3 * 3}-{int(p.get('score') or 0) // 3 * 3 + 2}")
segment("halal", lambda p: "halal confirmé" if str(p.get("halal") or "").startswith("confirm") else "halal non confirmé")
segment("sans alcool", lambda p: "sans alcool confirmé" if str(p.get("sans_alcool") or "").startswith("confirm") else "non confirmé")
segment("privatisation", lambda p: "privatisable confirmé" if str(p.get("privatisation") or "").startswith("confirm") else "non confirmé")
segment("prix", lambda p: p.get("niveau_prix") or "prix ?")
segment("note Google", lambda p: "≥ 4,5" if (p.get("note") or 0) >= 4.5 else "4-4,5" if (p.get("note") or 0) >= 4 else "< 4 ou ?")

print("\n## 3. Texte des réponses (sans adresse ni téléphone)")
if R is None:
    print("Tableau np_reponses introuvable.")
else:
    nom_de = {str(p.get("email") or "").lower(): p for p in P if p.get("email")}
    for r in sorted(R, key=lambda r: str(r.get("recu") or "")):
        p = nom_de.get(str(r.get("email") or "").lower())
        qui = f"{p.get('nom')} ({p.get('ville') or '?'}, score {p.get('score')})" if p else "expéditeur inconnu de la prospection"
        t = propre(r.get("texte"))
        print(f"- [{str(r.get('recu') or '')[:10]}] {qui} · objet « {str(r.get('objet') or '')[:70]} » : {t[:350] or '(vide)'}")
    print(f"({len(R)} réponse(s) gardée(s) depuis le 05/10)")

print("\n## 4. Site Nūr Meet (base du site)")
try:
    nom_pg = next(n for n in subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, check=True).stdout.split() if "nour-v2" in n and "postgres" in n)
except (StopIteration, subprocess.CalledProcessError, FileNotFoundError) as err:
    nom_pg = None
    print(f"Base du site introuvable ({err!r}).")


def sql(requete):
    r = subprocess.run(["docker", "exec", "-i", nom_pg, "sh", "-c", 'psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-nour_meet}" -At -F "|" -v ON_ERROR_STOP=1'],
                       input=requete, capture_output=True, text=True)
    if r.returncode:
        print(f"  (requête refusée : {r.stderr.strip()[:200]})")
        return []
    return [l.split("|") for l in r.stdout.strip().splitlines() if l]


if nom_pg:
    print("Formules :", " · ".join(f"{n} {int(c) / 100:.0f} €/mois{' (inactive)' if a != 't' else ''}" for n, c, a in sql('select name, "monthlyPriceCents", active from "Plan" order by "monthlyPriceCents";')) or "aucune")
    restos = sql('select o.name, o.status, to_char(o."submittedAt", \'YYYY-MM-DD\'), lower(coalesce(u.email, \'\')), coalesce(s.status::text, \'\'), coalesce(p.name, \'\'), coalesce(p."monthlyPriceCents", 0) '
                 'from "Organizer" o join "User" u on u.id = o."ownerId" left join "RestaurantSubscription" s on s."restaurantId" = o.id left join "Plan" p on p.id = s."planId" '
                 'where not o."isDemo" and not u."isDemo" order by o."submittedAt";')
    emails_prosp = {str(p.get("email") or "").lower(): p for p in P if p.get("email")}
    domaines_prosp = {e.split("@")[1]: p for e, p in emails_prosp.items() if "@" in e and not re.match(r"(gmail|hotmail|outlook|live|yahoo|icloud|orange|wanadoo|free|sfr|laposte)\.", e.split("@")[1])}
    norm = lambda s: re.sub(r"[^a-z0-9]", "", str(s or "").lower())
    noms_prosp = {norm(p.get("nom")): p for p in P if len(norm(p.get("nom"))) >= 4}
    print(f"Restaurateurs inscrits (hors démo) : {len(restos)}")
    for nom, statut, quand, email, sub, plan, prix in restos:
        lien = "e-mail prospecté" if email in emails_prosp else "même domaine qu'un prospect" if email.split("@")[-1] in domaines_prosp else "même nom qu'un prospect" if norm(nom) in noms_prosp else "pas relié à la prospection"
        ab = f"abonnement {sub} ({plan} {int(prix) / 100:.0f} €/mois)" if sub else "sans abonnement"
        print(f"- {quand} {nom} · {statut} · {ab} · {lien}")
    print("Abonnements par statut :", ", ".join(f"{s} {n}" for s, n in sql('select status, count(*) from "RestaurantSubscription" group by 1;')) or "aucun")
    print("Visites des pages restaurateurs (60 j) :")
    for chemin, src, ref, n, uniques in sql('select path, coalesce("utmSource", \'\'), coalesce("referrerHost", \'\'), count(*), count(distinct "anonId") from "PageView" '
                                             'where path like \'/restaura%\' and "createdAt" > now() - interval \'60 days\' group by 1, 2, 3 order by 4 desc limit 12;'):
        print(f"  {chemin} · source {src or '—'} · venant de {ref or 'direct / mail'} : {n} vues, {uniques} visiteurs")
print("\nFin. Colle toute cette sortie dans le fil Claude.")
