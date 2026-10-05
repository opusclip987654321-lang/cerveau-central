import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { verifierMotDePasse } from '../src/acces.js';

const lancer = (entree) => spawnSync(process.execPath, ['src/mot-de-passe.js'], { input: entree, encoding: 'utf8' });

test('mot de passe lu sur l’entrée standard, seule l’empreinte sort', () => {
  const r = lancer('un-mot-de-passe-long\n');
  assert.equal(r.status, 0);
  const [, ref] = r.stdout.trim().match(/^MOT_DE_PASSE_EMPREINTE=(scrypt:.+)$/);
  assert.ok(verifierMotDePasse('un-mot-de-passe-long', ref));
  assert.doesNotMatch(r.stdout, /un-mot-de-passe-long/);
});

test('mot de passe trop court : rien sur la sortie', () => {
  const r = lancer('court');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
});
