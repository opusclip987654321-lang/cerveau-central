import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masquerSecrets, couper, lireEnvoi, enregistrerSortie, listerSorties, GARDEES } from '../src/sorties.js';

test('les jetons sont masqués avant d’être gardés', () => {
  const env = { RELEVE_JETON: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', N8N_API_KEY: 'n8n_api_123456789012', PORT: '8090', HOTE: '0.0.0.0' };
  const brut = [
    'jeton lu : a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    'cle n8n_api_123456789012 ok',
    'ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
    'TELEGRAM_TOKEN: "123456:ABCDEFGHIJ"',
    'Authorization: Bearer abcdefghijklmnopqrstuv',
    '{"apiKey": "zzzzzzzzzzzzzz", "nom": "Casanova"}',
    'https://bot1234567:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawabcdef/getMe',
    'postgres://nour:motdepasse123@db:5432/nour',
    'ghp_abcdefghijklmnopqrstuvwxyz0123',
    'commit 4f9a2c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39 fusionné, port 8090',
  ].join('\n');
  const t = masquerSecrets(brut, env);
  for (const secret of ['a1b2c3d4e5f6', 'n8n_api_1234', 'sk-ant-api03', 'ABCDEFGHIJ', 'abcdefghijklmnopqrstuv', 'zzzzzzzzzzzzzz', 'AAHdqTcv', 'motdepasse123', 'ghp_abcdef']) {
    assert.ok(!t.includes(secret), `${secret} visible dans :\n${t}`);
  }
  // Ce qui n'est pas secret reste lisible : un nom, un commit, le port.
  assert.match(t, /Casanova/);
  assert.match(t, /4f9a2c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39/);
  assert.match(t, /port 8090/);
});

test('une sortie trop longue garde le début et la fin', () => {
  const t = couper(`DEBUT${'x'.repeat(1000)}FIN`, 100);
  assert.ok(t.startsWith('DEBUT'));
  assert.ok(t.endsWith('FIN'));
  assert.match(t, /caractères coupés/);
});

test('lire l’envoi de scripts/envoyer.sh, l’enregistrer, le relire', () => {
  const corps = 'script: nour-meet-etat.py\ncommande: python3 scripts/nour-meet-etat.py\ncode: 0\ndebut: 2026-10-20T21:00:00Z\nfin: 2026-10-20T21:00:05Z\nserveur: vps-nour\n\nMails envoyés : 595\n\nRéponses : 3\n';
  const envoi = lireEnvoi(corps);
  assert.equal(envoi.script, 'nour-meet-etat.py');
  assert.equal(envoi.sortie, 'Mails envoyés : 595\n\nRéponses : 3\n');

  const d = { sorties: [] };
  const maintenant = new Date('2026-10-20T21:00:06Z');
  const { sortie } = enregistrerSortie(d, envoi, { maintenant });
  assert.equal(sortie.code, 0);
  assert.equal(sortie.ok, true);
  assert.equal(sortie.serveur, 'vps-nour');
  assert.equal(sortie.debut, '2026-10-20T21:00:00.000Z');

  const rate = enregistrerSortie(d, lireEnvoi('commande: docker ps\ncode: 1\n\nerreur'), { maintenant: new Date('2026-10-20T22:00:00Z') }).sortie;
  assert.equal(rate.script, 'docker');
  assert.equal(rate.ok, false);
  assert.equal(enregistrerSortie(d, lireEnvoi('code: 0\n\nrien')).erreur, 'Nom du script manquant.');

  assert.deepEqual(listerSorties(d).map((s) => s.script), ['docker', 'nour-meet-etat.py']);
  assert.deepEqual(listerSorties(d, { script: 'NOUR' }).map((s) => s.id), [sortie.id]);
  assert.deepEqual(listerSorties(d, { depuis: '2026-10-20T21:30:00Z' }).map((s) => s.id), [rate.id]);
  assert.equal(listerSorties(d, { n: '1' }).length, 1);
  assert.deepEqual(listerSorties(d, { id: sortie.id }).map((s) => s.id), [sortie.id]);

  for (let i = 0; i < GARDEES + 5; i++) enregistrerSortie(d, { script: `s${i}`, code: '0', sortie: '' });
  assert.equal(d.sorties.length, GARDEES);
});
