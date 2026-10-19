import test from 'node:test';
import assert from 'node:assert/strict';
import { loopDeDepart, trierReponses, statsLoop, revueAFaire, revoirMethode, verifierMethode, piloter, cheminMethode, methodePourN8n, cleReponseLoop, versionDuMail, remplir, htmlLoop, alerteInteresse } from '../src/loop-nour-meet.js';

const maintenant = new Date('2026-10-19T18:00:00+02:00');
const business = () => ({
  sources: {
    prospection: {
      prospects: [
        { nom: 'BOTZA', ville: 'Paris', statut: 'relance2', premier: '2026-10-05', dep: '75', recherche: 'restaurant privatisable pour soirée' },
        { nom: 'Chez B', ville: 'Créteil', statut: 'exclu', premier: '2026-10-06', dep: '94' },
        { nom: 'Le Neuf', ville: 'Paris', statut: 'contacte', premier: '2026-10-20', dep: '75' },
      ],
      envois: [
        { nom: 'BOTZA', objet: 'BOTZA : proposer vos soirées', statut: 'envoye', jour: '2026-10-05', corps: 'texte sans lien marqué' },
        { nom: 'BOTZA', objet: 'Dernier message : Nūr Meet et BOTZA', statut: 'envoye', jour: '2026-10-14', corps: 'x' },
        { nom: 'Chez B', objet: 'Chez B : proposer', statut: 'envoye', jour: '2026-10-06', corps: 'x' },
        { nom: 'Le Neuf', objet: 'Le Neuf : des soirées', statut: 'envoye', jour: '2026-10-20', corps: 'https://nourmeet.com/restaurateurs?utm_source=prospection&utm_medium=email&utm_campaign=v2-initial' },
      ],
      reponses: [
        { jour: '2026-10-19', nom: 'BOTZA', de: 'Thibault', objet: 'Re: Dernier message : Nūr Meet et BOTZA', texte: 'Je suis intéressé, appelez-moi' },
        { jour: '2026-10-07', nom: 'Chez B', de: 'x', objet: 'Re: Chez B', texte: 'STOP' },
      ],
    },
  },
});
const clientTri = (types) => ({
  messages: { create: async ({ messages }) => ({ usage: { input_tokens: 2000, output_tokens: 200 }, content: [{ type: 'text', text: JSON.stringify({ reponses: types.map((t, i) => ({ i, type: t, resume: `résumé ${i}` })).filter(() => messages.length) }) }] }) },
});

test('départ : version 2 en cours, version 1 gardée pour pouvoir revenir', () => {
  const l = loopDeDepart(maintenant);
  assert.equal(l.methode.version, 2);
  assert.deepEqual(l.historique.map((h) => h.version), [1, 2]);
  for (const t of ['initial', 'relance1', 'relance2']) {
    assert.match(l.methode.textes[t].corps, /\{lien\}/);
    assert.match(l.methode.textes[t].corps, /\{pied\}/);
  }
  assert.match(remplir(l.methode.textes.initial.objet, { nom: 'BOTZA' }), /^BOTZA : /);
});

test('tri des réponses : classées une fois, coût compté, positives reliées au mail qui les a déclenchées', async () => {
  const l = loopDeDepart(maintenant);
  const b = business();
  const r = await trierReponses(l, b, { client: clientTri(['INTERESSE', 'REFUS']), maintenant });
  assert.equal(r.nouvelles.length, 2);
  assert.equal(l.reponses[cleReponseLoop(b.sources.prospection.reponses[0])].type, 'INTERESSE');
  assert.ok(l.ia['2026-10'] > 0);
  // Au tour suivant, rien à retrier : pas d'appel.
  const r2 = await trierReponses(l, b, { client: { messages: { create: () => assert.fail('déjà trié') } }, maintenant });
  assert.equal(r2.nouvelles.length, 0);
  const s = statsLoop(b, l);
  assert.equal(s.positifs, 1);
  const v1relance2 = s.parVersionEtType.find((x) => x.version === 1 && x.type === 'relance2');
  assert.deepEqual([v1relance2.envoyes, v1relance2.positifs], [1, 1]);
  assert.equal(s.parVersionEtType.find((x) => x.version === 2).envoyes, 1);
  assert.deepEqual(s.parZone.Paris, { contactes: 2, positifs: 1 });
  assert.match(alerteInteresse({ ...l.reponses[cleReponseLoop(b.sources.prospection.reponses[0])] }), /BOTZA.*intéressé/);
});

test('tri : erreur de Claude (limite Anthropic) = réponses gardées à trier, rien de faux', async () => {
  const l = loopDeDepart(maintenant);
  const r = await trierReponses(l, business(), { client: { messages: { create: async () => { throw new Error('credit limit'); } } }, maintenant });
  assert.equal(r.nouvelles.length, 0);
  assert.match(r.erreur, /credit/);
  assert.deepEqual(l.reponses, {});
});

test('versionDuMail : lue dans le lien, 1 sans lien marqué', () => {
  assert.equal(versionDuMail('…utm_campaign=v7-relance1'), 7);
  assert.equal(versionDuMail('ancien mail'), 1);
});

test('verifierMethode : garde-fous de la loop', () => {
  const m = loopDeDepart(maintenant).methode;
  assert.match(verifierMethode(m, { textes: { initial: { corps: 'sans lien' } } }).erreur, /\{lien\}/);
  assert.match(verifierMethode(m, { parJour: 500 }).erreur, /10 à 80/);
  assert.match(verifierMethode(m, { relanceJours: [9, 4] }).erreur, /relance/);
  assert.match(verifierMethode(m, { textes: { relance1: { corps: 'écrivez à a@b.fr {lien} {pied}' } } }).erreur, /adresse/);
  const ok = verifierMethode(m, { parJour: 60, recherches: ['restaurant libanais', 'restaurant libanais', 'bistrot'] });
  assert.equal(ok.methode.parJour, 60);
  assert.deepEqual(ok.methode.recherches, ['restaurant libanais', 'bistrot']);
});

const clientRevue = (d) => ({ beta: { messages: { create: async () => ({ usage: { input_tokens: 30_000, output_tokens: 3_000 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(d) }] }) } } });

test('revue : un changement sûr est appliqué et noté ; un pivot radical attend louis', async () => {
  const l = loopDeDepart(maintenant);
  const lundi = new Date('2026-10-26T09:30:00+01:00');
  assert.equal(revueAFaire(l, { maintenant: lundi }), '2026-10-26');
  assert.equal(revueAFaire(l, { maintenant: new Date('2026-10-27T10:00:00+01:00') }), null);
  const e1 = await revoirMethode(l, business(), { client: clientRevue({ changer: true, methode: { parJour: 60 }, changements: ['Plus de mails'], pourquoi: 'Paris répond.', radical: false }), semaine: '2026-10-26', maintenant: lundi });
  assert.equal(e1.version, 3);
  assert.equal(l.methode.parJour, 60);
  assert.equal(revueAFaire(l, { maintenant: new Date('2026-10-26T15:00:00+01:00') }), null); // faite, et version 3 trop récente
  assert.equal(revueAFaire(loopDeDepart(lundi), { maintenant: lundi }), null); // version 2 du jour même : pas encore jugeable
  const e2 = await revoirMethode(l, business(), { client: clientRevue({ changer: true, methode: { recherches: ['traiteur'] }, changements: ['Viser les traiteurs'], pourquoi: 'x', radical: true, question: 'On vise les traiteurs ?' }), semaine: '2026-11-02' });
  assert.equal(e2.question, 'On vise les traiteurs ?');
  assert.equal(l.methode.version, 3); // rien appliqué
  assert.ok(l.propositionRadicale);
  piloter(l, 'accepter');
  assert.equal(l.methode.version, 4);
  assert.deepEqual(l.methode.recherches, ['traiteur']);
  assert.equal(l.propositionRadicale, null);
});

test('revue : réponse illisible ou plafond = rien ne change', async () => {
  const l = loopDeDepart(maintenant);
  const casse = { beta: { messages: { create: async () => ({ usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text: 'pas du json' }] }) } } };
  const lundi = new Date('2026-10-26T09:30:00+01:00');
  const e = await revoirMethode(l, business(), { client: casse, semaine: '2026-10-26', maintenant: lundi });
  assert.match(e.erreur, /Revue impossible/);
  assert.equal(revueAFaire(l, { maintenant: new Date('2026-10-26T11:00:00+01:00') }), null); // retentée plus tard
  assert.equal(revueAFaire(l, { maintenant: new Date('2026-10-26T16:00:00+01:00') }), '2026-10-26');
  assert.equal(l.methode.version, 2);
  l.ia['2026-11'] = 11;
  const p = await revoirMethode(l, business(), { client: { beta: { messages: { create: () => assert.fail('plafond') } } }, semaine: '2026-11-02' });
  assert.match(p.erreur, /Plafond/);
});

test('piloter : pause, reprise, annulation du dernier changement', () => {
  const l = loopDeDepart(maintenant);
  piloter(l, 'pause');
  assert.equal(methodePourN8n(l).pause, true);
  assert.equal(revueAFaire(l, { maintenant: new Date('2026-10-26T09:30:00+01:00') }), null);
  piloter(l, 'reprendre');
  piloter(l, 'annuler');
  assert.equal(l.methode.version, 3);
  assert.equal(l.methode.textes.initial.objet, l.historique[0].methode.textes.initial.objet); // revenu aux textes de départ
  assert.match(piloter(l, 'nimporte').erreur, /inconnu/);
});

test('adresse de la méthode : stable et tirée du jeton', () => {
  assert.equal(cheminMethode('un-jeton-de-test-assez-long'), cheminMethode('un-jeton-de-test-assez-long'));
  assert.notEqual(cheminMethode('a'.repeat(20)), cheminMethode('b'.repeat(20)));
  assert.match(cheminMethode('x'.repeat(20)), /^\/loop\/nour-meet\/[0-9a-f]{32}$/);
});

test('page : la loop dit sa version, ses changements et propose pause et annulation', () => {
  const h = htmlLoop(loopDeDepart(maintenant), business(), { jour: '2026-10-19' });
  assert.match(h, /version 2/);
  assert.match(h, /Mettre la loop en pause/);
  assert.match(h, /Annuler le dernier changement/);
  assert.match(h, /69 € HT/);
});
