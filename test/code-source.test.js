import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dossiersCode, listerCode, lireCode } from '../src/code-source.js';

async function dossierExemple() {
  const d = await mkdtemp(path.join(tmpdir(), 'code-'));
  await writeFile(path.join(d, 'agent.py'), 'print("bonjour")\n');
  await writeFile(path.join(d, '.env'), 'SECRET=xxx\n');
  await writeFile(path.join(d, 'base.db'), 'binaire');
  await mkdir(path.join(d, 'data'));
  await writeFile(path.join(d, 'data', 'prospects.json'), '[]');
  await mkdir(path.join(d, 'src'));
  await writeFile(path.join(d, 'src', 'config.ts'), 'export const x = 1;\n');
  return d;
}

test('listerCode donne le code et exclut secrets, bases et données', async () => {
  const d = await dossierExemple();
  const fichiers = await listerCode(d);
  const chemins = fichiers.map((f) => f.chemin);
  assert.deepEqual(chemins, ['agent.py', 'src/config.ts']);
  assert.ok(fichiers.every((f) => typeof f.taille === 'number'));
});

test('lireCode lit un fichier et refuse ce qui sort du cadre', async () => {
  const d = await dossierExemple();
  assert.match(await lireCode(d, 'src/config.ts'), /export const x/);
  for (const interdit of ['.env', 'base.db', 'data/prospects.json', '../dehors', '/etc/passwd', 'src']) {
    await assert.rejects(lireCode(d, interdit), /hors du dossier|Pas un fichier/, `aurait dû refuser ${interdit}`);
  }
  await assert.rejects(lireCode(d, 'absent.py'), (e) => e.code === 'ENOENT');
});

test('dossiersCode pointe sur les montages du conteneur, surchargables en test', () => {
  assert.equal(dossiersCode({}).leviaro, '/sources/leviaro-code');
  assert.equal(dossiersCode({})['histoires-vraies'], '/sources/histoires-code');
  assert.equal(dossiersCode({ CODE_LEVIARO: '/tmp/x' }).leviaro, '/tmp/x');
});
