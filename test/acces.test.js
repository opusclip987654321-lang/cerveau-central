import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { empreinte, verifierMotDePasse, creerAcces } from '../src/acces.js';

test('empreinte du mot de passe', () => {
  const ref = empreinte('un-long-mot-de-passe');
  assert.doesNotMatch(ref, /un-long-mot-de-passe/);
  assert.ok(verifierMotDePasse('un-long-mot-de-passe', ref));
  assert.ok(!verifierMotDePasse('autre', ref));
  assert.ok(!verifierMotDePasse('x', undefined));
});

test('sessions signées et blocage après 5 essais', () => {
  let t = 1_000_000;
  const acces = creerAcces({ empreinteMotDePasse: empreinte('bon-mot-de-passe'), secret: 's', maintenant: () => t });
  const jeton = acces.jeton();
  assert.ok(acces.jetonValide(jeton));
  assert.ok(!acces.jetonValide(jeton.replace(/.$/, 'x')));
  assert.ok(!acces.jetonValide(`${t + 9e12}.faux`));
  t += 31 * 86_400_000;
  assert.ok(!acces.jetonValide(jeton), 'expire après 30 jours');

  for (let i = 0; i < 4; i++) assert.equal(acces.essayer('1.2.3.4', 'faux'), 'faux');
  assert.equal(acces.essayer('1.2.3.4', 'faux'), 'bloque');
  assert.equal(acces.essayer('1.2.3.4', 'bon-mot-de-passe'), 'bloque', 'même le bon mot de passe attend');
  assert.equal(acces.essayer('5.6.7.8', 'bon-mot-de-passe'), 'ok', 'les autres adresses ne sont pas bloquées');
  t += 16 * 60_000;
  assert.equal(acces.essayer('1.2.3.4', 'bon-mot-de-passe'), 'ok');
});

test('serveur : tout est fermé sans connexion, ouvert après', async () => {
  const dossier = await mkdtemp(path.join(tmpdir(), 'cerveau-'));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(dossier, 'vide.json'), JSON.stringify({ projets: [], seuils: {} }));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const enfant = spawn(process.execPath, ['src/index.js'], {
    env: { ...process.env, PORT: String(port), HOTE: '127.0.0.1', FICHIER_ETAT: path.join(dossier, 'etat.json'), FICHIER_REPONSES: path.join(dossier, 'reponses.json'),
      CONFIG: path.join(dossier, 'vide.json'), MOT_DE_PASSE_EMPREINTE: empreinte('bon-mot-de-passe'), TELEGRAM_BOT_TOKEN: '', N8N_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(`${base}/sante`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.equal(await (await fetch(`${base}/sante`)).text(), 'ok', 'la santé reste publique');
    assert.match(await (await fetch(`${base}/`)).text(), /type="password"/);
    assert.equal((await fetch(`${base}/questions`, { method: 'POST', body: 'a=b' })).status, 401);
    assert.equal((await fetch(`${base}/api/reponses`)).status, 401);

    const faux = await fetch(`${base}/connexion`, { method: 'POST', body: 'motDePasse=nope', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(faux.status, 401);
    const bon = await fetch(`${base}/connexion`, { method: 'POST', body: 'motDePasse=bon-mot-de-passe', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(bon.status, 303);
    const cookie = bon.headers.get('set-cookie').split(';')[0];
    assert.match(bon.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const page = await fetch(`${base}/questions`, { headers: { cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Questions du jour/);
  } finally {
    enfant.kill();
    await rm(dossier, { recursive: true });
  }
});
