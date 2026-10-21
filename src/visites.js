// Les visites des sites (Nūr Meet, Leviaro, VégéBudget) : lues chez Umami, le
// compteur gratuit installé sur le VPS Nūr (étape 5 de la refonte du 11/10).
// Le cerveau se connecte à Umami, retrouve chaque site par son domaine
// (config/visites.json) et garde, pour 30 jours : visiteurs, visites, pages vues,
// rebonds, temps passé, la courbe par jour, les pages les plus vues et d'où
// viennent les visites. Rien n'est inventé : site absent chez Umami = « pas branché ».
const entier = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
const texte = (v, max = 120) => String(v ?? '').slice(0, max);

// Une connexion à Umami : jeton d'API (Umami Cloud) ou identifiant + mot de passe (auto-hébergé).
export function clientUmami({ url, cleApi, utilisateur, motDePasse, delaiMs = 20_000 }) {
  let jeton = null;
  const base = String(url).replace(/\/$/, '');
  const entetes = () => (cleApi ? { 'x-umami-api-key': cleApi } : jeton ? { authorization: `Bearer ${jeton}` } : {});
  const appel = async (chemin, params = {}) => {
    const u = new URL(`${base}/api${chemin}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const r = await fetch(u, { headers: entetes(), signal: AbortSignal.timeout(delaiMs) });
    if (!r.ok) throw new Error(`Umami répond ${r.status} sur ${chemin}`);
    return r.json();
  };
  const connecter = async () => {
    if (cleApi || jeton) return;
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: utilisateur, password: motDePasse }),
      signal: AbortSignal.timeout(delaiMs),
    });
    if (!r.ok) throw new Error(`Umami refuse la connexion (${r.status}) : vérifier UMAMI_UTILISATEUR et UMAMI_MOT_DE_PASSE`);
    jeton = (await r.json()).token;
    if (!jeton) throw new Error('Umami n’a pas renvoyé de jeton');
  };
  return async (chemin, params) => {
    await connecter();
    return appel(chemin, params);
  };
}

const jourDe = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

// Lit les 30 derniers jours de chaque site listé dans `sites` ({ projet: domaine }).
export async function synchroniserVisites(business, { url, cleApi, utilisateur, motDePasse, sites = {}, appel, jours = 30, maintenant = new Date() } = {}) {
  if (!Object.keys(sites).length) return { ignore: true };
  if (!appel && (!url || (!cleApi && !(utilisateur && motDePasse)))) return { ignore: true };
  appel ??= clientUmami({ url, cleApi, utilisateur, motDePasse });

  const liste = await appel('/websites');
  const connus = Array.isArray(liste?.data) ? liste.data : Array.isArray(liste) ? liste : [];
  const fin = maintenant.getTime();
  const debut = fin - jours * 86_400_000;
  const resultat = { maj: maintenant.toISOString(), jours, sites: {}, absents: [] };

  for (const [projet, domaine] of Object.entries(sites)) {
    const site = connus.find((w) => String(w.domain ?? '').toLowerCase() === String(domaine).toLowerCase());
    if (!site) {
      resultat.absents.push({ projet, domaine });
      continue;
    }
    const periode = { startAt: debut, endAt: fin };
    // Les listes (pages, provenance) sont un plus : un refus d'Umami sur l'une d'elles ne doit
    // pas faire perdre les chiffres du site. Umami 3 appelle « path » ce que la v2 appelait « url ».
    const liste = (type) => appel(`/websites/${site.id}/metrics`, { ...periode, type, limit: 10 });
    const [stats, courbe, pages, provenance] = await Promise.all([
      appel(`/websites/${site.id}/stats`, periode),
      appel(`/websites/${site.id}/pageviews`, { ...periode, unit: 'day', timezone: 'Europe/Paris' }),
      liste('path').catch(() => liste('url')).catch(() => []),
      liste('referrer').catch(() => []),
    ]);
    const val = (x) => entier(typeof x === 'object' && x !== null ? x.value : x);
    const prec = (x) => (typeof x === 'object' && x !== null && x.prev !== undefined ? entier(x.prev) : null);
    const parJour = new Map();
    for (const p of courbe?.pageviews ?? []) parJour.set(jourDe(new Date(p.x).getTime()), { jour: jourDe(new Date(p.x).getTime()), vues: entier(p.y), visites: 0 });
    for (const s of courbe?.sessions ?? []) {
      const j = jourDe(new Date(s.x).getTime());
      const e = parJour.get(j) ?? { jour: j, vues: 0, visites: 0 };
      e.visites = entier(s.y);
      parJour.set(j, e);
    }
    resultat.sites[projet] = {
      id: texte(site.id, 60),
      domaine: texte(site.domain),
      total: {
        visiteurs: val(stats?.visitors),
        visites: val(stats?.visits),
        vues: val(stats?.pageviews),
        rebonds: val(stats?.bounces),
        secondes: val(stats?.totaltime),
        precedent: { visiteurs: prec(stats?.visitors), visites: prec(stats?.visits), vues: prec(stats?.pageviews) },
      },
      parJour: [...parJour.values()].sort((a, b) => a.jour.localeCompare(b.jour)),
      pages: (Array.isArray(pages) ? pages : []).slice(0, 10).map((p) => ({ page: texte(p.x), n: entier(p.y) })),
      provenance: (Array.isArray(provenance) ? provenance : []).slice(0, 10).map((p) => ({ source: texte(p.x) || 'accès direct', n: entier(p.y) })),
    };
  }
  business.sources.visites = resultat;
  return { sites: Object.keys(resultat.sites).length, absents: resultat.absents.length };
}

// Ce que la page projet affiche : les visites d'un projet, ou null si pas branché.
export function visitesDe(business, projet) {
  const v = business?.sources?.visites;
  if (!v) return null;
  const s = v.sites?.[projet];
  if (!s) return v.absents?.some((a) => a.projet === projet) ? { absent: true, domaine: v.absents.find((a) => a.projet === projet).domaine, maj: v.maj } : null;
  const t = s.total;
  return {
    maj: v.maj,
    jours: v.jours,
    domaine: s.domaine,
    visiteurs: t.visiteurs,
    visites: t.visites,
    vues: t.vues,
    rebondPct: t.visites ? Math.round((t.rebonds / t.visites) * 100) : null,
    secondesParVisite: t.visites ? Math.round(t.secondes / t.visites) : null,
    precedent: t.precedent,
    parJour: s.parJour,
    pages: s.pages,
    provenance: s.provenance,
  };
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (x) => Number(x ?? 0).toLocaleString('fr-FR');
const ecart = (a, b) => (b === null || b === undefined ? '' : a > b ? `<em class="haut">▲ ${n(a - b)}</em>` : a < b ? `<em class="bas">▼ ${n(b - a)}</em>` : '<em class="egal">=</em>');

// Le bloc « Visites du site » de la page projet.
export function htmlVisites(v) {
  if (!v) return '';
  if (v.absent) return `<section class="bloc visites"><h3>Visites du site</h3><p class="vide">Umami est branché mais ne connaît pas encore ${e(v.domaine)} : ajoute le site dans Umami (même domaine) et pose sa ligne de suivi sur le site.</p></section>`;
  const max = Math.max(1, ...v.parJour.map((j) => j.vues));
  const courbe = v.parJour.length
    ? `<div class="courbe-v">${v.parJour.map((j) => `<span title="${e(j.jour)} : ${n(j.vues)} vue(s), ${n(j.visites)} visite(s)" style="height:${Math.max(2, Math.round((j.vues / max) * 48))}px"></span>`).join('')}</div>`
    : '';
  const liste = (titre, lignes, cle) =>
    lignes.length ? `<div class="liste-v"><b>${titre}</b><ul>${lignes.map((x) => `<li><span>${e(x[cle])}</span><span class="num">${n(x.n)}</span></li>`).join('')}</ul></div>` : '';
  return `<section class="bloc visites"><h3>Visites du site <small>(${v.jours} derniers jours, ${e(v.domaine)})</small></h3>
<div class="chiffres-v">
<div><b>${n(v.visiteurs)}${ecart(v.visiteurs, v.precedent?.visiteurs)}</b><span>visiteurs</span></div>
<div><b>${n(v.visites)}${ecart(v.visites, v.precedent?.visites)}</b><span>visites</span></div>
<div><b>${n(v.vues)}${ecart(v.vues, v.precedent?.vues)}</b><span>pages vues</span></div>
<div><b>${v.rebondPct === null ? '—' : `${v.rebondPct} %`}</b><span>repartis tout de suite</span></div>
<div><b>${v.secondesParVisite === null ? '—' : v.secondesParVisite >= 60 ? `${Math.floor(v.secondesParVisite / 60)} min ${String(v.secondesParVisite % 60).padStart(2, '0')}` : `${v.secondesParVisite} s`}</b><span>par visite</span></div>
</div>
${courbe}
<div class="listes-v">${liste('Pages les plus vues', v.pages, 'page')}${liste('D’où viennent les visites', v.provenance, 'source')}</div>
<p class="vide">▲▼ par rapport aux ${v.jours} jours d’avant. Compteur Umami sur le VPS Nūr, sans cookie.</p></section>`;
}

export const CSS_VISITES = `.chiffres-v { display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px; margin-bottom:8px; }
.chiffres-v div { display:flex; flex-direction:column; } .chiffres-v b { font-size:22px; line-height:1.1; display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; }
.chiffres-v b em { font-style:normal; font-size:12px; font-weight:600; } .chiffres-v .haut { color:var(--ok); } .chiffres-v .bas { color:var(--panne); } .chiffres-v .egal { color:var(--doux); }
.chiffres-v span { font-size:12px; color:var(--doux); }
.courbe-v { display:flex; align-items:flex-end; gap:2px; height:50px; margin:6px 0 10px; } .courbe-v span { flex:1; background:var(--or); border-radius:2px 2px 0 0; min-width:3px; }
.listes-v { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; }
.liste-v b { font-size:13px; } .liste-v ul { list-style:none; margin:4px 0 0; padding:0; } .liste-v li { display:flex; justify-content:space-between; gap:8px; font-size:13px; padding:3px 0; border-top:1px solid var(--bord); } .liste-v li:first-child { border-top:0; }
.liste-v li span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }`;
