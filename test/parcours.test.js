import test from 'node:test';
import assert from 'node:assert/strict';
import { etapeBloquee, schemaParcours } from '../src/parcours.js';
import { pageJournal } from '../src/page-journal.js';

const config = {
  projets: [{ id: 'nour-meet', nom: 'Nūr Meet', motifs: ['nour'] }, { id: 'impacteur', nom: 'Impacteur', motifs: ['impacteur'] }],
  types: { mail: '✉️', note: '📝' },
};

test('parcours : l’étape bloquée est reconnue, jamais inventée', () => {
  assert.equal(etapeBloquee('nour-meet', 'NM3 Envoi des emails a planté'), 2);
  assert.equal(etapeBloquee('extrait-politique', 'Veille moments forts : 3 erreurs'), 0);
  assert.equal(etapeBloquee('nour-meet', 'certificat du site expiré'), null);
  assert.match(schemaParcours('nour-meet', { nom: 'Nūr Meet', etape: 2 }), /class="etape-p bloquee">Écrire et envoyer le mail/);
  assert.match(schemaParcours('nour-meet', { etape: null }), /Étape exacte à confirmer/);
  assert.equal(schemaParcours('inconnu', {}), '');
});

test('Activité : les erreurs d’abord, les réussites repliées, les jours vides sautés', () => {
  const journal = {
    evenements: [{ projet: 'nour-meet', jour: '2026-10-05', date: '2026-10-05T10:00:00Z', type: 'mail', titre: 'Relance envoyée' }],
    n8n: { jours: { '2026-10-05': { 'Nour envoi des emails': { ok: 4, erreur: 2 }, 'Nour recherche': { ok: 8, erreur: 0 } } } },
  };
  const etat = {
    verifications: { 'n8n/x': { projet: 'n8n', etat: 'panne', nom: 'n8n (automatisations)', detail: '2 exécution(s) en erreur : NM3 Envoi des emails', sens: 'L’envoi des mails de prospection a planté 2 fois.', depuis: '2026-10-05T09:00:00Z' } },
    historique: [
      { date: '2026-10-05T09:00:00Z', type: 'panne', projet: 'n8n', verification: 'n8n (automatisations)', detail: '2 exécution(s) en erreur : NM3 Envoi des emails', sens: 'L’envoi des mails de prospection a planté 2 fois.', pour: 'Nūr Meet' },
      { date: '2026-10-04T09:00:00Z', type: 'retabli', projet: 'n8n', verification: 'n8n (automatisations)', detail: 'ok', sens: 'Revenu à la normale.', pour: 'Nūr Meet' },
    ],
  };
  const html = pageJournal(config, journal, {
    vue: 'activite',
    jour: '2026-10-05',
    etat,
    actions: [{ id: 'abc', cle: 'panne:n8n/x', statut: 'a_analyser' }],
  });
  // Où ça bloque : la panne, sa fiche, le parcours avec l'étape en évidence.
  assert.match(html, /Où ça bloque en ce moment/);
  assert.match(html, /href="\/action\?id=abc">Ouvrir la fiche ›/);
  assert.match(html, /class="etape-p bloquee">Écrire et envoyer le mail/);
  // L'incident du jour est expliqué business ; le retour au vert n'est pas listé.
  assert.match(html, /class="incident">⛔ <b>Nūr Meet<\/b> · L’envoi des mails de prospection a planté 2 fois\./);
  assert.doesNotMatch(html, /Revenu à la normale/);
  // Erreur d'automatisation visible avec sa conséquence ; les réussites sont repliées.
  assert.match(html, /2 exécution\(s\) en erreur/);
  assert.match(html, /Si ça se répète : des prospects ne recevront pas leur mail\./);
  assert.match(html, /<summary>⚙️ 1 automatisation\(s\) ont tourné sans erreur<\/summary>/);
  // Les jours sans rien n'apparaissent pas (un seul bloc jour sur les 7).
  assert.equal(html.match(/<section class="jour">/g)?.length, 1);
  assert.doesNotMatch(html, /Rien d’enregistré ce jour-là/);
  // La note du journal est expliquée, avec son exemple, comme facultative.
  assert.match(html, /Facultatif, rien à remplir chaque jour/);
  // Le filtre 365 jours existe en Activité.
  assert.match(html, /jours=365/);
});

test('Activité : quand rien ne bloque, on le dit sans lister les contrôles verts', () => {
  const html = pageJournal(config, { evenements: [], n8n: { jours: {} } }, { vue: 'activite', jour: '2026-10-05', etat: { verifications: {}, historique: [] } });
  assert.match(html, /🟢 Rien ne bloque en ce moment/);
  assert.match(html, /Rien sur la période : pas d’incident, pas d’événement noté\./);
});
