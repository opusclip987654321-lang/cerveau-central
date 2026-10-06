import test from 'node:test';
import assert from 'node:assert/strict';
import { grouperParJour, exempleDuJour, reponseAutomatique, lienGmail } from '../src/mails.js';
import { decider, cleTri, DECISIONS_TRI } from '../src/tri-mails.js';
import { readFileSync } from 'node:fs';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(readFileSync(new URL('../config/journal.json', import.meta.url)));
const journalVide = () => ({ evenements: [], automatisations: {}, curseurs: {} });

test('mails : regroupement par jour, exemple stable, réponses automatiques reconnues', () => {
  const jours = grouperParJour([{ jour: '2026-10-04', n: 1 }, { jour: '2026-10-05', n: 2 }, { jour: '2026-10-05', n: 3 }, { n: 4 }]);
  assert.deepEqual(jours.map(([j, l]) => [j, l.length]), [['2026-10-05', 2], ['2026-10-04', 1]]);
  // Même jour, même exemple ; jour vide, pas d'exemple.
  assert.equal(exempleDuJour('2026-10-05', 7), exempleDuJour('2026-10-05', 7));
  assert.equal(exempleDuJour('2026-10-05', 0), -1);
  assert.ok(reponseAutomatique({ objet: 'Réponse automatique : absence', texte: '' }));
  assert.ok(reponseAutomatique({ objet: 'Re: soirée', texte: 'Out of office until Monday' }));
  assert.ok(!reponseAutomatique({ objet: 'Re: soirée', texte: 'Oui ça m’intéresse, appelez-moi.' }));
  assert.match(lienGmail('Chez Momo'), /#search\/Chez%20Momo/);
});

test('tri des vieux mails : décisions notées par lot, doublon signalé, rien envoyé', () => {
  const d = { decisions: {} };
  const r = decider(d, ['Chez Momo', 'La Table', ''], 'envoyer', { dejaEnvoyes: new Set(['La Table']) });
  assert.equal(r.nombre, 2);
  assert.equal(r.doublons, 1);
  assert.equal(d.decisions[cleTri('La Table')].doublon, true);
  assert.equal(d.decisions[cleTri('Chez Momo')].decision, 'envoyer');
  assert.ok(decider(d, ['X'], 'inconnue').erreur);
  assert.ok(decider(d, [], 'garder').erreur);
  assert.equal(Object.keys(DECISIONS_TRI).length, 3);
});

test('page Nūr Meet : une ligne par journée, échange complet, contenu manquant dit tel quel', () => {
  const business = {
    objectifs: {},
    sources: {
      stripe: { abonnements: { actifs: 0, parMois: 0, essais: 0 } },
      prospection: {
        maj: '2026-10-05T18:00:00Z',
        ouvertures: [],
        prospects: [
          { nom: 'Chez Momo', ville: 'Lyon', email: 'momo@x.fr', statut: 'repondu', premier: '2026-10-04', reponse: '2026-10-05' },
          { nom: 'La Table', ville: 'Paris', email: 'table@x.fr', statut: 'propose' },
          { nom: 'Sans Texte', ville: 'Nice', email: 's@x.fr', statut: 'repondu', premier: '2026-10-04', reponse: '2026-10-05' },
        ],
        envois: [
          { jour: '2026-10-04', nom: 'Chez Momo', objet: 'Soirée Nūr', statut: 'envoye' },
          { jour: '2026-10-05', nom: 'Chez Momo', objet: 'Relance soirée', statut: 'envoye' },
          { jour: '2026-10-05', nom: 'Sans Texte', objet: 'Soirée Nūr', statut: 'echec' },
        ],
        reponses: [
          { jour: '2026-10-05', nom: 'Chez Momo', ville: 'Lyon', objet: 'Re: Soirée', texte: 'Oui, appelez-moi mardi.' },
          { jour: '2026-10-05', nom: 'AutoResto', ville: '—', objet: 'Réponse automatique : absence', texte: 'Je suis absent.' },
        ],
      },
    },
  };
  const html = pageProjet(configJournal, 'nour-meet', {
    business,
    journal: journalVide(),
    jour: '2026-10-05',
    idees: { idees: [] },
    suivi: { reponses: {} },
    tri: { decisions: { [cleTri('La Table')]: { nom: 'La Table', decision: 'abandonner', quand: 'x', doublon: false } } },
  });
  // Une ligne par journée, avec le bouton « Voir les N mails ».
  assert.match(html, /Mails envoyés, jour par jour/);
  assert.match(html, /Voir les 2 mails ›/);
  // L'échange complet : premier mail, relance, réponse datée.
  assert.match(html, /→ 4 oct\. · Soirée Nūr/);
  assert.match(html, /→ 5 oct\. · Relance soirée/);
  assert.match(html, /← 5 oct\. · réponse : Oui, appelez-moi mardi\./);
  // Contenu manquant : dit tel quel, avec le lien Gmail, jamais inventé.
  assert.match(html, /contenu non récupéré/i);
  assert.match(html, /Chercher l’échange dans Gmail ›/);
  assert.match(html, /Réponse détectée, contenu indisponible\./); // Sans Texte
  // La réponse automatique probable est rangée à part, pas dans « à traiter ».
  const aTraiter = html.slice(html.indexOf('Réponses à traiter'), html.indexOf('Réponses automatiques probables'));
  assert.doesNotMatch(aTraiter, /AutoResto/);
  assert.match(html, /Réponses automatiques probables/);
  // Tri des vieux mails : case à cocher, décision notée affichée, rien envoyé.
  assert.match(html, /name="noms" value="La Table"/);
  assert.match(html, /Abandonner/);
  assert.match(html, /Rien ne part d’ici/);
  // L'exemple du jour est marqué.
  assert.match(html, /exemple du jour/);
});

test('page Nūr Meet : le texte réellement envoyé s’affiche quand l’automatisation l’a copié', () => {
  const business = {
    objectifs: {},
    sources: {
      prospection: {
        maj: '2026-10-05T18:00:00Z',
        ouvertures: [],
        prospects: [{ nom: 'Chez Momo', ville: 'Lyon', email: 'momo@x.fr', statut: 'contacte', premier: '2026-10-04' }],
        envois: [
          { jour: '2026-10-04', nom: 'Chez Momo', objet: 'Soirée Nūr', statut: 'envoye', corps: 'Bonjour, on organise des soirées sans alcool…' },
          { jour: '2026-10-05', nom: 'Chez Momo', objet: 'Relance soirée', statut: 'envoye', corps: 'Je me permets de relancer mon précédent message.' },
          { jour: '2026-10-05', nom: 'Chez Momo', objet: 'Essai raté', statut: 'echec', erreur: 'Mailbox full', corps: 'Texte du mail en échec.' },
        ],
        reponses: [],
      },
    },
  };
  const html = pageProjet(configJournal, 'nour-meet', { business, journal: journalVide(), jour: '2026-10-05', idees: { idees: [] }, suivi: { reponses: {} }, tri: { decisions: {} } });
  assert.match(html, /Bonjour, on organise des soirées sans alcool…/);
  assert.match(html, /Je me permets de relancer mon précédent message\./);
  // Tous les textes sont là : plus de note « contenu non récupéré » sur cet échange.
  assert.doesNotMatch(html, /contenu non récupéré/);
  // La cause d'un échec s'affiche à côté du mail quand np_envois la porte (colonne erreur).
  assert.match(html, /cause : Mailbox full/);
});

test('page Impacteur : journées avec compte par chaîne, compte d’envoi non enregistré dit tel quel', () => {
  const business = {
    objectifs: {},
    sources: {
      impacteur: {
        maj: '2026-10-05T18:00:00Z',
        fiches: [
          { auteur: 'A. Diop', livre: 'Livre A', chaine: 'Afrique', statut: 'ENVOYE', envoi: '2026-10-05', ouvert: '2026-10-05', corps: 'Bonjour, votre livre nous a touchés.', compte: 'afrique.conteurs@gmail.com' },
          { auteur: 'B. Dupont', livre: 'Livre B', chaine: 'Frexit', statut: 'ENVOYE', envoi: '2026-10-05' },
          { auteur: 'C. Attente', livre: 'Livre C', chaine: 'Afrique', statut: 'A_VERIFIER' },
        ],
      },
    },
  };
  const html = pageProjet(configJournal, 'impacteur', {
    business,
    journal: journalVide(),
    jour: '2026-10-05',
    idees: { idees: [] },
  });
  assert.match(html, /Invités contactés, jour par jour/);
  assert.match(html, /2 invité\(s\) contacté\(s\) <small>\((1 Afrique · 1 Frexit|1 Frexit · 1 Afrique)\)/);
  // La fiche sans enregistrement garde la note honnête ; celle qui a tout l'affiche en preuve.
  assert.match(html, /Compte d’envoi réellement utilisé : non enregistré/);
  assert.match(html, /Texte envoyé : Bonjour, votre livre nous a touchés\./);
  assert.match(html, /Compte d’envoi enregistré par l’automatisation : afrique\.conteurs@gmail\.com\./);
  assert.match(html, /Fiches sans envoi/);
  assert.match(html, /C\. Attente/);
});
