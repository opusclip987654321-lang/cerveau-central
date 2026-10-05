import test from 'node:test';
import assert from 'node:assert/strict';
import { pageActions } from '../src/page-actions.js';

const config = { projets: [{ id: 'nour-meet', nom: 'Nūr Meet' }] };
const configJournal = { projets: [{ id: 'nour-meet', nom: 'Nūr Meet' }, { id: 'leviaro', nom: 'Leviaro' }] };

test('page Actions : regroupe pannes, décisions, objectifs, questions et idées', () => {
  const html = pageActions({
    config,
    configJournal,
    etat: { verifications: { a: { projet: 'nour-meet', etat: 'panne', nom: 'Site', detail: 'répond 502', sens: 'Le site ne répond plus', depuis: '2026-10-05T10:00:00Z' } } },
    cartes: [
      { id: 'nour-meet', nom: 'Nūr Meet', couleur: 'orange', aDecider: ['3 restaurateurs à relancer'], objectif: { valide: null, propose: 40 } },
      { id: 'leviaro', nom: 'Leviaro', couleur: 'gris', aDecider: [], objectif: { valide: null, propose: 1 } },
    ],
    idees: [{ id: 'x', projet: 'leviaro', texte: 'Relancer les <b>agences</b>', statut: 'proposee', cree: '2026-10-05T09:00:00Z' }],
    aRepondre: 3,
  });
  assert.match(html, /En panne, à régler/);
  assert.match(html, /Nūr Meet : Le site ne répond plus/);
  assert.match(html, /3 restaurateurs à relancer/);
  assert.match(html, /Objectifs à valider/);
  assert.match(html, /Nūr Meet : 40 par semaine \(proposé\)/);
  assert.doesNotMatch(html, /Leviaro : 1 par semaine/); // gris : pas d'objectif à valider
  assert.match(html, /3 question\(s\) attendent tes réponses/);
  assert.match(html, /Relancer les &lt;b&gt;agences&lt;\/b&gt;/); // texte échappé
  assert.match(html, /class="actif" data-s="[^"]*">Actions/);
});

test('page Actions : vide quand rien n’attend', () => {
  const html = pageActions({ config, configJournal, etat: { verifications: {} }, cartes: [], idees: [], aRepondre: 0 });
  assert.match(html, /Rien n’attend ta décision/);
});
