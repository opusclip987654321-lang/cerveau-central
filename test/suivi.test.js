import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changerSuivi, cleReponse, ETATS_FINIS } from '../src/suivi.js';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(readFileSync(new URL('../config/journal.json', import.meta.url)));
const journalVide = () => ({ evenements: [], automatisations: {}, curseurs: {} });

test('changerSuivi : valide la clé, l’état, l’action et l’échéance', () => {
  const d = { reponses: {} };
  const cle = cleReponse({ jour: '2026-10-05', de: 'resa@didon.fr', objet: 'Re: Vos soirées' });
  assert.match(cle, /^[0-9a-f]{16}$/);
  assert.equal(changerSuivi(d, 'pas-une-cle', { etat: 'traite' }).erreur, 'Réponse inconnue.');
  assert.equal(changerSuivi(d, cle, { etat: 'nimporte' }).erreur, 'État inconnu.');
  const r = changerSuivi(d, cle, { etat: 'a_relancer', action: '  Rappeler mardi  ', echeance: '2026-10-07' });
  assert.equal(r.suivi.action, 'Rappeler mardi');
  assert.equal(r.suivi.echeance, '2026-10-07');
  assert.equal(changerSuivi(d, cle, { etat: 'traite', echeance: 'demain' }).suivi.echeance, null);
  assert.ok(ETATS_FINIS.has('traite'));
});

test('fiche Nūr Meet : parcours commercial et réponses séparées par suivi', () => {
  const reponse = { jour: '2026-10-05', nom: 'Didon', ville: 'Paris', de: 'resa@didon.fr', objet: 'Re: Vos soirées', texte: 'Oui ça nous intéresse, rappelez-nous.' };
  const business = {
    objectifs: {},
    sources: {
      prospection: {
        maj: '2026-10-05T11:00:00Z',
        prospects: [
          { nom: 'Didon', ville: 'Paris', statut: 'repondu', email: true, premier: '2026-10-01', reponse: '2026-10-05' },
          { nom: 'La Plume', ville: 'Paris', statut: 'repondu', email: true, premier: '2026-10-01', reponse: '2026-10-04' },
          { nom: 'Chez Sam', ville: 'Lyon', statut: 'sans_email', email: false },
        ],
        envois: [{ nom: 'Didon', objet: 'Vos soirées', statut: 'envoye', jour: '2026-10-01' }],
        ouvertures: [],
        reponses: [reponse],
      },
      stripe: { abonnements: { actifs: 0, parMois: 0, essais: 0 } },
    },
  };
  const suivi = { reponses: { [cleReponse(reponse)]: { etat: 'traite', action: null, echeance: null, maj: '2026-10-05T12:00:00Z' } } };
  const html = pageProjet(configJournal, 'nour-meet', { business, journal: journalVide(), idees: { idees: [] }, suivi, jour: '2026-10-05' });
  // Parcours : 3 trouvés, 2 contactables, 2 contactés, 2 ont répondu, 0 abonné.
  assert.match(html, /Parcours commercial/);
  assert.match(html, /<b>3<\/b><span>trouvés/);
  assert.match(html, /<b>2<\/b><span>contactables/);
  assert.match(html, /<b>0<\/b><span>abonnés payants/);
  // Didon est « traité » → dans Réponses traitées ; La Plume (sans texte) reste à traiter.
  const aTraiter = html.slice(html.indexOf('Réponses à traiter'), html.indexOf('Réponses traitées <small>'));
  assert.match(aTraiter, /La Plume/);
  assert.doesNotMatch(aTraiter, /Didon/);
  assert.match(html, /Réponses traitées/);
  assert.match(html, /action="\/suivi-reponse"/);
  assert.match(html, /n’envoie aucun mail/);
});
