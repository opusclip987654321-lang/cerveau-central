import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { verifierSite } from '../src/checks/http.js';
import { verifierDisque, verifierMemoire, verifierCharge } from '../src/checks/serveur.js';
import { verifierN8n } from '../src/checks/n8n.js';

const seuils = { lenteurMs: 4000, disqueAttention: 85, disqueCritique: 95, memoireAttention: 90, chargeParCoeurAttention: 2 };
const rapide = { tentatives: 2, pauseMs: 10, delaiMs: 2000 };
let serveur, base, appels;

before(async () => {
  serveur = http.createServer((req, res) => {
    appels[req.url] = (appels[req.url] ?? 0) + 1;
    if (req.url === '/ok') return res.end('bonjour');
    if (req.url === '/sante') return res.end(JSON.stringify({ status: 'ok' }));
    if (req.url === '/degrade') return res.end(JSON.stringify({ status: 'degraded' }));
    if (req.url === '/redirige') { res.writeHead(301, { location: '/ok' }); return res.end(); }
    if (req.url === '/instable') { res.writeHead(appels[req.url] === 1 ? 502 : 200); return res.end(); }
    if (req.url === '/lent') return setTimeout(() => res.end('ok'), 300);
    if (req.url.startsWith('/api/v1/workflows')) return res.end(JSON.stringify({ data: [{ id: '7', name: 'Prospection restaurateurs', active: true }, { id: '8', name: 'Récap', active: false }] }));
    if (req.url.startsWith('/api/v1/executions')) {
      if (req.headers['x-n8n-api-key'] !== 'secret') { res.writeHead(401); return res.end(); }
      return res.end(JSON.stringify({ data: [
        { id: '1', workflowId: '7', startedAt: '2026-10-04T10:00:00Z' },
        { id: '2', workflowId: '7', startedAt: '2026-10-03T10:00:00Z' },
      ] }));
    }
    res.writeHead(500); res.end();
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${serveur.address().port}`;
});
after(() => serveur.close());

test('un site qui répond est OK', async () => {
  appels = {};
  const r = await verifierSite({ url: `${base}/ok` }, seuils, rapide);
  assert.equal(r.etat, 'ok');
});

test('une redirection compte comme OK', async () => {
  appels = {};
  assert.equal((await verifierSite({ url: `${base}/redirige` }, seuils, rapide)).etat, 'ok');
});

test('une erreur 500 est une panne, après une seconde tentative', async () => {
  appels = {};
  const r = await verifierSite({ url: `${base}/casse` }, seuils, rapide);
  assert.equal(r.etat, 'panne');
  assert.match(r.detail, /500/);
  assert.equal(appels['/casse'], 2);
});

test('un raté passager ne déclenche pas d’alerte', async () => {
  appels = {};
  assert.equal((await verifierSite({ url: `${base}/instable` }, seuils, rapide)).etat, 'ok');
});

test('le contenu JSON est contrôlé (base de données en panne)', async () => {
  appels = {};
  assert.equal((await verifierSite({ url: `${base}/sante`, json: { status: 'ok' } }, seuils, rapide)).etat, 'ok');
  const r = await verifierSite({ url: `${base}/degrade`, json: { status: 'ok' } }, seuils, rapide);
  assert.equal(r.etat, 'panne');
  assert.match(r.detail, /degraded/);
});

test('un site lent est à surveiller', async () => {
  appels = {};
  const r = await verifierSite({ url: `${base}/lent` }, { lenteurMs: 100 }, rapide);
  assert.equal(r.etat, 'attention');
});

test('un site injoignable est en panne', async () => {
  const r = await verifierSite({ url: 'http://127.0.0.1:1' }, seuils, rapide);
  assert.equal(r.etat, 'panne');
  assert.match(r.detail, /injoignable/);
});

test('disque, mémoire et charge', async () => {
  assert.ok(['ok', 'attention', 'panne'].includes((await verifierDisque({ chemin: '/' }, seuils)).etat));
  const meminfo = 'MemTotal:       1000000 kB\nMemAvailable:     50000 kB\n';
  assert.equal((await verifierMemoire({}, seuils, { meminfo })).etat, 'attention');
  assert.equal((await verifierMemoire({}, seuils, { meminfo: 'MemTotal: 1000000 kB\nMemAvailable: 600000 kB\n' })).etat, 'ok');
  assert.equal((await verifierCharge({}, seuils, { charge: 9, coeurs: 4 })).etat, 'attention');
  assert.equal((await verifierCharge({}, seuils, { charge: 1, coeurs: 4 })).etat, 'ok');
});

test('n8n : ignoré sans clé, liste les nouvelles erreurs avec leur nom', async () => {
  assert.equal((await verifierN8n({}, seuils, {})).etat, 'ignore');
  const r = await verifierN8n({}, seuils, { url: base, cle: 'secret', depuis: '2026-10-04T00:00:00Z' });
  assert.equal(r.etat, 'attention');
  assert.equal(r.erreurs.length, 1);
  assert.equal(r.erreurs[0].workflow, 'Prospection restaurateurs');
  const mauvaise = await verifierN8n({}, seuils, { url: base, cle: 'faux' });
  assert.equal(mauvaise.etat, 'panne');
});
