import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cheminCambodge, synchroniserCambodge } from '../src/cambodge.js';
import { tableauDeBord } from '../src/business.js';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journalVide = () => ({ evenements: [], n8n: { jours: {}, instances: {} } });

test('cheminCambodge dérive l’adresse secrète du jeton', () => {
  const c = cheminCambodge('secret');
  assert.match(c, /^cerveau-cambodge-[0-9a-f]{32}$/);
  assert.equal(c, cheminCambodge('secret'));
  assert.notEqual(c, cheminCambodge('autre'));
});

const fauxMails = () => [
  { id: 'm1', From: 'Walid <gougamwalid@gmail.com>', To: 'rh@hotel-angkor.kh', Subject: 'Candidature réceptionniste', date: '2026-10-03T09:00:00Z', snippet: 'Bonjour, je vous adresse ma candidature…' },
  { id: 'm2', From: 'RH Angkor <rh@hotel-angkor.kh>', To: 'gougamwalid@gmail.com', Subject: 'Re: Candidature réceptionniste', internalDate: String(Date.parse('2026-10-04T15:00:00Z')), snippet: 'Merci, pouvez-vous passer un entretien mardi ? '.padEnd(120, 'Nous détaillons le poste. ') },
];

test('synchroniserCambodge trie candidatures et réponses', async () => {
  const b = { sources: {} };
  const r = await synchroniserCambodge(b, { appel: async () => fauxMails(), maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.deepEqual(r, { mails: 2 });
  const cb = b.sources.cambodge;
  assert.equal(cb.mails.length, 2);
  assert.equal(cb.mails[0].jour, '2026-10-04'); // la plus récente d'abord
  assert.equal(cb.mails[0].deMoi, false);
  assert.equal(cb.mails[1].jour, '2026-10-03');
  assert.equal(cb.mails[1].deMoi, true);
  assert.equal(cb.mails[1].objet, 'Candidature réceptionniste');
  // Sans adresse ni jeton : on ne fait rien.
  assert.deepEqual(await synchroniserCambodge({ sources: {} }, {}), { ignore: true });
});

test('carte et page Cambodge montrent candidatures et réponses', async () => {
  const b = { sources: {}, objectifs: {} };
  await synchroniserCambodge(b, { appel: async () => fauxMails(), maintenant: new Date('2026-10-05T12:00:00Z') });

  const c = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'cambodge');
  assert.equal(c.principal.total, 1); // 1 candidature sur la période
  assert.equal(c.chiffres[0].titre, 'Réponses reçues');
  assert.equal(c.chiffres[0].valeur, 1);
  assert.equal(c.secondaire.titre, 'Réponses');
  assert.ok(!c.manque.length);

  const html = pageProjet(configJournal, 'cambodge', { business: b, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-05' });
  assert.match(html, /Réponses reçues/);
  assert.match(html, /Candidatures envoyées/);
  assert.match(html, /hotel-angkor\.kh/);
  assert.match(html, /entretien mardi/);
  assert.match(html, /<details class="texte">/); // la longue réponse se replie

  // Avant le branchement : la page explique quoi faire, la carte reste « pas branché ».
  const vide = pageProjet(configJournal, 'cambodge', { business: { sources: {}, objectifs: {} }, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-05' });
  assert.match(vide, /pas encore lue/);
  const c2 = tableauDeBord({ business: { sources: {}, objectifs: {} }, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'cambodge');
  assert.match(c2.manque[0], /candidatures/);
});
