import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dossiersCode, listerCode, lireCode } from '../src/code-source.js';

async function dossierExemple() {
  const d = await mkdtemp(path.join(tmpdir(), 'code-'));
  await writeFile(path.join(d, 'agent.py'), 'print("bonjour")\n');
  await writeFile(path.join(d, 'Dockerfile'), 'FROM node:22\n');
  await writeFile(path.join(d, '.env'), 'SECRET=xxx\n');
  await writeFile(path.join(d, 'key.pem'), 'PRIVÉ');
  await writeFile(path.join(d, 'token.json'), '{"jeton":"xxx"}');
  await writeFile(path.join(d, 'nohup.out'), 'journal');
  await writeFile(path.join(d, 'base.db'), 'binaire');
  await mkdir(path.join(d, 'data'));
  await writeFile(path.join(d, 'data', 'prospects.json'), '[]');
  await mkdir(path.join(d, 'stories'));
  await writeFile(path.join(d, 'stories', '01-karim.json'), '{}');
  await mkdir(path.join(d, 'src'));
  await writeFile(path.join(d, 'src', 'config.ts'), 'export const x = 1;\n');
  await symlink(path.join(d, '.env'), path.join(d, 'src', 'notes.md'));
  return d;
}

test('listerCode ne donne que le code autorisé, sans secrets, données ni liens symboliques', async () => {
  const d = await dossierExemple();
  const fichiers = await listerCode(d);
  assert.deepEqual(fichiers.map((f) => f.chemin).sort(), ['Dockerfile', 'agent.py', 'src/config.ts']);
  assert.ok(fichiers.every((f) => typeof f.taille === 'number'));
});

test('lireCode lit un fichier autorisé et refuse tout le reste', async () => {
  const d = await dossierExemple();
  assert.match(await lireCode(d, 'src/config.ts'), /export const x/);
  assert.match(await lireCode(d, 'Dockerfile'), /FROM node/);
  const refus = ['.env', 'key.pem', 'key.pem/.', 'token.json', 'nohup.out', 'base.db',
    'data/prospects.json', 'stories/01-karim.json', '../dehors', '/etc/passwd', 'src', 'src/notes.md', 'agent.py\0.md'];
  for (const interdit of refus) {
    await assert.rejects(lireCode(d, interdit), (e) => e.code === 'REFUSE', `aurait dû refuser ${interdit}`);
  }
  await assert.rejects(lireCode(d, 'absent.py'), (e) => e.code === 'ENOENT');
});

test('dossiersCode pointe sur les montages du conteneur, surchargables en test', () => {
  assert.equal(dossiersCode({}).leviaro, '/sources/leviaro-code');
  assert.equal(dossiersCode({})['histoires-vraies'], '/sources/histoires-code');
  assert.equal(dossiersCode({ CODE_LEVIARO: '/tmp/x' }).leviaro, '/tmp/x');
});
