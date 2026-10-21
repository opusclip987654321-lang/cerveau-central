import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { synchroniserVisites, visitesDe, htmlVisites } from '../src/visites.js';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journalVide = () => ({ evenements: [], n8n: { jours: {}, instances: {} } });

// Un faux Umami : deux sites connus, un troisième absent.
const fauxUmami = () => async (chemin, params = {}) => {
  if (chemin === '/websites') return { data: [{ id: 'w1', name: 'Nūr Meet', domain: 'nourmeet.com' }, { id: 'w2', name: 'Leviaro', domain: 'leviaro.fr' }] };
  if (chemin.endsWith('/stats')) return { pageviews: { value: 320, prev: 250 }, visitors: { value: 140, prev: 160 }, visits: { value: 180, prev: 180 }, bounces: { value: 90, prev: 100 }, totaltime: { value: 18_000, prev: 12_000 } };
  if (chemin.endsWith('/pageviews')) return { pageviews: [{ x: '2026-10-10T00:00:00Z', y: 20 }, { x: '2026-10-11T00:00:00Z', y: 35 }], sessions: [{ x: '2026-10-10T00:00:00Z', y: 12 }, { x: '2026-10-11T00:00:00Z', y: 19 }] };
  if (chemin.endsWith('/metrics') && params.type === 'url') return [{ x: '/', y: 200 }, { x: '/restaurants', y: 80 }];
  if (chemin.endsWith('/metrics') && params.type === 'referrer') return [{ x: 'google.com', y: 90 }, { x: '', y: 60 }];
  throw new Error(`chemin inattendu ${chemin}`);
};

test('synchroniserVisites : sites retrouvés par domaine, 30 jours, site absent dit tel quel', async () => {
  const b = { sources: {}, objectifs: {} };
  const r = await synchroniserVisites(b, { appel: fauxUmami(), sites: { 'nour-meet': 'nourmeet.com', leviaro: 'leviaro.fr', vegebudget: 'vegebudget.fr' }, maintenant: new Date('2026-10-11T12:00:00Z') });
  assert.deepEqual(r, { sites: 2, absents: 1 });
  const v = visitesDe(b, 'nour-meet');
  assert.equal(v.visiteurs, 140);
  assert.equal(v.vues, 320);
  assert.equal(v.rebondPct, 50);
  assert.equal(v.secondesParVisite, 100);
  assert.deepEqual(v.parJour.map((j) => [j.jour, j.vues, j.visites]), [['2026-10-10', 20, 12], ['2026-10-11', 35, 19]]);
  assert.equal(v.provenance[1].source, 'accès direct');
  assert.deepEqual(visitesDe(b, 'vegebudget'), { absent: true, domaine: 'vegebudget.fr', maj: '2026-10-11T12:00:00.000Z' });
  assert.equal(visitesDe(b, 'cambodge'), null);
  // Sans accès ni sites : ignoré, rien d'inventé.
  assert.deepEqual(await synchroniserVisites({ sources: {} }, { sites: {} }), { ignore: true });
  assert.deepEqual(await synchroniserVisites({ sources: {} }, { url: 'https://stats.example', sites: { leviaro: 'leviaro.fr' } }), { ignore: true });

  const html = htmlVisites(v);
  assert.match(html, /Visites du site/);
  assert.match(html, /<b>140<em class="bas">▼ 20<\/em><\/b><span>visiteurs/);
  assert.match(html, /50 %/);
  assert.match(html, /1 min 40/);
  assert.match(html, /\/restaurants/);
  assert.match(htmlVisites(visitesDe(b, 'vegebudget')), /ne connaît pas encore vegebudget\.fr/);
  assert.equal(htmlVisites(null), '');
  // Sur la page projet, dans la vue d'ensemble.
  const page = pageProjet(configJournal, 'nour-meet', { business: b, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-11' });
  assert.match(page, /Visites du site/);
  assert.match(page, /google\.com/);
});

test('synchroniserVisites : Umami 3 (pages = « path ») et une liste refusée ne font pas perdre les chiffres', async () => {
  const base = fauxUmami();
  const umami3 = async (chemin, params = {}) => {
    if (chemin.endsWith('/metrics') && params.type === 'url') throw new Error('Umami répond 400 sur /metrics');
    if (chemin.endsWith('/metrics') && params.type === 'path') return [{ x: '/', y: 7 }];
    return base(chemin, params);
  };
  const b = { sources: {}, objectifs: {} };
  await synchroniserVisites(b, { appel: umami3, sites: { 'nour-meet': 'nourmeet.com' }, maintenant: new Date('2026-10-11T12:00:00Z') });
  assert.deepEqual(visitesDe(b, 'nour-meet').pages, [{ page: '/', n: 7 }]);

  const refus = async (chemin, params = {}) => {
    if (chemin.endsWith('/metrics')) throw new Error('Umami répond 400 sur /metrics');
    return base(chemin, params);
  };
  const b2 = { sources: {}, objectifs: {} };
  await synchroniserVisites(b2, { appel: refus, sites: { 'nour-meet': 'nourmeet.com' }, maintenant: new Date('2026-10-11T12:00:00Z') });
  const v = visitesDe(b2, 'nour-meet');
  assert.equal(v.visiteurs, 140);
  assert.deepEqual(v.pages, []);
  assert.deepEqual(v.parJour.map((j) => j.visites), [12, 19]);
});
