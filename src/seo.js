// Le compte rendu SEO de chaque projet qui a un site ou une app (demande de louis du 23/10) :
// « un compte rendu hebdomadaire du niveau de SEO, et les actions possibles à mettre en place ».
// Chaque dimanche matin (config/seo.json), sans IA, le cerveau ouvre chaque site comme le ferait
// Google : page d'accueil (titre, description, balises, vitesse), robots.txt, sitemap, quelques
// pages du sitemap, llms.txt et l'accès laissé aux robots des IA (GEO). Il y ajoute les visites
// venues des moteurs et des IA (Umami) et la fiche de l'app dans les stores quand elle existe.
// Il en tire une note sur 100 et les actions possibles, rangées par importance : celles que la
// loop du projet peut faire seule (gratuites, réversibles) et celles qui demandent louis.
// Rien n'est inventé : ce qui n'a pas pu être lu est « indisponible », jamais 0.
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';
import { jourParis } from './questions.js';

const LIMITE_HTML = 2_000_000;
// Les robots des IA à laisser passer pour être cité par ChatGPT, Claude, Perplexity, Google IA.
export const ROBOTS_IA = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended'];
const MOTEURS = /(^|\.)(google|bing|duckduckgo|qwant|ecosia|yahoo|search\.brave|startpage|yandex|lilo)\./i;
const IA = /(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|chat\.mistral\.ai|you\.com|meta\.ai)/i;

const txt = (v, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const entites = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

// Les attributs d'une balise (<meta name="x" content="y">), quel que soit leur ordre.
function attributs(balise) {
  const a = {};
  for (const m of balise.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) a[m[1].toLowerCase()] = entites(m[3] ?? m[4] ?? m[5] ?? '');
  return a;
}

// Ce qu'un moteur lit dans une page HTML.
export function analyserHtml(html) {
  const h = String(html ?? '');
  const metas = [...h.matchAll(/<meta\b[^>]*>/gi)].map((m) => attributs(m[0]));
  const meta = (cle) => metas.find((m) => (m.name ?? m.property ?? '').toLowerCase() === cle)?.content;
  const liens = [...h.matchAll(/<link\b[^>]*>/gi)].map((m) => attributs(m[0]));
  const types = [];
  for (const m of h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      for (const x of [j, ...(Array.isArray(j) ? j : []), ...(j?.['@graph'] ?? [])]) if (x?.['@type']) types.push(...[].concat(x['@type']).map(String));
    } catch {
      types.push('illisible');
    }
  }
  const images = [...h.matchAll(/<img\b[^>]*>/gi)].map((m) => attributs(m[0]));
  return {
    titre: txt(entites(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''), 200) || null,
    description: txt(meta('description'), 400) || null,
    h1: (h.match(/<h1\b/gi) ?? []).length,
    canonique: liens.find((l) => (l.rel ?? '').toLowerCase() === 'canonical')?.href ?? null,
    noindex: /noindex/i.test(meta('robots') ?? '') || /noindex/i.test(meta('googlebot') ?? ''),
    langue: attributs(h.match(/<html\b[^>]*>/i)?.[0] ?? '').lang ?? null,
    viewport: Boolean(meta('viewport')),
    ogTitre: Boolean(meta('og:title')),
    ogImage: Boolean(meta('og:image')),
    donneesStructurees: [...new Set(types)].slice(0, 10),
    images: images.length,
    imagesSansAlt: images.filter((i) => !('alt' in i)).length,
  };
}

// Les règles du robots.txt : ce qui est fermé à tous (*) et à chaque robot d'IA, et les sitemaps déclarés.
export function analyserRobots(texte) {
  const groupes = [];
  let courant = null;
  const sitemaps = [];
  for (const brute of String(texte ?? '').split(/\r?\n/)) {
    const ligne = brute.replace(/#.*/, '').trim();
    const m = ligne.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [cle, valeur] = [m[1].toLowerCase(), m[2].trim()];
    if (cle === 'sitemap') sitemaps.push(valeur);
    else if (cle === 'user-agent') {
      if (!courant || courant.regles.length) groupes.push((courant = { agents: [], regles: [] }));
      courant.agents.push(valeur.toLowerCase());
    } else if ((cle === 'disallow' || cle === 'allow') && courant) courant.regles.push({ cle, valeur });
  }
  // Un robot suit son groupe s'il en a un, sinon celui de « * ». Fermé = « Disallow: / » sans « Allow: / ».
  const ferme = (agent) => {
    const g = groupes.find((x) => x.agents.includes(agent.toLowerCase())) ?? groupes.find((x) => x.agents.includes('*'));
    if (!g) return false;
    return g.regles.some((r) => r.cle === 'disallow' && r.valeur === '/') && !g.regles.some((r) => r.cle === 'allow' && r.valeur === '/');
  };
  return { toutFerme: ferme('Googlebot'), iaFermees: ROBOTS_IA.filter(ferme), sitemaps };
}

// Les adresses d'un sitemap, ou des sitemaps qu'il regroupe.
export function analyserSitemap(xml) {
  const x = String(xml ?? '');
  const locs = [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => entites(m[1]));
  return /<sitemapindex/i.test(x) ? { index: true, sitemaps: locs, urls: [] } : { index: false, sitemaps: [], urls: locs };
}

// Les visites venues des moteurs de recherche et des IA, d'après les sources Umami (30 jours).
export function visitesRecherche(business, projet) {
  const s = business?.sources?.visites?.sites?.[projet];
  if (!s) return null;
  let moteurs = 0;
  let ia = 0;
  for (const p of s.provenance ?? []) {
    if (IA.test(p.source)) ia += p.n;
    else if (MOTEURS.test(p.source)) moteurs += p.n;
  }
  return { jours: business.sources.visites.jours ?? 30, visites: s.total?.visites ?? 0, moteurs, ia };
}

// Un appel HTTP qui ne casse jamais l'audit : statut, durée, texte (tronqué).
async function lire(f, url, delaiMs) {
  const debut = Date.now();
  try {
    const r = await f(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; CerveauCentral-SEO/1.0)' }, signal: AbortSignal.timeout(delaiMs) });
    const texte = (await r.text()).slice(0, LIMITE_HTML);
    return { statut: r.status, ok: r.ok, ms: Date.now() - debut, texte, url: r.url || url };
  } catch (err) {
    return { statut: 0, ok: false, ms: Date.now() - debut, texte: '', erreur: txt(err.message, 160), url };
  }
}

// Les contrôles, leur poids dans la note et l'action proposée quand ils échouent.
// qui : « loop » = gratuit et réversible, la loop du projet peut le faire seule ; « louis » = un compte à lui.
const CONTROLES = [
  { cle: 'repond', nom: 'Le site répond', poids: 15, qui: 'loop', action: 'Le site ne répond pas correctement à Google : le remettre en marche avant tout le reste.' },
  { cle: 'indexable', nom: 'Google a le droit d’indexer la page d’accueil', poids: 15, qui: 'loop', action: 'Retirer le « noindex » ou le « Disallow: / » qui cache le site à Google.' },
  { cle: 'titre', nom: 'Titre de page (10 à 65 caractères)', poids: 10, qui: 'loop', action: 'Écrire un titre de page de 10 à 65 caractères avec le mot-clé principal (ce que les gens tapent dans Google).' },
  { cle: 'description', nom: 'Description (50 à 160 caractères)', poids: 10, qui: 'loop', action: 'Écrire une meta description de 50 à 160 caractères qui donne envie de cliquer depuis Google.' },
  { cle: 'rapide', nom: 'Page d’accueil servie en moins de 1,5 s', poids: 10, qui: 'loop', action: 'Accélérer la page d’accueil (images compressées, moins de scripts) : Google classe moins bien les sites lents.' },
  { cle: 'sitemap', nom: 'Sitemap lisible', poids: 8, qui: 'loop', action: 'Publier un sitemap.xml qui liste toutes les pages utiles et le déclarer dans robots.txt.' },
  { cle: 'robots', nom: 'robots.txt présent', poids: 6, qui: 'loop', action: 'Publier un robots.txt qui autorise tout et donne l’adresse du sitemap.' },
  { cle: 'pages', nom: 'Pages du sitemap en ligne, avec titre et description uniques', poids: 6, qui: 'loop', action: 'Corriger les pages du sitemap en erreur ou sans titre/description propres (un titre différent par page).' },
  { cle: 'h1', nom: 'Un titre principal (h1)', poids: 5, qui: 'loop', action: 'Mettre un seul titre principal (h1) sur la page d’accueil, avec le mot-clé principal.' },
  { cle: 'canonique', nom: 'Adresse canonique', poids: 5, qui: 'loop', action: 'Ajouter une balise canonical sur chaque page pour éviter les doublons aux yeux de Google.' },
  { cle: 'mobile', nom: 'Adapté au mobile (viewport)', poids: 5, qui: 'loop', action: 'Ajouter la balise viewport : Google indexe d’abord la version mobile.' },
  { cle: 'structure', nom: 'Données structurées (schema.org)', poids: 5, qui: 'loop', action: 'Ajouter des données structurées schema.org (Organization, et Event, Recipe, FAQ selon les pages) : extraits enrichis dans Google et meilleures chances d’être cité par les IA.' },
  { cle: 'ia', nom: 'Robots des IA autorisés (ChatGPT, Claude, Perplexity, Google IA)', poids: 4, qui: 'loop', action: 'Ouvrir robots.txt aux robots des IA (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended) pour pouvoir être cité dans leurs réponses.' },
  { cle: 'partage', nom: 'Aperçu de partage (og:title et og:image)', poids: 4, qui: 'loop', action: 'Ajouter og:title et og:image : un lien partagé sur les réseaux s’affiche avec une image, plus de clics.' },
  { cle: 'langue', nom: 'Langue déclarée', poids: 3, qui: 'loop', action: 'Déclarer la langue (<html lang="fr">) pour être bien rangé dans Google France.' },
  { cle: 'images', nom: 'Images avec texte alternatif', poids: 2, qui: 'loop', action: 'Donner un texte alternatif (alt) à chaque image : lu par Google Images et par les lecteurs d’écran.' },
  { cle: 'llms', nom: 'Fichier llms.txt pour les IA', poids: 2, qui: 'loop', action: 'Publier un /llms.txt qui résume le site en quelques lignes pour les IA.' },
];

// L'audit d'un site : chaque contrôle vaut vrai, faux ou null (pas pu le savoir).
export async function auditerSite(adresse, { fetch: f = fetch, delaiMs = 15_000, maxPages = 5 } = {}) {
  const base = new URL(adresse);
  const accueil = await lire(f, base.href, delaiMs);
  const page = accueil.ok ? analyserHtml(accueil.texte) : null;
  const robotsLu = await lire(f, new URL('/robots.txt', base).href, delaiMs);
  const robots = robotsLu.ok && !/<html/i.test(robotsLu.texte.slice(0, 500)) ? analyserRobots(robotsLu.texte) : null;

  // Le sitemap déclaré dans robots.txt, sinon /sitemap.xml ; un index est déplié (3 sitemaps au plus).
  const urls = [];
  let sitemapLu = false;
  for (const adr of robots?.sitemaps?.length ? robots.sitemaps.slice(0, 2) : [new URL('/sitemap.xml', base).href]) {
    const s = await lire(f, adr, delaiMs);
    if (!s.ok || !/<(urlset|sitemapindex)/i.test(s.texte)) continue;
    sitemapLu = true;
    const lu = analyserSitemap(s.texte);
    urls.push(...lu.urls);
    for (const sous of lu.sitemaps.slice(0, 3)) {
      const t = await lire(f, sous, delaiMs);
      if (t.ok) urls.push(...analyserSitemap(t.texte).urls);
    }
  }
  const pagesSitemap = [...new Set(urls)];

  // Quelques pages du sitemap (hors accueil), pour voir si elles sont en ligne et bien titrées.
  const echantillon = pagesSitemap.filter((u) => u.replace(/\/$/, '') !== base.href.replace(/\/$/, '')).slice(0, maxPages);
  const pages = [];
  for (const u of echantillon) {
    const r = await lire(f, u, delaiMs);
    const a = r.ok ? analyserHtml(r.texte) : null;
    pages.push({ url: txt(u, 200), statut: r.statut, titre: a?.titre ?? null, description: Boolean(a?.description), noindex: Boolean(a?.noindex) });
  }
  const titres = pages.map((p) => p.titre).filter(Boolean);

  const llms = await lire(f, new URL('/llms.txt', base).href, delaiMs);
  const longueur = (t, min, max) => (t ? t.length >= min && t.length <= max : false);
  const siPage = (fn) => (page ? fn(page) : null);
  const ok = {
    repond: accueil.ok,
    indexable: page ? !page.noindex && !robots?.toutFerme : null,
    titre: siPage((p) => longueur(p.titre, 10, 65)),
    description: siPage((p) => longueur(p.description, 50, 160)),
    rapide: accueil.ok ? accueil.ms < 1500 : null,
    sitemap: sitemapLu && pagesSitemap.length > 0,
    robots: Boolean(robots),
    pages: pages.length ? pages.every((p) => p.statut === 200 && p.titre && p.description && !p.noindex) && new Set(titres).size === titres.length : null,
    h1: siPage((p) => p.h1 === 1),
    canonique: siPage((p) => Boolean(p.canonique)),
    mobile: siPage((p) => p.viewport),
    structure: siPage((p) => p.donneesStructurees.length > 0 && !p.donneesStructurees.includes('illisible')),
    ia: robots ? robots.iaFermees.length === 0 : accueil.ok ? true : null,
    partage: siPage((p) => p.ogTitre && p.ogImage),
    langue: siPage((p) => Boolean(p.langue)),
    images: siPage((p) => p.imagesSansAlt === 0),
    llms: accueil.ok ? llms.ok && !/<html/i.test(llms.texte.slice(0, 500)) : null,
  };
  return {
    url: base.href,
    statut: accueil.statut,
    erreur: accueil.erreur ?? null,
    ms: accueil.ok ? accueil.ms : null,
    page,
    robots: robots ? { iaFermees: robots.iaFermees, sitemaps: robots.sitemaps.slice(0, 5) } : null,
    sitemap: sitemapLu ? pagesSitemap.length : null,
    pages,
    controles: CONTROLES.map((c) => ({ cle: c.cle, nom: c.nom, poids: c.poids, ok: ok[c.cle] })),
  };
}

// La fiche de l'app dans les stores : en ligne ou pas (le reste de l'ASO se lira quand elle existera).
export async function auditerApp(app, { fetch: f = fetch, delaiMs = 15_000 } = {}) {
  if (!app) return null;
  const stores = [];
  for (const [store, nom] of [['ios', 'App Store'], ['android', 'Google Play']]) {
    if (!app[store]) {
      stores.push({ store: nom, etat: 'indisponible' });
      continue;
    }
    const r = await lire(f, app[store], delaiMs);
    stores.push({ store: nom, url: app[store], etat: r.ok ? 'en ligne' : `ne répond pas (${r.statut || r.erreur})`, titre: r.ok ? analyserHtml(r.texte).titre : null });
  }
  return { nom: app.nom ?? 'app mobile', stores };
}

// La note sur 100 (contrôles connus seulement) et les actions possibles, les plus lourdes d'abord.
export function noter(audit, { recherche = null, app = null, maxActions = 6 } = {}) {
  const connus = audit.controles.filter((c) => c.ok !== null);
  const total = connus.reduce((s, c) => s + c.poids, 0);
  const note = total ? Math.round((connus.filter((c) => c.ok).reduce((s, c) => s + c.poids, 0) / total) * 100) : null;
  // Les actions de la loop (6 au plus, les plus lourdes d'abord), puis toujours celles de louis.
  const actions = audit.controles
    .filter((c) => c.ok === false)
    .sort((a, b) => b.poids - a.poids)
    .map((c) => {
      const def = CONTROLES.find((x) => x.cle === c.cle);
      return { cle: c.cle, texte: def.action, qui: def.qui };
    })
    .slice(0, maxActions);
  // Le site est propre mais personne ne vient de Google : c'est l'inscription aux moteurs qui manque.
  if (audit.controles.find((c) => c.cle === 'repond')?.ok && recherche && recherche.moteurs === 0) {
    actions.push({ cle: 'console', texte: 'Aucune visite venue de Google ou Bing en 30 jours : inscrire le site dans Google Search Console et Bing Webmaster Tools et y déposer le sitemap (gratuit, 10 minutes).', qui: 'louis' });
  }
  if (app?.stores.every((s) => s.etat === 'indisponible')) {
    actions.push({ cle: 'store', texte: `${app.nom} : pas encore de fiche App Store ni Google Play connue du cerveau. Le jour de sa publication, ajouter son lien dans config/seo.json pour suivre son référencement dans les stores.`, qui: 'louis' });
  }
  return { note, actions };
}

export async function chargerSeo(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { rapports: [] };
  }
}
export const sauverSeo = sauverJson;

const heureParis = (d) => Number(new Date(d).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }));

// Le compte rendu de la semaine est-il à faire ? Le premier se fait tout de suite, puis chaque
// semaine le jour et l'heure de config/seo.json (0 = dimanche). Renvoie son identifiant (le jour).
export function seoAFaire(donnees, { jour = 0, heure = 8, maintenant = new Date() } = {}) {
  const auj = jourParis(maintenant);
  if (!donnees.rapports.length) return auj;
  if (new Date(`${auj}T12:00:00Z`).getUTCDay() !== jour || heureParis(maintenant) < heure) return null;
  return donnees.rapports.some((r) => r.jour === auj) ? null : auj;
}

// Le compte rendu de tous les projets, ajouté à l'historique (26 semaines gardées).
export async function faireCompteRendu(donnees, { projets = {}, business, jour, fetch: f = fetch, maintenant = new Date() } = {}) {
  const precedent = donnees.rapports.at(-1);
  const rapport = { jour, quand: maintenant.toISOString(), projets: {} };
  for (const [id, cfg] of Object.entries(projets)) {
    const audit = cfg.site ? await auditerSite(cfg.site, { fetch: f }) : null;
    const app = await auditerApp(cfg.app, { fetch: f });
    const recherche = visitesRecherche(business, id);
    const { note, actions } = audit ? noter(audit, { recherche, app }) : { note: null, actions: noter({ controles: [] }, { app }).actions };
    rapport.projets[id] = { nom: cfg.nom ?? id, note, notePrecedente: precedent?.projets?.[id]?.note ?? null, actions, recherche, app, audit };
  }
  donnees.rapports.push(rapport);
  donnees.rapports = donnees.rapports.slice(-26);
  return rapport;
}

// Une ligne par projet et par semaine pour l'historique des décisions (et Notion).
export function decisionsSeo(donnees) {
  const lignes = [];
  for (const r of (donnees?.rapports ?? []).slice(-8)) {
    for (const [id, p] of Object.entries(r.projets)) {
      const ecart = p.note !== null && p.notePrecedente !== null ? ` (${p.note >= p.notePrecedente ? '+' : ''}${p.note - p.notePrecedente})` : '';
      const actions = p.actions ?? [];
      const quoi = `${p.nom ?? id} : SEO ${p.note === null ? 'indisponible (site illisible)' : `${p.note}/100${ecart}`}. ${actions.length ? `À faire : ${actions.slice(0, 3).map((a) => a.texte).join(' ')}` : 'Rien à corriger cette semaine.'}`;
      const pourquoi = p.recherche ? `Visites sur ${p.recherche.jours} j : ${p.recherche.visites}, dont ${p.recherche.moteurs} venues des moteurs et ${p.recherche.ia} des IA (sources principales Umami).` : 'Visites venues des moteurs : indisponible (Umami ne suit pas ce site).';
      lignes.push({ projet: id, jour: r.jour, quoi, pourquoi });
    }
  }
  return lignes;
}

// Ce que les loops lisent : le dernier compte rendu d'un projet, sans le détail brut des pages.
export function seoPourLoop(donnees, projet) {
  const r = donnees?.rapports?.at(-1);
  const p = r?.projets?.[projet];
  if (!p) return 'indisponible (pas encore de compte rendu SEO)';
  return { jour: r.jour, note: p.note, notePrecedente: p.notePrecedente, actions: p.actions, recherche: p.recherche ?? 'indisponible', app: p.app, controles: p.audit?.controles ?? [] };
}

// L'état de chaque action vue par le compte rendu : vrai (en place), faux (pas faite), null (pas su).
export function etatsActions(p) {
  const etats = (p.audit?.controles ?? []).map((c) => ({ cle: c.cle, ok: c.ok, poids: c.poids }));
  if (p.recherche && p.audit?.controles.find((c) => c.cle === 'repond')?.ok) etats.push({ cle: 'console', ok: p.recherche.moteurs > 0, poids: 10 });
  if (p.app) etats.push({ cle: 'store', ok: p.app.stores.some((s) => s.etat === 'en ligne'), poids: 10 });
  return etats;
}

const TITRES_EXTRA = { console: 'Inscrire le site dans Google Search Console et Bing Webmaster Tools', store: 'Fiche App Store / Google Play publiée et suivie' };
const ACTION_DE = (cle) => CONTROLES.find((c) => c.cle === cle)?.action ?? TITRES_EXTRA[cle] ?? cle;
const QUI_DE = (cle) => (cle === 'console' || cle === 'store' ? 'Walid' : 'Loop');
const impact = (poids) => (poids >= 10 ? 'Fort' : poids >= 5 ? 'Moyen' : 'Faible');

// Tient à jour la table Notion « Actions SEO à mettre en place » de chaque projet (format convenu
// le 23/10 avec le fil des pages actions) : seules les lignes qui portent une « Clé » de contrôle
// sont touchées (État, Vérifié le, Note), celles qui manquent sont créées ; les autres lignes
// (idées écrites à la main ou par les loops) ne sont jamais modifiées.
export async function envoyerSeoNotion(rapport, { jeton, sources = {}, fetch: f = fetch } = {}) {
  const ids = Object.entries(sources).filter(([id, s]) => s && rapport.projets[id]);
  if (!jeton || !ids.length) return { ignore: true };
  const entetes = { authorization: `Bearer ${jeton}`, 'notion-version': '2025-09-03', 'content-type': 'application/json' };
  const appel = async (methode, chemin, corps) => {
    const r = await f(`https://api.notion.com/v1/${chemin}`, { method: methode, headers: entetes, ...(corps ? { body: JSON.stringify(corps) } : {}) });
    if (!r.ok) throw new Error(`Notion ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const texte = (t) => [{ type: 'text', text: { content: txt(t, 1990) } }];
  let creees = 0;
  let majs = 0;
  for (const [id, source] of ids) {
    const p = rapport.projets[id];
    // Le type de chaque colonne (select ou status) est lu dans la table, pour écrire au bon format.
    const schema = (await appel('GET', `data_sources/${source}`)).properties ?? {};
    const choix = (nom, valeur) => (schema[nom] ? { [nom]: { [schema[nom].type === 'status' ? 'status' : 'select']: { name: valeur } } } : {});
    const enPlace = Object.values(schema['État']?.[schema['État']?.type]?.options ?? []).map((o) => o.name);
    const nomEtat = (ok) => enPlace.find((n) => (ok ? /en place/i : /pas faite/i).test(n)) ?? (ok ? '✅ En place' : '⬜ Pas faite');
    const lignes = new Map();
    let curseur;
    do {
      const r = await appel('POST', `data_sources/${source}/query`, { page_size: 100, ...(curseur ? { start_cursor: curseur } : {}) });
      for (const pg of r.results ?? []) {
        const cle = (pg.properties?.['Clé']?.rich_text ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('').replace(/\\/g, '').trim();
        if (cle) lignes.set(cle, pg.id);
      }
      curseur = r.has_more ? r.next_cursor : null;
    } while (curseur);
    for (const x of etatsActions(p).filter((y) => y.ok !== null)) {
      const note = x.ok ? `Vérifié par le cerveau le ${rapport.jour} : le contrôle passe.` : `Vérifié par le cerveau le ${rapport.jour} : ${ACTION_DE(x.cle)}`;
      const proprietes = { ...choix('État', nomEtat(x.ok)), 'Vérifié le': { date: { start: rapport.jour } }, Note: { rich_text: texte(note) } };
      if (lignes.has(x.cle)) {
        await appel('PATCH', `pages/${lignes.get(x.cle)}`, { properties: proprietes });
        majs += 1;
      } else {
        const titre = CONTROLES.find((c) => c.cle === x.cle)?.nom ?? TITRES_EXTRA[x.cle] ?? x.cle;
        await appel('POST', 'pages', {
          parent: { type: 'data_source_id', data_source_id: source },
          properties: { Action: { title: texte(titre) }, ...proprietes, ...choix('Catégorie', 'SEO technique'), ...choix('Impact', impact(x.poids)), ...choix('Qui', QUI_DE(x.cle)), Clé: { rich_text: texte(x.cle) } },
        });
        creees += 1;
      }
    }
  }
  return { creees, majs };
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const date = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
const pct = (n, total) => (total ? ` (${Math.round((n / total) * 100)} %)` : '');

// Le bloc « SEO » de la page projet (vue d'ensemble).
export function htmlSeo(donnees, projet, { jourSemaine = 0, heure = 8 } = {}) {
  const r = donnees?.rapports?.at(-1);
  const p = r?.projets?.[projet];
  if (!p) return '';
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const ecart = p.note !== null && p.notePrecedente !== null && p.note !== p.notePrecedente ? `<em class="${p.note > p.notePrecedente ? 'haut' : 'bas'}">${p.note > p.notePrecedente ? '▲' : '▼'} ${Math.abs(p.note - p.notePrecedente)}</em>` : '';
  const a = p.audit;
  const controles = a
    ? `<details class="texte"><summary>Les ${a.controles.length} contrôles</summary><ul class="seo-controles">${a.controles
        .map((c) => `<li>${c.ok === null ? '⚪' : c.ok ? '✅' : '❌'} ${e(c.nom)}</li>`)
        .join('')}</ul><p class="vide petit-texte">${e(a.url)} · ${a.ms === null ? `ne répond pas${a.erreur ? ` (${e(a.erreur)})` : ` (statut ${a.statut})`}` : `${a.ms} ms`} · ${a.sitemap === null ? 'pas de sitemap' : `${a.sitemap} page(s) dans le sitemap`}${a.page?.titre ? ` · titre : « ${e(a.page.titre)} »` : ''}</p></details>`
    : '';
  const rech = p.recherche;
  const ligneRecherche = rech
    ? `<div><b>${rech.moteurs}</b><span>visites venues de Google, Bing… sur ${rech.jours} j${pct(rech.moteurs, rech.visites)}</span></div><div><b>${rech.ia}</b><span>visites venues des IA (ChatGPT, Perplexity…)${pct(rech.ia, rech.visites)}</span></div>`
    : '<div><b>—</b><span>visites venues des moteurs : indisponible</span></div>';
  const app = p.app ? `<p class="petit-texte">📱 ${e(p.app.nom)} : ${p.app.stores.map((s) => `${e(s.store)} ${s.etat === 'en ligne' ? `<a href="${e(s.url)}">en ligne</a>` : e(s.etat)}`).join(' · ')}</p>` : '';
  const actions = p.actions.length
    ? `<ol class="seo-actions">${p.actions.map((x) => `<li>${e(x.texte)} <small>${x.qui === 'louis' ? '👤 toi' : '🔁 la loop peut le faire seule'}</small></li>`).join('')}</ol>`
    : '<p class="vide">🟢 Aucune action SEO à faire cette semaine.</p>';
  return `<section class="bloc seo"><h3>🔎 SEO <small>(compte rendu du ${e(date(r.jour))}, refait chaque ${jours[jourSemaine]} à ${heure} h)</small></h3>
<div class="chiffres-v"><div><b>${p.note === null ? '—' : `${p.note}/100`}${ecart}</b><span>niveau SEO du site</span></div>${ligneRecherche}</div>
${app}
<b class="petit-texte">Actions possibles</b>${actions}
${controles}
<p class="vide petit-texte">Contrôles faits sans IA comme le ferait Google (balises, vitesse, robots.txt, sitemap, pages, accès des robots d’IA). Visites : sources principales d’Umami. Chaque compte rendu est recopié dans Notion : table « Décisions des loops » et table « Actions SEO à mettre en place » du projet.</p></section>`;
}

export const CSS_SEO = `.seo-actions { margin:4px 0 8px; padding-left:20px; } .seo-actions li { margin:3px 0; font-size:14px; } .seo-actions small { color:var(--doux); white-space:nowrap; }
.seo-controles { list-style:none; padding:0; margin:6px 0; columns:2 260px; font-size:13px; } .seo-controles li { padding:2px 0; break-inside:avoid; }`;
