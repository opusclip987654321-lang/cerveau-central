import test from 'node:test';
import assert from 'node:assert/strict';
import { pageActions } from '../src/page-actions.js';
import { pageAction } from '../src/page-action.js';
import { synchroniserActions, ouvrirAction, changerStatutAction, enregistrerEchange, dossierPourClaude, cleProbleme, STATUTS_ACTION } from '../src/actions.js';

const config = { projets: [{ id: 'nour-meet', nom: 'Nūr Meet' }] };
const configJournal = { projets: [{ id: 'nour-meet', nom: 'Nūr Meet' }, { id: 'leviaro', nom: 'Leviaro' }] };
const vide = () => ({ actions: [] });

test('synchroniserActions : une panne ou un « à décider » = une fiche, rattachée, jamais dupliquée', () => {
  const d = vide();
  const etat = { verifications: { a: { projet: 'nour-meet', etat: 'panne', nom: 'Site', detail: 'répond 502', sens: 'Le site ne répond plus', depuis: '2026-10-05T10:00:00Z' } } };
  const cartes = [{ id: 'leviaro', aDecider: ['19 réponse(s) de prospect pas encore traitée(s).'] }];
  synchroniserActions(d, { etat, cartes, config, configJournal });
  // 2 signaux + les 3 fiches « revenus à brancher » ouvertes une seule fois.
  assert.equal(d.actions.length, 5);
  assert.ok(d.actions.some((a) => a.cle === 'revenu:youtube'));
  // Le même signal re-synchronisé ne crée pas de nouvelle fiche, même si les nombres bougent.
  synchroniserActions(d, { etat, cartes: [{ id: 'leviaro', aDecider: ['23 réponse(s) de prospect pas encore traitée(s).'] }], config, configJournal });
  assert.equal(d.actions.length, 5);
  const fiche = d.actions.find((a) => a.cle.startsWith('decider:'));
  assert.match(fiche.constat, /23 réponse/); // le constat suit le dernier état
  assert.equal(fiche.historique.filter((h) => h.type === 'occurrence').length, 1);
  // Le signal disparaît : la fiche passe « Résultat à vérifier », jamais « resolu » toute seule.
  synchroniserActions(d, { etat: { verifications: {} }, cartes: [], config, configJournal });
  assert.ok(d.actions.filter((a) => /^(panne:|decider:)/.test(a.cle)).every((a) => a.statut === 'resultat_a_verifier'));
  // Une fiche revenus résolue par louis ne revient pas à la synchronisation suivante.
  d.actions.find((a) => a.cle === 'revenu:youtube').statut = 'resolu';
  synchroniserActions(d, { etat: { verifications: {} }, cartes: [], config, configJournal });
  assert.equal(d.actions.filter((a) => a.cle === 'revenu:youtube').length, 1);
});

test('changerStatutAction et enregistrerEchange : seuls les événements réels bougent le statut', () => {
  const d = vide();
  const a = ouvrirAction(d, { cle: 'decider:x', projet: 'Leviaro', titre: 'File qui grossit', constat: 'La file grossit.' });
  changerStatutAction(d, a.id, 'question_posee');
  // louis répond à la question : la fiche passe « Réponse du cerveau attendue ».
  enregistrerEchange(d, a.id, 'Oui, augmente le rythme.', { texte: 'Bien noté, voilà ce que je propose…', cout: 0.01 });
  assert.equal(a.statut, 'reponse_a_analyser');
  assert.equal(a.discussion.length, 2);
  assert.ok(a.historique.some((h) => h.type === 'reponse'));
  // resolu se change comme un autre statut, mais uniquement via la route (donc louis).
  assert.equal(changerStatutAction(d, a.id, 'resolu').action.statut, 'resolu');
  assert.ok(changerStatutAction(d, 'inconnu', 'resolu').erreur);
  assert.equal(cleProbleme('decider:leviaro', '19 réponses, 3 %'), cleProbleme('decider:leviaro', '40 réponses, 12 %'));
});

test('dossierPourClaude : faits datés, échanges, sans secret', () => {
  const d = vide();
  const a = ouvrirAction(d, { cle: 'panne:a', projet: 'Nūr Meet', titre: 'Nūr Meet : Site', constat: 'Le site ne répond plus', source: { type: 'surveillance', verification: 'a' } });
  enregistrerEchange(d, a.id, 'Que faire ?', { texte: 'Vérifier le serveur.' });
  const md = dossierPourClaude(a);
  assert.match(md, /# Dossier de correction — Nūr Meet : Site/);
  assert.match(md, /## Problème constaté\nLe site ne répond plus/);
  assert.match(md, /## Faits observés/);
  assert.match(md, /\*\*louis\*\*.*Que faire \?/);
  assert.match(md, /les clés et secrets ne font jamais partie de ce dossier/i);
});

test('page Actions : fiches ouvertes devant, objectifs, questions et idées conservés', () => {
  const d = vide();
  ouvrirAction(d, { cle: 'panne:a', projet: 'Nūr Meet', titre: 'Nūr Meet : le site ne répond plus', constat: 'Le site ne répond plus' });
  const q = ouvrirAction(d, { cle: 'decider:y', projet: 'Leviaro', titre: '3 restaurateurs à relancer', constat: '3 restaurateurs à relancer' });
  changerStatutAction(d, q.id, 'question_posee');
  const html = pageActions({
    configJournal,
    actions: d.actions,
    cartes: [
      { id: 'nour-meet', nom: 'Nūr Meet', couleur: 'orange', aDecider: [], objectif: { valide: null, propose: 40 } },
      { id: 'leviaro', nom: 'Leviaro', couleur: 'gris', aDecider: [], objectif: { valide: null, propose: 1 } },
    ],
    idees: [{ id: 'x', projet: 'leviaro', texte: 'Relancer les <b>agences</b>', statut: 'proposee', cree: '2026-10-05T09:00:00Z' }],
    aRepondre: 3,
  });
  assert.match(html, /Problèmes ouverts, une fiche chacun/);
  assert.match(html, /Nūr Meet : le site ne répond plus/);
  assert.match(html, /href="\/action\?id=/);
  // La fiche qui attend louis (question posée) passe devant celle que le cerveau doit analyser.
  assert.ok(html.indexOf('3 restaurateurs à relancer') < html.indexOf('Nūr Meet : le site ne répond plus'));
  assert.match(html, /Nūr Meet : 40 par semaine \(proposé\)/);
  assert.doesNotMatch(html, /Leviaro : 1 par semaine/);
  assert.match(html, /3 question\(s\) attendent tes réponses/);
  assert.match(html, /Relancer les &lt;b&gt;agences&lt;\/b&gt;/);
  assert.match(html, /class="actif" data-s="[^"]*">Actions/);
  assert.doesNotMatch(html, />Discuter</); // l'onglet Discuter a disparu du menu
});

test('page Actions : vide quand rien n’attend', () => {
  const html = pageActions({ configJournal, actions: [], cartes: [], idees: [], aRepondre: 0 });
  assert.match(html, /Rien n’attend ta décision/);
});

test('fiche d’action : problème, discussion, décision, Préparer pour Claude', () => {
  const d = vide();
  const a = ouvrirAction(d, { cle: 'panne:a', projet: 'Nūr Meet', titre: 'Le site ne répond plus', constat: 'Le site répond 502 depuis 10 h.', consequence: 'Les restaurants ne peuvent plus s’inscrire.' });
  changerStatutAction(d, a.id, 'question_posee');
  const html = pageAction(a, { actif: true, depenseIa: 1.5, plafondIa: 10 });
  assert.match(html, /Le site ne répond plus/);
  assert.match(html, /Le site répond 502 depuis 10 h\./);
  assert.match(html, /Ce que ça change pour le projet/);
  assert.match(html, new RegExp(STATUTS_ACTION.question_posee.nom));
  assert.match(html, /Qui doit agir/);
  assert.match(html, /action="\/action\/discuter"/);
  assert.match(html, /Marquer résolu/);
  assert.match(html, /\/action\/dossier\?id=/);
  assert.match(html, /1.50 \$ sur 10 \$/);
  // Sans clé IA : pas de formulaire, un message honnête.
  assert.match(pageAction(a, { actif: false }), /clé Claude n’est pas branchée/);
});
