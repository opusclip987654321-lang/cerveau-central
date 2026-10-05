import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerBilans, bilanAFaire, genererBilan, lundiDe, depenseBilansDuMois } from '../src/bilan.js';
import { pageAnalyses } from '../src/page-analyses.js';
import { contexteCerveau } from '../src/contexte.js';

const vide = () => ({ ia: {}, bilans: [] });

test('lundiDe et bilanAFaire : un bilan par semaine, le lundi après 8 h', () => {
  assert.equal(lundiDe('2026-10-05'), '2026-10-05'); // un lundi reste lui-même
  assert.equal(lundiDe('2026-10-08'), '2026-10-05'); // le jeudi remonte au lundi
  const lundiMatin = new Date('2026-10-05T09:00:00+02:00');
  assert.equal(bilanAFaire(vide(), { maintenant: lundiMatin }), '2026-10-05');
  assert.equal(bilanAFaire(vide(), { maintenant: new Date('2026-10-05T07:30:00+02:00') }), null); // trop tôt
  assert.equal(bilanAFaire(vide(), { maintenant: new Date('2026-10-06T09:00:00+02:00') }), null); // mardi
  const deja = { ia: {}, bilans: [{ semaine: '2026-10-05' }] };
  assert.equal(bilanAFaire(deja, { maintenant: lundiMatin }), null);
});

test('genererBilan : écrit, compte le coût, archive ; plafond = mode dégradé honnête', async () => {
  const d = vide();
  const client = {
    beta: { messages: { create: async () => ({ usage: { input_tokens: 100_000, output_tokens: 1_000 }, stop_reason: 'end_turn', content: [{ type: 'text', text: 'La semaine passée…' }] }) } },
  };
  const e1 = await genererBilan(d, { client, contexte: 'données', semaine: '2026-10-05', maintenant: new Date('2026-10-05T08:10:00+02:00') });
  assert.equal(e1.texte, 'La semaine passée…');
  assert.equal(e1.erreur, null);
  assert.ok(e1.cout > 0);
  assert.equal(d.bilans.length, 1);
  assert.ok(depenseBilansDuMois(d, '2026-10-05') > 0);
  // Plafond atteint : pas d'appel, une entrée honnête.
  d.ia['2026-11'] = 10;
  const e2 = await genererBilan(d, { client: { beta: { messages: { create: () => assert.fail('ne doit pas appeler Claude') } } }, contexte: 'x', semaine: '2026-11-02' });
  assert.match(e2.erreur, /Plafond du mois atteint/);
  assert.equal(d.bilans[0].semaine, '2026-11-02');
});

test('genererBilan : une réponse coupée (max_tokens) est signalée dans le texte', async () => {
  const d = vide();
  const client = {
    beta: { messages: { create: async () => ({ usage: { input_tokens: 1_000, output_tokens: 10 }, stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Bilan interrompu en pleine' }] }) } },
  };
  const e1 = await genererBilan(d, { client, contexte: 'x', semaine: '2026-10-05' });
  assert.match(e1.texte, /Bilan coupé en route/);
  assert.match(e1.texte, /Refaire le bilan/);
});

test('page Analyses : bilan affiché avec la règle « rien ne se change tout seul », état vide honnête', () => {
  const avec = { ia: { '2026-10': 0.12 }, bilans: [{ semaine: '2026-10-05', texte: 'Nūr Meet avance.\n\nTrois propositions : …', cout: 0.12, erreur: null }] };
  const html = pageAnalyses(avec, { plafond: 10 });
  assert.match(html, /Bilan du lundi 5 octobre/);
  assert.match(html, /Nūr Meet avance\./);
  assert.match(html, /rien ne se change tout seul/);
  assert.match(html, /0.12 \$ sur 10 \$/);
  const sans = pageAnalyses(vide(), { plafond: 10 });
  assert.match(sans, /le premier s'écrira lundi matin/);
  assert.match(sans, /class="actif" data-s="[^"]*">Analyses/);
});

test('page Analyses : le Markdown est mis en forme, pas affiché brut, et le bouton Refaire suit « actif »', () => {
  const texte = '# Bilan de la semaine\n\n## 1. Projet par projet\n\n**Nūr Meet** : 19 réponses.\n\n- première proposition\n- deuxième proposition\n\nFin <script>.';
  const d = { ia: {}, bilans: [{ semaine: '2026-10-05', texte, cout: 0.02, erreur: null }] };
  const html = pageAnalyses(d, { plafond: 10, actif: true });
  const bilan = html.slice(html.indexOf('<section class="bilan">'), html.indexOf('</section>'));
  assert.match(bilan, /<h4>Bilan de la semaine<\/h4>/);
  assert.match(bilan, /<h4>1\. Projet par projet<\/h4>/);
  assert.match(bilan, /<b>Nūr Meet<\/b> : 19 réponses\./);
  assert.match(bilan, /<ul><li>première proposition<\/li><li>deuxième proposition<\/li><\/ul>/);
  assert.ok(!bilan.includes('##') && !bilan.includes('**'), 'plus de symboles Markdown bruts');
  assert.match(bilan, /Fin &lt;script&gt;\./); // le HTML du texte reste échappé
  assert.match(html, /Refaire le bilan de cette semaine/);
  assert.doesNotMatch(pageAnalyses(d, { plafond: 10 }), /Refaire le bilan/); // sans clé IA, pas de bouton
});

test('contexteCerveau : inclut objectifs validés et réponses aux questions', () => {
  const configJournal = { projets: [{ id: 'nour-meet', nom: 'Nūr Meet' }] };
  const t = contexteCerveau({
    etat: { verifications: {} },
    configJournal,
    business: { objectifs: { 'nour-meet': { valide: 40, propose: 40 } } },
    reponses: { reponses: [{ jour: '2026-10-04', projet: 'nour-meet', texte: 'Qu’est-ce qui bloque ?', reponse: 'Trouver des restaurateurs' }] },
  });
  assert.match(t, /Objectifs hebdomadaires validés/);
  assert.match(t, /Nūr Meet : 40 par semaine/);
  assert.match(t, /Qu’est-ce qui bloque \? → Trouver des restaurateurs/);
});
