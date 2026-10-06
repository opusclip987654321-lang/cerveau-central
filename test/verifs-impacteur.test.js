import test from 'node:test';
import assert from 'node:assert/strict';
import { choisirVerif, cleVerif, chargerVerifs } from '../src/verifs-impacteur.js';

test('choisirVerif : note le choix, recliquer écrase, refuse l’inconnu', () => {
  const d = { choix: {} };
  assert.deepEqual(choisirVerif(d, { auteur: ' A. Diop ', livre: 'Livre A', choix: 'valider' }, { maintenant: new Date('2026-10-06T08:00:00Z') }), { choix: 'valider' });
  // La clé ignore majuscules et espaces : la même fiche retombe toujours au même endroit.
  const cle = cleVerif('a. diop', 'LIVRE A ');
  assert.equal(d.choix[cle].choix, 'valider');
  assert.equal(d.choix[cle].quand, '2026-10-06T08:00:00.000Z');
  choisirVerif(d, { auteur: 'A. Diop', livre: 'Livre A', choix: 'rejeter' });
  assert.equal(d.choix[cle].choix, 'rejeter');
  assert.deepEqual(choisirVerif(d, { auteur: 'A. Diop', livre: 'Livre A', choix: 'tout_envoyer' }), { erreur: 'Choix inconnu.' });
  assert.ok(choisirVerif(d, { auteur: '  ', livre: 'X', choix: 'valider' }).erreur);
  assert.equal(Object.keys(d.choix).length, 1);
});

test('chargerVerifs : fichier absent = aucun choix', async () => {
  assert.deepEqual(await chargerVerifs('/nulle/part/verifs-impacteur.json'), { choix: {} });
});
