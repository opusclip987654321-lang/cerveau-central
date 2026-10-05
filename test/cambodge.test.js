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
  // Accusés automatiques : repérés à l'expéditeur no-reply ou au texte type.
  { id: 'm3', From: 'LinkedIn <jobs-noreply@linkedin.com>', To: 'gougamwalid@gmail.com', Subject: 'Votre candidature a été envoyée à Angkor Resort', date: '2026-10-02T08:00:00Z', snippet: 'Votre candidature a été transmise.' },
  { id: 'm4', From: 'Angkor Resort <recrutement@angkor-resort.kh>', To: 'gougamwalid@gmail.com', Subject: 'Accusé de réception de votre candidature', date: '2026-10-05T10:00:00Z', snippet: 'Nous avons bien reçu votre candidature.' },
];

test('synchroniserCambodge trie candidatures et réponses', async () => {
  const b = { sources: {} };
  const r = await synchroniserCambodge(b, { appel: async () => fauxMails(), maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.deepEqual(r, { mails: 4 });
  const cb = b.sources.cambodge;
  assert.equal(cb.mails.length, 4);
  assert.equal(cb.mails[0].jour, '2026-10-05'); // la plus récente d'abord
  assert.equal(cb.mails[0].automatique, true); // accusé repéré au texte
  const vraie = cb.mails.find((m) => m.jour === '2026-10-04');
  assert.equal(vraie.deMoi, false);
  assert.equal(vraie.automatique, false); // « Re: Candidature… » d'un humain reste une réponse
  const envoyee = cb.mails.find((m) => m.deMoi);
  assert.equal(envoyee.objet, 'Candidature réceptionniste');
  assert.equal(cb.mails.find((m) => m.jour === '2026-10-02').automatique, true); // no-reply
  // Sans adresse ni jeton : on ne fait rien.
  assert.deepEqual(await synchroniserCambodge({ sources: {} }, {}), { ignore: true });
});

test('carte et page Cambodge montrent candidatures et réponses', async () => {
  const b = { sources: {}, objectifs: {} };
  await synchroniserCambodge(b, { appel: async () => fauxMails(), maintenant: new Date('2026-10-05T12:00:00Z') });

  const c = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'cambodge');
  assert.equal(c.principal.total, 3); // 1 mail de louis + 2 accusés automatiques
  assert.equal(c.chiffres[0].titre, 'Réponses reçues');
  assert.equal(c.chiffres[0].valeur, 1); // seule la vraie réponse compte
  assert.equal(c.secondaire.titre, 'Réponses');
  assert.ok(!c.manque.length);

  const html = pageProjet(configJournal, 'cambodge', { business: b, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-05' });
  assert.match(html, /Vraies réponses reçues/);
  assert.match(html, /Candidatures envoyées/);
  assert.match(html, /confirmation automatique/);
  assert.match(html, /hotel-angkor\.kh/);
  assert.match(html, /entretien mardi/);
  assert.match(html, /<details class="texte">/); // la longue réponse se replie

  // Avant le branchement : la page explique quoi faire, la carte reste « pas branché ».
  const vide = pageProjet(configJournal, 'cambodge', { business: { sources: {}, objectifs: {} }, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-05' });
  assert.match(vide, /pas encore lue/);
  const c2 = tableauDeBord({ business: { sources: {}, objectifs: {} }, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'cambodge');
  assert.match(c2.manque[0], /candidatures/);
});
