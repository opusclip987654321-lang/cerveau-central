import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyserHtml, analyserRobots, analyserSitemap, auditerSite, noter, seoAFaire, faireCompteRendu, decisionsSeo, seoPourLoop, htmlSeo, envoyerSeoNotion, visitesRecherche } from '../src/seo.js';
import { collecterDecisions, htmlDecisions } from '../src/decisions.js';

const BON = `<!doctype html><html lang="fr"><head><title>Nūr Meet : rencontres et networking à Paris</title>
<meta content="Des soirées de rencontre et de networking en présentiel à Paris, sur candidature, dans des restaurants partenaires." name="description">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="https://site.test/">
<meta property="og:title" content="Nūr Meet"><meta property="og:image" content="https://site.test/og.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"Event"}]}</script>
</head><body><h1>Rencontres</h1><img src="a.png" alt="salle"></body></html>`;
const PAGE = (n) => `<html lang="fr"><head><title>Page ${n} de Nūr Meet</title><meta name="description" content="Description de la page ${n}, assez longue pour Google et unique."></head><body><h1>${n}</h1></body></html>`;

// Un faux web : `pages` = { chemin: [statut, texte] } sur https://site.test.
const fauxWeb = (pages) => async (url) => {
  const u = new URL(url);
  const [statut, texte] = pages[u.pathname] ?? [404, '<html>introuvable</html>'];
  return { status: statut, ok: statut >= 200 && statut < 300, url, text: async () => texte };
};

test('analyserHtml : balises lues quel que soit l’ordre des attributs', () => {
  const a = analyserHtml(BON);
  assert.equal(a.titre, 'Nūr Meet : rencontres et networking à Paris');
  assert.match(a.description, /^Des soirées/);
  assert.equal(a.h1, 1);
  assert.equal(a.canonique, 'https://site.test/');
  assert.equal(a.langue, 'fr');
  assert.equal(a.noindex, false);
  assert.deepEqual(a.donneesStructurees, ['Organization', 'Event']);
  assert.equal(a.imagesSansAlt, 0);
  assert.equal(analyserHtml('<meta name="robots" content="noindex, follow">').noindex, true);
});

test('analyserRobots : site fermé, robots des IA fermés, sitemaps', () => {
  const r = analyserRobots('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nSitemap: https://site.test/sitemap.xml');
  assert.equal(r.toutFerme, false);
  assert.deepEqual(r.iaFermees, ['GPTBot', 'ClaudeBot']);
  assert.deepEqual(r.sitemaps, ['https://site.test/sitemap.xml']);
  assert.equal(analyserRobots('User-agent: *\nDisallow: /').toutFerme, true);
  assert.equal(analyserRobots('User-agent: *\nDisallow: /admin').iaFermees.length, 0);
});

test('analyserSitemap : urlset et index', () => {
  assert.deepEqual(analyserSitemap('<urlset><url><loc>https://a/1</loc></url><url><loc> https://a/2 </loc></url></urlset>').urls, ['https://a/1', 'https://a/2']);
  const i = analyserSitemap('<sitemapindex><sitemap><loc>https://a/s1.xml</loc></sitemap></sitemapindex>');
  assert.equal(i.index, true);
  assert.deepEqual(i.sitemaps, ['https://a/s1.xml']);
});

test('auditerSite : un site propre a 100, un site nu a ses actions dans l’ordre', async () => {
  const propre = fauxWeb({
    '/': [200, BON],
    '/robots.txt': [200, 'User-agent: *\nAllow: /\nSitemap: https://site.test/index.xml'],
    '/index.xml': [200, '<sitemapindex><sitemap><loc>https://site.test/s1.xml</loc></sitemap></sitemapindex>'],
    '/s1.xml': [200, '<urlset><url><loc>https://site.test/</loc></url><url><loc>https://site.test/a</loc></url><url><loc>https://site.test/b</loc></url></urlset>'],
    '/a': [200, PAGE('a')],
    '/b': [200, PAGE('b')],
    '/llms.txt': [200, '# Nūr Meet'],
  });
  const a = await auditerSite('https://site.test', { fetch: propre });
  assert.equal(a.sitemap, 3);
  assert.equal(a.pages.length, 2);
  assert.deepEqual(a.controles.filter((c) => c.ok !== true).map((c) => c.cle), []);
  assert.equal(noter(a, { recherche: { visites: 50, moteurs: 10, ia: 1 } }).note, 100);

  const nu = await auditerSite('https://site.test', { fetch: fauxWeb({ '/': [200, '<html><body>Bonjour</body></html>'] }) });
  const n = noter(nu, { recherche: { visites: 20, moteurs: 0, ia: 0 }, app: { nom: 'App', stores: [{ store: 'App Store', etat: 'indisponible' }, { store: 'Google Play', etat: 'indisponible' }] } });
  assert.ok(n.note < 50, `note ${n.note}`);
  assert.equal(n.actions.length, 8);
  assert.equal(n.actions[0].cle, 'titre');
  // Six actions de la loop au plus, puis toujours celles de louis.
  assert.ok(n.actions.slice(0, 6).every((x) => x.qui === 'loop'));
  assert.deepEqual(n.actions.slice(6).map((x) => x.cle), ['console', 'store']);

  // Site injoignable : note sur ce qu'on sait (rien), aucun contrôle de page inventé.
  const mort = await auditerSite('https://site.test', { fetch: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(mort.statut, 0);
  assert.equal(mort.controles.find((c) => c.cle === 'titre').ok, null);
  assert.equal(noter(mort).actions[0].cle, 'repond');
});

test('seoAFaire : tout de suite la première fois, puis le dimanche après l’heure', () => {
  const lundi = new Date('2026-10-26T10:00:00Z');
  assert.equal(seoAFaire({ rapports: [] }, { maintenant: lundi }), '2026-10-26');
  const d = { rapports: [{ jour: '2026-10-23' }] };
  assert.equal(seoAFaire(d, { maintenant: lundi }), null);
  assert.equal(seoAFaire(d, { maintenant: new Date('2026-10-25T05:00:00Z') }), null); // dimanche 7 h Paris (heure d'hiver)
  assert.equal(seoAFaire(d, { maintenant: new Date('2026-10-25T08:00:00Z') }), '2026-10-25');
  assert.equal(seoAFaire({ rapports: [{ jour: '2026-10-25' }] }, { maintenant: new Date('2026-10-25T09:00:00Z') }), null);
});

test('compte rendu : note, écart, visites des moteurs, décisions, page projet et loop', async () => {
  const business = { sources: { visites: { jours: 30, sites: { 'nour-meet': { total: { visites: 100 }, provenance: [{ source: 'google.com', n: 20 }, { source: 'chatgpt.com', n: 3 }, { source: 'gemini.google.com', n: 2 }, { source: 'accès direct', n: 70 }] } } } } };
  assert.deepEqual(visitesRecherche(business, 'nour-meet'), { jours: 30, visites: 100, moteurs: 20, ia: 5 });
  assert.equal(visitesRecherche(business, 'leviaro'), null);

  const donnees = { rapports: [{ jour: '2026-10-18', projets: { 'nour-meet': { note: 40 } } }] };
  const web = fauxWeb({ '/': [200, BON] });
  const r = await faireCompteRendu(donnees, { projets: { 'nour-meet': { nom: 'Nūr Meet', site: 'https://site.test', app: { nom: 'App mobile', ios: null, android: null } } }, business, jour: '2026-10-25', fetch: web });
  const p = r.projets['nour-meet'];
  assert.equal(p.notePrecedente, 40);
  assert.ok(p.note > 40);
  assert.ok(p.actions.some((x) => x.cle === 'sitemap'));
  assert.equal(p.app.stores[0].etat, 'indisponible');

  const lignes = decisionsSeo(donnees);
  assert.equal(lignes.length, 2);
  assert.match(lignes[1].quoi, new RegExp(`Nūr Meet : SEO ${p.note}/100 \\(\\+${p.note - 40}\\)`));
  assert.match(lignes[1].pourquoi, /20 venues des moteurs et 5 des IA/);
  const d = collecterDecisions({ seo: lignes });
  assert.deepEqual(d.map((x) => x.cle), ['seo-nour-meet:semaine:2026-10-18', 'seo-nour-meet:semaine:2026-10-25']);
  assert.match(htmlDecisions({ decisions: d.map((x) => ({ ...x, vu: 'x' })) }, 'nour-meet'), /Leçon/);

  const html = htmlSeo(donnees, 'nour-meet');
  assert.match(html, /🔎 SEO/);
  assert.match(html, /dimanche 25 octobre/);
  assert.match(html, new RegExp(`${p.note}/100<em class="haut">▲`));
  assert.match(html, /visites venues de Google, Bing… sur 30 j \(20 %\)/);
  assert.match(html, /la loop peut le faire seule/);
  assert.equal(htmlSeo(donnees, 'cambodge'), '');

  assert.equal(seoPourLoop(donnees, 'nour-meet').note, p.note);
  assert.match(seoPourLoop({ rapports: [] }, 'vegebudget'), /indisponible/);
});

test('envoyerSeoNotion : met à jour les lignes à Clé, crée celles qui manquent, ignore les autres', async () => {
  const donnees = { rapports: [] };
  const r = await faireCompteRendu(donnees, { projets: { leviaro: { nom: 'Leviaro', site: 'https://site.test' } }, business: {}, jour: '2026-10-25', fetch: fauxWeb({ '/': [200, BON] }) });
  const appels = [];
  const notion = async (url, opts) => {
    const chemin = url.replace('https://api.notion.com/v1/', '');
    appels.push([opts.method, chemin, opts.body ? JSON.parse(opts.body) : null]);
    if (opts.method === 'GET') return { ok: true, json: async () => ({ properties: { 'État': { type: 'status', status: { options: [{ name: '✅ En place' }, { name: '⬜ Pas faite' }] } }, Qui: { type: 'select' } } }) };
    if (chemin.endsWith('/query')) return { ok: true, json: async () => ({ results: [{ id: 'p-titre', properties: { Clé: { rich_text: [{ plain_text: 'titre' }] } } }, { id: 'p-main', properties: { Clé: { rich_text: [] } } }], has_more: false }) };
    return { ok: true, json: async () => ({}) };
  };
  assert.deepEqual(await envoyerSeoNotion(r, { jeton: 'x', sources: {} , fetch: notion }), { ignore: true });
  const n = await envoyerSeoNotion(r, { jeton: 'x', sources: { leviaro: 'ds1' }, fetch: notion });
  const connus = r.projets.leviaro.audit.controles.filter((c) => c.ok !== null).length;
  assert.equal(n.majs, 1);
  assert.equal(n.creees, connus - 1);
  const maj = appels.find(([m, c]) => m === 'PATCH');
  assert.equal(maj[1], 'pages/p-titre');
  assert.deepEqual(maj[2].properties['État'], { status: { name: '✅ En place' } });
  assert.ok(!appels.some(([, c]) => c === 'pages/p-main'));
  const creation = appels.find(([m, c, b]) => m === 'POST' && c === 'pages' && b.properties.Clé.rich_text[0].text.content === 'sitemap');
  assert.deepEqual(creation[2].properties['État'], { status: { name: '⬜ Pas faite' } });
  assert.deepEqual(creation[2].properties.Qui, { select: { name: 'Loop' } });
  assert.equal(creation[2].properties['Catégorie'], undefined); // colonne absente de la table : rien d'écrit
});
