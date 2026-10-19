import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lireLoopHistoires, verifierLoopHistoires, htmlLoopHistoires } from '../src/loop-histoires.js';

const exemple = {
  maj: '2026-10-26T18:00:00Z',
  objectifs: { abonnes: { actuel: 120, cible: 1000 }, heures: { actuel: null, cible: 4000 }, revenusMois: { actuel: null, cible: 500 } },
  rythme: '2 longues et 4 Shorts par semaine',
  hypothese: 'H8 : sujets « pourquoi » du quotidien',
  chiffres: { shorts7j: 5200, longues7j: 40, shorts28j: null, longues28j: null, meilleurShort: 'Ta voix est bizarre ? (1 942 vues)' },
  decisions: [{ date: '2026-10-20', quoi: 'Cycle 1 : option B', pourquoi: 'Les Shorts font 1 000 fois plus de vues <que> les longues' }],
  question: null,
  prochaine: 'Mesurer la voix Kore',
};

async function fichier(contenu) {
  const d = await mkdtemp(path.join(tmpdir(), 'loop-hv-'));
  const f = path.join(d, 'petites-histoires.json');
  if (contenu !== undefined) await writeFile(f, contenu);
  return f;
}

test('lecture : absent = null, illisible = erreur', async () => {
  assert.equal(await lireLoopHistoires(await fichier()), null);
  assert.match((await lireLoopHistoires(await fichier('{oups'))).erreur, /illisible/);
  assert.equal((await lireLoopHistoires(await fichier(JSON.stringify(exemple)))).rythme, exemple.rythme);
});

test('surveillance : ignore avant le 1er compte rendu, attention après 9 jours sans', async () => {
  assert.equal((await verifierLoopHistoires({}, {}, { fichier: await fichier() })).etat, 'ignore');
  const f = await fichier(JSON.stringify(exemple));
  const ok = await verifierLoopHistoires({ joursMax: 9 }, {}, { fichier: f, maintenant: new Date('2026-10-28T10:00:00Z') });
  assert.equal(ok.etat, 'ok');
  assert.match(ok.detail, /Cycle 1/);
  const vieux = await verifierLoopHistoires({ joursMax: 9 }, {}, { fichier: f, maintenant: new Date('2026-11-06T10:00:00Z') });
  assert.equal(vieux.etat, 'attention');
  assert.match(vieux.detail, /10 jours/);
});

test('bloc de la page : objectifs, « indisponible » jamais 0, texte échappé, question en haut', () => {
  const h = htmlLoopHistoires(exemple, { maintenant: new Date('2026-10-27T10:00:00Z') });
  assert.match(h, /Abonnés YouTube<\/td><td><b>120<\/b>/);
  assert.match(h, /12 %/);
  assert.match(h, /Heures de visionnage \(12 mois\)<\/td><td><b>indisponible<\/b>/);
  assert.match(h, /&lt;que&gt;/);
  assert.doesNotMatch(h, /⚠️ ancien|La loop te demande/);
  const q = htmlLoopHistoires({ ...exemple, question: 'Arrêter les vidéos longues ?' }, { maintenant: new Date('2026-11-20T10:00:00Z') });
  assert.match(q, /te demande ton avis :<\/b> Arrêter les vidéos longues/);
  assert.match(q, /ancien/);
  assert.match(htmlLoopHistoires(null), /Pas encore de compte rendu/);
});
