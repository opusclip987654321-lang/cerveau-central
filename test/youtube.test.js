import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { referenceChaine, synchroniserYoutube, gainsPeriode, synchroniserRevenus, revenusPeriode, urlAutorisation, echangerCode, lireFlux, synchroniserFluxYoutube, chainesYoutube } from '../src/youtube.js';
import { tableauDeBord, joursJusqua } from '../src/business.js';
import { jourPublication } from '../src/youtube.js';

test('jourPublication : le vrai jour de sortie, pas celui de l’envoi', () => {
  // Vidéo programmée : envoyée le 2, sortie le 5 à 18 h Paris.
  assert.equal(jourPublication({ envoi: '2026-10-02T10:00:00Z', publication: '2026-10-05T16:00:00Z' }), '2026-10-05');
  // Première : le début réel compte.
  assert.equal(jourPublication({ envoi: '2026-10-02T10:00:00Z', publication: '2026-10-02T10:00:00Z', premiere: '2026-10-07T16:00:00Z' }), '2026-10-07');
  // Vidéo ordinaire : les dates concordent.
  assert.equal(jourPublication({ envoi: '2026-10-04T18:00:00Z', publication: '2026-10-04T18:00:00Z' }), '2026-10-04');
  assert.equal(jourPublication({ envoi: '2026-10-04T18:00:00Z' }), '2026-10-04');
  assert.equal(jourPublication({}), null);
});
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journalVide = () => ({ evenements: [], n8n: { jours: {}, instances: {} } });

test('referenceChaine comprend les adresses, les @ et les identifiants', () => {
  assert.deepEqual(referenceChaine('https://www.youtube.com/@ExtraitPolitique'), { forHandle: '@ExtraitPolitique' });
  assert.deepEqual(referenceChaine('@extrait.politique'), { forHandle: '@extrait.politique' });
  assert.deepEqual(referenceChaine('https://youtube.com/channel/UCabcdefghij1234'), { id: 'UCabcdefghij1234' });
  assert.deepEqual(referenceChaine('UCabcdefghij1234'), { id: 'UCabcdefghij1234' });
  assert.equal(referenceChaine('nimporte quoi'), null);
});

function fauxYoutube() {
  return async (chemin, params) => {
    if (chemin === 'channels') {
      assert.equal(params.forHandle, '@Extrait');
      return { items: [{ id: 'UCextrait', snippet: { title: "L'extrait politique" }, statistics: { subscriberCount: '1200', viewCount: '90000', videoCount: '310' }, contentDetails: { relatedPlaylists: { uploads: 'UUextrait' } } }] };
    }
    if (chemin === 'playlistItems') {
      assert.equal(params.playlistId, 'UUextrait');
      // v2 : envoyée le 1er, programmée et sortie le 3 (videoPublishedAt).
      return { items: [{ contentDetails: { videoId: 'v1', videoPublishedAt: '2026-10-04T18:00:00Z' } }, { contentDetails: { videoId: 'v2', videoPublishedAt: '2026-10-03T18:00:00Z' } }] };
    }
    if (chemin === 'videos') {
      assert.equal(params.id, 'v1,v2');
      return {
        items: [
          { id: 'v1', snippet: { title: 'Zapping du 4 octobre', publishedAt: '2026-10-04T18:00:00Z' }, statistics: { viewCount: '2300', likeCount: '150' }, contentDetails: { duration: 'PT12M30S' } },
          { id: 'v2', snippet: { title: 'Zapping du 3 octobre', publishedAt: '2026-10-01T09:00:00Z' }, statistics: { viewCount: '1800', likeCount: '90' }, contentDetails: { duration: 'PT58S' } },
        ],
      };
    }
    throw new Error(`appel inattendu : ${chemin}`);
  };
}

test('synchroniserYoutube lit la chaîne, ses vidéos et garde un relevé par jour', async () => {
  const b = { sources: {}, objectifs: {} };
  const chaines = { 'extrait-politique': ['https://www.youtube.com/@Extrait'] };
  const r = await synchroniserYoutube(b, { appel: fauxYoutube(), chaines, maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.deepEqual(r, { chaines: 1 });
  const yt = b.sources.youtube;
  assert.equal(yt.chaines[0].abonnes, 1200);
  assert.equal(yt.chaines[0].videos.length, 2);
  assert.deepEqual(yt.chaines[0].videos.map((v) => [v.secondes, v.format]), [[750, 'longue'], [58, 'short']]);
  assert.deepEqual(yt.historique['2026-10-05'], { UCextrait: { abonnes: 1200, vues: 90000 } });
  // Sans chaîne configurée ou sans clé : on ne fait rien.
  assert.deepEqual(await synchroniserYoutube({ sources: {} }, { chaines: {} }), { ignore: true });
  assert.deepEqual(await synchroniserYoutube({ sources: {} }, { chaines: { x: ['@a'] } }), { ignore: true });
});

test('gains sur la période et carte L’extrait politique', async () => {
  const b = { sources: {}, objectifs: {} };
  await synchroniserYoutube(b, { appel: fauxYoutube(), chaines: { 'extrait-politique': ['@Extrait'] }, maintenant: new Date('2026-10-05T12:00:00Z') });
  const yt = b.sources.youtube;
  yt.historique['2026-09-28'] = { UCextrait: { abonnes: 1150, vues: 84000 } };
  const periode = joursJusqua('2026-10-05', 7);
  assert.deepEqual(gainsPeriode(yt, yt.chaines, periode), { vues: 6000, abonnes: 50 });
  assert.equal(gainsPeriode({ historique: {} }, yt.chaines, periode), null);

  const c = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'extrait-politique');
  assert.equal(c.principal.total, 2); // v1 + v2 publiées dans la semaine
  assert.equal(c.chiffres[0].valeur, '6 000'.replace(' ', ' '));
  assert.match(c.chiffres[1].detail, /\+50 sur la période/);
  assert.match(c.manque[0], /revenus YouTube/);

  const html = pageProjet(configJournal, 'extrait-politique', { business: b, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-05', onglet: 'mails' });
  assert.match(html, /Chaînes YouTube/);
  // Shorts et vidéos longues séparés d'après la durée (demande de louis du 11/10).
  assert.match(html, /Vidéos longues/);
  assert.match(html, /<h3>Shorts/);
  assert.match(html, /12 min 30/);
  assert.match(html, /1 200 abonnés/);
  assert.match(html, /Zapping du 4 octobre/);
  assert.match(html, /youtube\.com\/watch\?v=v1/);
});

test('revenus YouTube : lecture par chaîne, erreurs notées, « indisponible » jamais 0', async () => {
  const b = { sources: {}, objectifs: {} };
  await synchroniserYoutube(b, { appel: fauxYoutube(), chaines: { 'extrait-politique': ['@Extrait'] }, maintenant: new Date('2026-10-05T12:00:00Z') });
  // Sans connexion OAuth : on ne fait rien, la carte dit que la connexion reste à faire.
  assert.deepEqual(await synchroniserRevenus(b, {}), { ignore: true });
  let carte = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'extrait-politique');
  assert.match(carte.manque[0], /revenus YouTube \(connexion à faire/);

  // Connexion faite : les lignes renvoyées s'additionnent sur la période.
  const r = await synchroniserRevenus(b, {
    appel: async (params) => {
      assert.equal(params.ids, 'channel==UCextrait');
      assert.equal(params.metrics, 'estimatedRevenue');
      return { rows: [['2026-10-03', 1.25], ['2026-10-04', 2.5]] };
    },
    maintenant: new Date('2026-10-05T12:00:00Z'),
  });
  assert.deepEqual(r, { chaines: 1, erreurs: 0 });
  const periode = joursJusqua('2026-10-05', 7);
  assert.deepEqual(revenusPeriode(b.sources.youtube, b.sources.youtube.chaines, periode).total, 3.75);
  carte = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'extrait-politique');
  const rev = carte.chiffres.find((x) => /Revenus/.test(x.titre));
  assert.equal(rev.valeur, '3,75 €');
  assert.deepEqual(carte.manque, []);

  // YouTube refuse (chaîne pas monétisée, mauvais compte…) : erreur notée, « indisponible ».
  await synchroniserRevenus(b, { appel: async () => { throw new Error('YouTube Analytics répond 403 (Forbidden)'); }, maintenant: new Date('2026-10-05T12:00:00Z') });
  carte = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'extrait-politique');
  const indispo = carte.chiffres.find((x) => /Revenus/.test(x.titre));
  assert.equal(indispo.valeur, 'indisponible');
  assert.match(indispo.detail, /YouTube refuse pour l’instant : YouTube Analytics répond 403/);
  // Aucune ligne renvoyée : indisponible aussi, pas un faux 0.
  await synchroniserRevenus(b, { appel: async () => ({ rows: [] }), maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.equal(revenusPeriode(b.sources.youtube, b.sources.youtube.chaines, periode), null);
});

test('connexion OAuth : adresse Google correcte et échange du code', async () => {
  const url = new URL(urlAutorisation({ clientId: 'id-client', retour: 'https://cerveau.exemple/oauth/youtube/retour' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'id-client');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://cerveau.exemple/oauth/youtube/retour');
  assert.match(url.searchParams.get('scope'), /yt-analytics-monetary\.readonly/);
  assert.equal(url.searchParams.get('access_type'), 'offline');

  const { refresh } = await echangerCode({
    code: 'abc',
    clientId: 'id-client',
    clientSecret: 'secret',
    retour: 'https://cerveau.exemple/oauth/youtube/retour',
    appelJeton: async (champs) => {
      assert.equal(champs.code, 'abc');
      assert.equal(champs.grant_type, 'authorization_code');
      return { refresh_token: 'jeton-durable', access_token: 'jeton-court' };
    },
  });
  assert.equal(refresh, 'jeton-durable');
});

const FLUX = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Petites Histoires Vraies</title>
 <entry>
  <yt:videoId>court1</yt:videoId>
  <title>L&#39;homme qui &amp; le chien</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/court1"/>
  <published>2026-10-21T10:30:00+00:00</published>
  <media:group><media:community><media:statistics views="1942"/></media:community></media:group>
 </entry>
 <entry>
  <yt:videoId>long1</yt:videoId>
  <title>Épisode 12</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=long1"/>
  <published>2026-10-20T16:00:00+00:00</published>
  <media:group><media:community><media:statistics views="31"/></media:community></media:group>
 </entry>
</feed>`;

test('lireFlux : vidéos, jour de sortie (Paris), vues et format du flux RSS', () => {
  const v = lireFlux(FLUX);
  assert.deepEqual(v, [
    { id: 'court1', titre: "L'homme qui & le chien", jour: '2026-10-21', vues: 1942, format: 'short' },
    { id: 'long1', titre: 'Épisode 12', jour: '2026-10-20', vues: 31, format: 'longue' },
  ]);
  assert.deepEqual(lireFlux('pas du xml'), []);
});

test('synchroniserFluxYoutube : les vidéos publiées restent justes quand l’API ne répond plus', async () => {
  // L'API a lu la chaîne une dernière fois le 12/10 : ses vidéos s'arrêtent là.
  const b = { sources: { youtube: { chaines: [{ projet: 'histoires-vraies', id: 'UCoTR63ZFhLWw11ZMUYGTR3w', abonnes: 26, vues: 4000, nbVideos: 30, videos: [{ id: 'ancien', jour: '2026-10-12', vues: 10 }, { id: 'long1', jour: '2026-10-20', vues: 5 }] }], historique: {} } }, objectifs: {} };
  const lues = [];
  const lire = async (url) => {
    lues.push(url);
    if (url.includes('@Impacteur')) return '<meta itemprop="identifier"><script>{"externalId":"UCimpacteurAfrique012345"}</script>';
    if (url.includes('UCimpacteurAfrique')) return '<feed></feed>';
    return FLUX;
  };
  const r = await synchroniserFluxYoutube(b, { lire, chaines: { 'histoires-vraies': ['UCoTR63ZFhLWw11ZMUYGTR3w'], impacteur: ['https://www.youtube.com/@ImpacteurAfrique'] }, maintenant: new Date('2026-10-21T20:00:00Z') });
  assert.deepEqual(r, { chaines: 2, erreurs: 0 });
  assert.ok(lues.includes('https://www.youtube.com/feeds/videos.xml?channel_id=UCoTR63ZFhLWw11ZMUYGTR3w'));
  assert.equal(b.sources.youtube.flux.ids['@ImpacteurAfrique'], 'UCimpacteurAfrique012345');
  // Une 2e lecture ne relit pas la page de la chaîne : l'identifiant est gardé.
  lues.length = 0;
  await synchroniserFluxYoutube(b, { lire, chaines: { impacteur: ['@ImpacteurAfrique'] }, maintenant: new Date('2026-10-21T21:00:00Z') });
  assert.ok(!lues.some((u) => u.endsWith('/@ImpacteurAfrique')));

  const [phv] = chainesYoutube(b, 'histoires-vraies');
  assert.deepEqual(phv.videos.map((v) => v.id), ['court1', 'long1', 'ancien']);
  assert.equal(phv.videos.find((v) => v.id === 'long1').vues, 31);
  assert.equal(phv.abonnes, 26);

  const h = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-21' }).cartes.find((c) => c.id === 'histoires-vraies');
  // Les deux vidéos de la semaine (le 12/10 est hors des 7 jours).
  assert.equal(h.principal.total, 2);
  assert.notEqual(h.couleur, 'rouge');
});

test('chainesYoutube : une chaîne connue seulement par le flux a des abonnés « indisponible », jamais 0', () => {
  const b = { sources: { youtube: { chaines: [], historique: {}, flux: { chaines: { UCoTR63ZFhLWw11ZMUYGTR3w: { projet: 'histoires-vraies', titre: 'PHV', videos: lireFlux(FLUX) } } } } }, objectifs: {} };
  const [c] = chainesYoutube(b, 'histoires-vraies');
  assert.equal(c.abonnes, null);
  assert.equal(chainesYoutube(b, 'impacteur').length, 0);
  const h = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-21' }).cartes.find((x) => x.id === 'histoires-vraies');
  assert.equal(h.principal.total, 2);
  assert.equal(h.chiffres.find((x) => x.titre === 'Abonnés YouTube').valeur, 'indisponible');
});

test('synchroniserFluxYoutube : erreur claire si aucune chaîne ne se lit', async () => {
  const b = { sources: {}, objectifs: {} };
  await assert.rejects(synchroniserFluxYoutube(b, { lire: async () => { throw new Error('YouTube répond 404'); }, chaines: { 'histoires-vraies': ['UCoTR63ZFhLWw11ZMUYGTR3w'] } }), /UCoTR63ZFhLWw11ZMUYGTR3w : YouTube répond 404/);
  assert.deepEqual(await synchroniserFluxYoutube(b, { chaines: {} }), { ignore: true });
});
