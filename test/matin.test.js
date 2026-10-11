import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matinAFaire, analyserMatin, analysesDuJour, contexteProjets, messageMatin, depenseMatinDuMois } from '../src/matin.js';

const projets = [{ id: 'nour-meet', nom: 'Nūr Meet' }, { id: 'leviaro', nom: 'Leviaro' }];
const fauxClient = (json, usage = { input_tokens: 5000, output_tokens: 800 }) => ({
  beta: { messages: { create: async () => ({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify(json) }] }) } },
});

test('matinAFaire : une fois par jour, après l’heure', () => {
  const d = { ia: {}, jours: {} };
  assert.equal(matinAFaire(d, { heure: 7, maintenant: new Date('2026-10-11T04:30:00Z') }), null); // 6h30 à Paris
  assert.equal(matinAFaire(d, { heure: 7, maintenant: new Date('2026-10-11T05:10:00Z') }), '2026-10-11');
  d.jours['2026-10-11'] = { jour: '2026-10-11' };
  assert.equal(matinAFaire(d, { heure: 7, maintenant: new Date('2026-10-11T09:00:00Z') }), null);
});

test('analyserMatin : une phrase par projet, une fiche au plus, réponses aux fiches, coût compté', async () => {
  const d = { ia: {}, jours: {} };
  const client = fauxClient({
    projets: [
      { id: 'nour-meet', phrase: '23 mails, 1 réponse : le message accroche-t-il ?', fiche: { type: 'proposition', titre: 'Tester un autre objet de mail', texte: 'Le taux d’ouverture est bas : proposer un objet plus direct.' } },
      { id: 'leviaro', phrase: 'Aucun mail depuis 9 jours.', fiche: { type: 'aucune', titre: '', texte: '' } },
      { id: 'inconnu', phrase: 'x', fiche: { type: 'aucune', titre: '', texte: '' } },
    ],
    reponses: [{ id: 'f1', texte: 'Bien noté : je propose de relancer.', suite: 'proposition' }, { id: 'pas-a-moi', texte: 'x', suite: 'question' }],
  });
  const entree = await analyserMatin(d, { client, contexte: 'données', projets, fichesAttente: [{ id: 'f1', projet: 'Leviaro', titre: 'T', constat: 'C', discussion: [{ role: 'louis', texte: 'Oui' }] }], jour: '2026-10-11', plafondDollars: 5 });
  assert.equal(entree.erreur, null);
  assert.deepEqual(Object.keys(entree.projets), ['nour-meet', 'leviaro']);
  assert.equal(entree.projets['nour-meet'].fiche.type, 'proposition');
  assert.equal(entree.projets.leviaro.fiche, null);
  assert.deepEqual(entree.reponses, [{ id: 'f1', texte: 'Bien noté : je propose de relancer.', suite: 'proposition' }]);
  assert.ok(entree.cout > 0 && Math.abs(depenseMatinDuMois(d, '2026-10-11') - entree.cout) < 1e-6);
  // Les phrases servent à la page Aujourd'hui, le jour même et le lendemain matin avant 7 h.
  assert.equal(analysesDuJour(d, '2026-10-11')['nour-meet'].phrase, '23 mails, 1 réponse : le message accroche-t-il ?');
  assert.ok(analysesDuJour(d, '2026-10-12').leviaro);
  assert.deepEqual(analysesDuJour(d, '2026-10-13'), {});
  // Telegram : une ligne par projet, les fiches à décider.
  const t = messageMatin(entree, (id) => projets.find((p) => p.id === id)?.nom ?? id);
  assert.match(t, /• <b>Nūr Meet<\/b> : 23 mails/);
  assert.match(t, /💡 Nūr Meet : Tester un autre objet de mail/);
  assert.match(t, /1 réponse\(s\) du cerveau/);
  // Plafond atteint : rien ne part, c'est dit.
  d.ia['2026-10'] = 5;
  const bloque = await analyserMatin(d, { client, contexte: '', projets, jour: '2026-10-12', plafondDollars: 5 });
  assert.match(bloque.erreur, /Plafond du mois atteint/);
  assert.match(messageMatin(bloque), /Plafond du mois atteint/);
  // Sans clé : pareil, honnêtement.
  assert.match((await analyserMatin({ ia: {}, jours: {} }, { client: null, contexte: '', projets, jour: '2026-10-12' })).erreur, /clé Claude/);
});

test('contexteProjets : chiffres des cartes en texte, « pas branché » jamais 0', () => {
  const cartes7 = [
    { id: 'nour-meet', nom: 'Nūr Meet', couleur: 'orange', principal: { titre: 'Mails envoyés', total: 23, precedent: 0, unite: 'mail' }, chiffres: [{ titre: 'Réponses', valeur: 1, detail: '4 %' }], aDecider: ['20 restaurants sans email'], manque: ['Stripe'], silence: 0, objectif: { valide: 40 } },
    { id: 'leviaro', nom: 'Leviaro', couleur: 'gris', principal: { titre: 'x', total: 0 }, chiffres: [], aDecider: [], manque: ['agent Leviaro'] },
  ];
  const t = contexteProjets({ cartes7, cartes1: [{ id: 'nour-meet', principal: { total: 3 } }] });
  assert.match(t, /Nūr Meet \(nour-meet\) : Mails envoyés = 23 sur 7 jours \(7 jours d'avant : 0\), hier\/aujourd'hui = 3 ; objectif validé 40/);
  assert.match(t, /Réponses : 1 \(4 %\)/);
  assert.match(t, /à décider \(déjà repéré\) : 20 restaurants sans email/);
  assert.match(t, /Leviaro \(leviaro\) : pas branché, données manquantes : agent Leviaro/);
});
