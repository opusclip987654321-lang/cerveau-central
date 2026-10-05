import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { depuisHeureParis, lireJob, verifierHistoires, lireHistoires, synchroniserHistoires } from '../src/histoires.js';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));

async function dossierExemple() {
  const d = await mkdtemp(path.join(tmpdir(), 'histoires-'));
  await writeFile(
    path.join(d, 'published.json'),
    JSON.stringify([
      { date: '2026-09-28T20:48:54', story_id: '17-sofiane-hybride', title: 'Sofiane & Rayan — Le book', ig_media_id: '1', fb_video_id: null },
      { date: '2026-09-29T07:14:38', story_id: '18-lina', title: 'Lina & Tarek — Ton contact, c’est lui', ig_media_id: '2', fb_video_id: '1831990074477395' },
    ]),
  );
  for (const j of ['18-lina-20260929-070024', '19-amira-20261001-070030', '19-amira-20261003-070001', '19-amira-20261005-070001']) await mkdir(path.join(d, 'jobs', j), { recursive: true });
  return d;
}

test('dates du programme : heure de Paris convertie', () => {
  assert.equal(depuisHeureParis('2026-10-05T07:00:01').toISOString(), '2026-10-05T05:00:01.000Z');
  assert.equal(depuisHeureParis('2026-12-05T07:00:00').toISOString(), '2026-12-05T06:00:00.000Z');
  assert.deepEqual({ ...lireJob('19-amira-20261003-070001'), date: undefined }, { nom: '19-amira-20261003-070001', histoire: '19-amira', date: undefined });
});

test('surveillance : ok tant que le programme lance des histoires, même refusées', async () => {
  const dossier = await dossierExemple();
  const r = await verifierHistoires({}, {}, { dossier, maintenant: new Date('2026-10-05T14:00:00Z') });
  assert.equal(r.etat, 'ok');
  assert.match(r.detail, /Lina & Tarek.*29 septembre/);
  assert.match(r.detail, /3 essai\(s\) non publié\(s\)/);
  const plusTard = await verifierHistoires({ joursMax: 4 }, {}, { dossier, maintenant: new Date('2026-10-12T14:00:00Z') });
  assert.equal(plusTard.etat, 'attention');
  assert.match(plusTard.detail, /aucune histoire depuis 7 jours/);
  assert.equal((await verifierHistoires({}, {}, { dossier: path.join(dossier, 'absent') })).etat, 'ignore');
});

test('journal : chaque vidéo publiée une seule fois, avec le lien Facebook', async () => {
  const j = { evenements: [], n8n: { jours: {}, dernierId: null } };
  const donnees = await lireHistoires(await dossierExemple());
  assert.equal(synchroniserHistoires(j, config, donnees), 2);
  assert.equal(synchroniserHistoires(j, config, donnees), 0);
  const lina = j.evenements.find((e) => e.titre.includes('Lina'));
  assert.equal(lina.projet, 'histoires-vraies');
  assert.equal(lina.lien, 'https://www.facebook.com/watch/?v=1831990074477395');
  assert.equal(lina.jour, '2026-09-29');
});
