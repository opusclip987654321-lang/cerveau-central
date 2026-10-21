import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheminBoites, synchroniserBoites, alerteBoites, htmlBoites, classerMail, BOITES } from '../src/boites.js';
import { pageAujourdhui } from '../src/page-aujourdhui.js';

test('cheminBoites dérive l’adresse secrète du jeton', () => {
  assert.match(cheminBoites('secret'), /^cerveau-boites-[0-9a-f]{32}$/);
  assert.notEqual(cheminBoites('secret'), cheminBoites('autre'));
});

const reponse = () => [
  ...BOITES.filter((b) => b.id !== 'walidvideos12').map((b) => ({ boite: b.id, lus: 1 })),
  { boite: 'walidvideos12', erreur: 'Credentials not found' },
  { boite: 'opusclip', id: 'a1', threadId: 't1', From: 'Google <no-reply@accounts.google.com>', Subject: 'Alerte de sécurité', snippet: 'Nouvelle connexion', internalDate: String(Date.parse('2026-10-21T08:00:00Z')), labelIds: ['INBOX'] },
  { boite: 'impacteurmedia', id: 'a2', threadId: 't2', From: 'Marie Dupont <marie@marque.fr>', Subject: 'Proposition de partenariat', snippet: 'Bonjour, nous aimerions…', internalDate: String(Date.parse('2026-10-21T09:00:00Z')), labelIds: ['INBOX'] },
  { boite: 'gougamwalid', id: 'a3', threadId: 't3', From: 'Paul <paul@ami.fr>', Subject: 'Salut', snippet: 'Ça va ?', internalDate: String(Date.parse('2026-10-20T09:00:00Z')), labelIds: ['INBOX', 'UNREAD'] },
  { boite: 'gougamwalid', id: 'a4', threadId: 't4', From: 'Boutique <news@boutique.fr>', Subject: 'Promo', snippet: '-50 %', labelIds: ['INBOX', 'UNREAD'] },
  { boite: 'impacteurfrexit', id: 'a5', threadId: 't5', From: 'Walid <impacteurafrique@gmail.com>', Subject: 'Facture', snippet: 'devis', labelIds: ['INBOX'] },
];

test('synchroniserBoites garde les urgents, puis les mails d’une personne non lus', async () => {
  const b = { sources: {} };
  const r = await synchroniserBoites(b, { appel: async () => reponse(), maintenant: new Date('2026-10-21T12:00:00Z') });
  assert.deepEqual(r, { mails: 3, enPanne: ['walidvideos12'] });
  const m = b.sources.boites.mails;
  assert.deepEqual(m.map((x) => x.id), ['a2', 'a1', 'a3']);
  assert.deepEqual(m.map((x) => x.niveau), ['urgent', 'urgent', 'a-traiter']);
  assert.equal(b.sources.boites.etat.walidvideos12.lue, false);
  assert.deepEqual(await synchroniserBoites({ sources: {} }, {}), { ignore: true });
  await assert.rejects(synchroniserBoites({ sources: {} }, { appel: async () => [] }), /aucune boîte lue/);
});

test('classerMail ignore les promotions et les envois de louis', () => {
  assert.equal(classerMail({ de: 'news@boutique.fr', objet: 'Votre commande', extrait: '', nonLu: true }), null);
  assert.equal(classerMail({ de: 'opusclip987654321@gmail.com', objet: 'devis', extrait: '', nonLu: true }), null);
  assert.equal(classerMail({ de: 'noreply@youtube.com', objet: 'Avertissement pour non-respect', extrait: '' }).niveau, 'urgent');
});

test('alerteBoites prévient une seule fois par mail urgent', async () => {
  const b = { sources: {} };
  await synchroniserBoites(b, { appel: async () => reponse() });
  const msg = alerteBoites(b);
  assert.match(msg, /2 mail\(s\) urgent/);
  assert.match(msg, /Marie Dupont/);
  assert.doesNotMatch(msg, /Paul/);
  assert.equal(alerteBoites(b), null);
});

test('la page Aujourd’hui montre les mails à traiter', async () => {
  const b = { sources: {} };
  await synchroniserBoites(b, { appel: async () => reponse() });
  const html = pageAujourdhui({ lignes: [], priorites: [], boites: htmlBoites(b.sources.boites), jour: '2026-10-21' });
  assert.match(html, /Mails à traiter/);
  assert.match(html, /Proposition de partenariat/);
  assert.match(html, /authuser=impacteurmedia@gmail\.com#all\/t2/);
  assert.match(html, /Pas lue\(s\) : walidvideos12/);
  assert.match(htmlBoites(undefined), /pas encore lues/);
});
