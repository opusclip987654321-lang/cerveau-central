import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ajouterIdee, changerStatutIdee } from '../src/idees.js';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journalVide = () => ({ evenements: [], n8n: { jours: {}, instances: {} } });

test('ajouter une idée, changer son suivi', () => {
  const d = { idees: [] };
  assert.equal(ajouterIdee(d, 'leviaro', '   ').erreur, 'L’idée est vide.');
  const { idee } = ajouterIdee(d, 'leviaro', 'Relancer ceux qui ont ouvert sans répondre');
  assert.equal(d.idees.length, 1);
  assert.equal(idee.statut, 'proposee');
  assert.equal(changerStatutIdee(d, 'xxx', 'faite').erreur, 'Idée introuvable.');
  assert.equal(changerStatutIdee(d, idee.id, 'nimporte').erreur, 'Statut inconnu.');
  assert.equal(changerStatutIdee(d, idee.id, 'en_cours').idee.statut, 'en_cours');
});

test('page projet Leviaro : détail, idées, surveillance', () => {
  const business = {
    objectifs: {},
    sources: {
      leviaro: {
        maj: '2026-10-05T11:00:00Z',
        envois: [{ etape: 0, jour: '2026-10-03' }],
        echecs: [],
        reponses: [{ jour: '2026-10-04', traitee: false }],
        oppositions: 0,
        entreprises: ['2026-10-03'],
        aValider: 1,
        sansContact: 0,
        enDiscussion: 1,
        recommandations: 0,
        coutMois: 1.5,
        detail: {
          entreprises: [{ nom: 'Boulangerie Martin', ville: 'Lyon', secteur: 'artisanat', etat: 'discussion_active', creee: '2026-10-03' }],
          messages: [{ etape: 0, etat: 'envoye', objet: 'Votre site vitrine', envoye: '2026-10-03', cree: '2026-10-03', entreprise: 'Boulangerie Martin' }],
          reponses: [{ de: 'contact@martin.fr', objet: 'Re: Votre site', extrait: 'Pas intéressé, trop cher', categorie: 'humaine', recu: '2026-10-04', traitee: false, entreprise: 'Boulangerie Martin' }],
        },
      },
    },
  };
  const idees = { idees: [{ id: 'a1', projet: 'leviaro', texte: 'Baisser le prix de l’offre A', statut: 'proposee', cree: '2026-10-05T10:00:00Z', maj: '2026-10-05T10:00:00Z' }] };
  const html = pageProjet(configJournal, 'leviaro', {
    business,
    journal: journalVide(),
    idees,
    jour: '2026-10-05',
    verifications: [{ projet: 'leviaro', nom: 'Site leviaro.fr', etat: 'ok', detail: 'répond en 80 ms' }],
  });
  assert.match(html, /Boulangerie Martin/);
  assert.match(html, /Pas intéressé, trop cher/);
  assert.match(html, /vraie réponse/);
  assert.match(html, /en discussion/);
  assert.match(html, /Baisser le prix de l’offre A/);
  assert.match(html, /Mes idées de modifications/);
  // Le petit ℹ️ qui explique les états en clair (demande de louis du 05/10).
  assert.match(html, /Que veulent dire ces mots/);
  assert.match(html, /ne correspond pas aux clients recherchés/);
  assert.match(html, /Surveillance technique \(1\)/);
  assert.match(html, /Retour au tableau de bord/);
  assert.equal(pageProjet(configJournal, 'inconnu', { business, journal: journalVide(), idees }), null);
});

test('page projet Petites histoires vraies : vidéos listées avec lien', () => {
  const html = pageProjet(configJournal, 'histoires-vraies', {
    business: { sources: {}, objectifs: {} },
    journal: journalVide(),
    idees: { idees: [] },
    jour: '2026-10-05',
    histoires: { publiees: [{ story_id: '19-amira', title: 'Amira', date: '2026-09-29T18:00:00', fb_video_id: '123' }], jobs: [] },
  });
  assert.match(html, /Vidéos publiées/);
  assert.match(html, /Amira/);
  assert.match(html, /facebook\.com\/watch/);
  assert.match(html, /vues par vidéo ne sont pas encore branchées/i);
});

test('page projet Nūr Meet : réponses et mails à valider', () => {
  const business = {
    objectifs: {},
    sources: {
      prospection: {
        maj: '2026-10-05T11:00:00Z',
        prospects: [
          { nom: 'La Plume', ville: 'Paris', statut: 'repondu', email: true, reponse: '2026-10-04' },
          { nom: 'Chez Sam', ville: 'Lyon', statut: 'propose', email: true },
        ],
        envois: [{ nom: 'La Plume', objet: 'Vos soirées sur Nūr Meet', statut: 'envoye', jour: '2026-10-01' }],
        ouvertures: [],
        reponses: [
          { jour: '2026-10-05', nom: 'Didon', ville: 'Paris', de: 'Didon <resa@didon.fr>', objet: 'Re: Vos soirées', texte: 'Bonjour, oui ça nous intéresse, pouvez-vous nous rappeler au 01 02 03 04 05 pour en discuter la semaine prochaine ? Merci.' },
        ],
      },
    },
  };
  const html = pageProjet(configJournal, 'nour-meet', { business, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-05' });
  assert.match(html, /La Plume/);
  assert.match(html, /Chez Sam/);
  assert.match(html, /Vos soirées sur Nūr Meet/);
  assert.match(html, /Mails préparés jamais partis/);
  // Le texte de la réponse est lisible (résumé + dépliable), l'ancienne n'a que la date.
  assert.match(html, /Leur réponse/);
  assert.match(html, /<details class="texte"><summary>Bonjour, oui ça nous intéresse/);
  assert.match(html, /la semaine prochaine \? Merci\./);
});
