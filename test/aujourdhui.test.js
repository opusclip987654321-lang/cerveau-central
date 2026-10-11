import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { lignesProjets, priorites, changementsDepuisHier, fraicheur, CHIFFRES } from '../src/aujourdhui.js';
import { pageAujourdhui } from '../src/page-aujourdhui.js';
import { tableauDeBord } from '../src/business.js';
import { gabarit, definirCompteurActions } from '../src/page.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journal = () => ({ evenements: [{ id: 'e1', date: '2026-10-09T10:00:00Z', jour: '2026-10-09', projet: 'cambodge', type: 'mail', titre: 'Candidature envoyée à Phnom Penh', lien: null }], n8n: { jours: {}, instances: {} } });
const jour = '2026-10-10';

// Une prospection Nūr Meet : 3 mails aujourd'hui, 1 hier, 2 ouverts aujourd'hui, 1 réponse hier.
const business = () => ({
  objectifs: { 'nour-meet': { valeur: 10, valide: '2026-10-01T00:00:00Z' } },
  sources: {
    prospection: {
      maj: '2026-10-10T08:00:00Z',
      prospects: [{ statut: 'contacte', email: true, decouvert: '2026-10-01', reponse: '2026-10-09' }, { statut: 'sans_email', email: false, decouvert: '2026-10-02' }],
      envois: [
        { statut: 'envoye', jour: '2026-10-10' }, { statut: 'envoye', jour: '2026-10-10' }, { statut: 'envoye', jour: '2026-10-10' },
        { statut: 'envoye', jour: '2026-10-09' },
      ],
      ouvertures: ['2026-10-10', '2026-10-10'],
      reponses: [],
    },
  },
});

test('lignesProjets : trois chiffres par projet, du jour avec flèche, sinon 7 jours, sinon indisponible', () => {
  const lignes = lignesProjets({ business: business(), journal: journal(), configJournal, jour });
  const nm = lignes.find((l) => l.id === 'nour-meet');
  assert.deepEqual(nm.chiffres.map((c) => c.nom), ['Mails envoyés', 'Mails ouverts', 'Réponses']);
  assert.deepEqual(nm.chiffres[0], { nom: 'Mails envoyés', valeur: 3, periode: 'aujourd’hui', fleche: 2 });
  assert.equal(nm.chiffres[1].valeur, 2);
  assert.equal(nm.chiffres[1].periode, 'aujourd’hui');
  assert.deepEqual([nm.chiffres[2].valeur, nm.chiffres[2].periode], [1, '7 jours'], 'rien aujourd’hui : on montre les 7 jours');
  assert.equal(nm.objectif.valeur, 10);
  assert.equal(nm.phraseIa, false);
  assert.match(nm.phrase, /./);
  // Leviaro n'est pas branché : chiffres indisponibles, jamais 0.
  const lv = lignes.find((l) => l.id === 'leviaro');
  assert.equal(lv.couleur, 'gris');
  assert.ok(lv.chiffres.every((c) => c.valeur === null));
  assert.match(lv.phrase, /Pas encore branché/);
  // La phrase IA, quand l'analyse du matin existe, remplace la phrase par défaut.
  const avecIa = lignesProjets({ business: business(), journal: journal(), configJournal, jour, analyses: { 'nour-meet': { phrase: 'Trois mails, zéro réponse : le message accroche-t-il ?' } } });
  assert.equal(avecIa.find((l) => l.id === 'nour-meet').phraseIa, true);
  assert.ok(Object.keys(CHIFFRES).every((id) => configJournal.projets.some((p) => p.id === id)), 'chaque projet listé existe');
});

test('priorites : panne d’abord, puis projet à l’arrêt, puis fiche qui attend louis ; un projet par priorité ; 3 au plus', () => {
  const config = { projets: [{ id: 'nour-meet', nom: 'Nūr Meet' }, { id: 'leviaro', nom: 'Leviaro' }] };
  const etat = { verifications: { k1: { projet: 'leviaro', nom: 'Site leviaro.fr', etat: 'panne', detail: 'répond 502', sens: 'Les prospects tombent sur une erreur.', depuis: '2026-10-10T06:00:00Z' } } };
  const cartes = tableauDeBord({ business: business(), journal: journal(), configJournal, jour }).cartes.map((c) => ({ ...c, couleur: 'vert' }));
  const rouge = cartes.find((c) => c.id === 'histoires-vraies');
  rouge.couleur = 'rouge';
  rouge.silence = 12;
  const actions = [
    { id: 'a1', cle: 'panne:k1', projet: 'Leviaro', titre: 'Site en panne', constat: 'x', statut: 'a_analyser', historique: [] },
    { id: 'a2', cle: 'decider:x', projet: 'Nūr Meet', titre: '2 mails jamais partis : les relancer ?', constat: '2 mails jamais partis : les relancer ?', statut: 'question_posee', historique: [], source: { type: 'decider', projet: 'nour-meet' } },
    { id: 'a3', cle: 'decider:y', projet: 'Impacteur', titre: 'Fiches à vérifier', constat: '4 fiches attendent', statut: 'proposition_a_valider', historique: [] },
    { id: 'a4', cle: 'decider:z', projet: 'Cambodge', titre: 'Autre', constat: 'autre', statut: 'resultat_a_verifier', historique: [] },
    { id: 'a5', cle: 'decider:w', projet: 'Nūr Meet', titre: 'Doublon même projet', constat: 'd', statut: 'question_posee', historique: [] },
  ];
  const r = priorites({ etat, cartes, actions, config });
  assert.equal(r.priorites.length, 3);
  assert.deepEqual(r.priorites.map((p) => p.type), ['panne', 'arret', 'fiche']);
  assert.equal(r.priorites[0].href, '/action?id=a1');
  assert.match(r.priorites[0].preuve, /répond 502/);
  assert.match(r.priorites[1].preuve, /12 jours/);
  assert.equal(r.priorites[2].href, '/action?id=a2');
  assert.ok(r.autres >= 2, 'les autres points sont comptés');
  // Rien d'ouvert : aucune priorité, pas d'invention.
  assert.deepEqual(priorites({ etat: { verifications: {} }, cartes: cartes.map((c) => ({ ...c, couleur: 'vert' })), actions: [], config }), { priorites: [], autres: 0 });
});

test('changementsDepuisHier et fraicheur', () => {
  const ch = changementsDepuisHier({ business: business(), journal: journal(), configJournal, jour });
  const nm = ch.find((x) => x.id === 'nour-meet');
  assert.deepEqual(nm.chiffres, ['1 mail envoyé', '1 réponses']);
  assert.equal(ch.find((x) => x.id === 'cambodge').evenements[0].titre, 'Candidature envoyée à Phnom Penh');
  assert.deepEqual(fraicheur(business(), jour), { derniere: '2026-10-10T08:00:00Z', retard: 0 });
  assert.deepEqual(fraicheur({ sources: {} }), { derniere: null, retard: null });
});

test('page Aujourd’hui : priorités, lignes, indisponible, menu et compteur Actions', () => {
  const b = business();
  const lignes = lignesProjets({ business: b, journal: journal(), configJournal, jour });
  const html = pageAujourdhui({
    lignes,
    priorites: [{ type: 'panne', projet: 'Leviaro', titre: 'Le site <b>ne répond plus', preuve: 'répond 502', attendu: 'Le cerveau examine.', href: '/action?id=a1' }],
    autres: 2,
    changements: changementsDepuisHier({ business: b, journal: journal(), configJournal, jour }),
    fraicheur: fraicheur(b, jour),
    jour,
    aFaire: 4,
  });
  assert.match(html, /Priorités du jour/);
  assert.match(html, /Le site &lt;b&gt;ne répond plus/);
  assert.match(html, /2 autre\(s\) point\(s\)/);
  assert.match(html, /▲ 2/);
  assert.match(html, /indisponible/);
  assert.match(html, /Candidature envoyée à Phnom Penh/);
  assert.match(html, /class="actif" data-s="☀">Aujourd’hui/);
  assert.match(html, /Actions <span class="badge">4<\/span>/);
  assert.match(html, /href="\/surveillance"/);
  assert.doesNotMatch(html, /Questions du jour|data-s="☰">Activité/);
  // Le compteur global sert aux autres pages.
  definirCompteurActions(2);
  assert.match(gabarit({ onglet: 'argent', contenu: '' }), /Actions <span class="badge">2<\/span>/);
  definirCompteurActions(0);
  assert.doesNotMatch(gabarit({ onglet: 'argent', contenu: '' }), /class="badge"/);
});
