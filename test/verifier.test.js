import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { toutVerifier } from '../src/verifier.js';
import { changement } from '../src/etat.js';
import { pageEtat } from '../src/page.js';

test('changement : alerte seulement quand l’état change', () => {
  assert.equal(changement(undefined, { etat: 'ok' }), null);
  assert.equal(changement(undefined, { etat: 'panne' }), 'panne');
  assert.equal(changement({ etat: 'ok' }, { etat: 'panne' }), 'panne');
  assert.equal(changement({ etat: 'panne' }, { etat: 'panne' }), null);
  assert.equal(changement({ etat: 'panne' }, { etat: 'attention' }), null);
  assert.equal(changement({ etat: 'attention' }, { etat: 'panne' }), 'panne');
  assert.equal(changement({ etat: 'panne' }, { etat: 'ok' }), 'retabli');
  assert.equal(changement({ etat: 'ok' }, { etat: 'ignore' }), null);
  assert.equal(changement({ etat: 'ok' }, { etat: 'attention', evenement: true, erreurs: [{}] }), 'evenement');
});

test('scénario complet : panne, une seule alerte, puis rétablissement', async () => {
  let enPanne = false;
  const serveur = http.createServer((req, res) => { res.writeHead(enPanne ? 502 : 200); res.end(); });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const dossier = await mkdtemp(path.join(tmpdir(), 'cerveau-'));
  const config = {
    projets: [{ id: 'nour-meet', nom: 'Nūr Meet', verifications: [{ type: 'site', nom: 'Site', url: `http://127.0.0.1:${serveur.address().port}/` }] }],
    seuils: { lenteurMs: 4000 },
  };
  const envoyes = [];
  const lancer = () => toutVerifier({ config, fichierEtat: path.join(dossier, 'etat.json'), envoyer: async (m) => envoyes.push(m), options: { site: { pauseMs: 5 } } });

  try {
    await lancer();
    assert.equal(envoyes.length, 0, 'rien à signaler au démarrage si tout va bien');

    enPanne = true;
    await lancer();
    assert.equal(envoyes.length, 1);
    assert.match(envoyes[0], /🔴 <b>Nūr Meet<\/b> · Site\nEn panne : répond 502/);

    await lancer();
    assert.equal(envoyes.length, 1, 'pas de répétition tant que la panne dure');

    enPanne = false;
    const { etat } = await lancer();
    assert.equal(envoyes.length, 2);
    assert.match(envoyes[1], /🟢 .*\nRétabli après \d+ min/);
    assert.equal(etat.historique.length, 2);

    const html = pageEtat(config, etat);
    assert.match(html, /Tout tourne/);
    assert.match(html, /Derniers incidents/);
  } finally {
    serveur.close();
    await rm(dossier, { recursive: true });
  }
});
