import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { choisirQuestions, questionsDuJour, enregistrerReponses, enAttente, rappelAEnvoyer, jourParis } from '../src/questions.js';
import { pageQuestions } from '../src/page-questions.js';

const config = JSON.parse(readFileSync(new URL('../config/questions.json', import.meta.url)));
const vide = () => ({ jours: {}, reponses: [], rappels: [] });

test('la banque de questions est valide', () => {
  assert.equal(config.projets.length, 7);
  const ids = config.projets.flatMap((p) => p.questions.map((q) => q.id));
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  for (const p of config.projets) {
    assert.equal(p.questions.filter((q) => q.quotidienne).length, 1, `${p.nom} : une note quotidienne`);
    for (const q of p.questions) {
      assert.ok(['note', 'nombre', 'texte', 'choix'].includes(q.type), q.id);
      if (q.type === 'choix') assert.ok(q.choix.length >= 2, q.id);
    }
  }
});

test('2 questions par projet et par jour, dont la note du jour', () => {
  const h = vide();
  const jour = questionsDuJour(config, h, '2026-10-05');
  assert.equal(jour.length, 7);
  for (const { questions } of jour) {
    assert.equal(questions.length, 2);
    assert.ok(questions[0].quotidienne);
  }
  assert.equal(enAttente(config, h, '2026-10-05'), 14);
});

test('les questions changent chaque jour et reviennent seulement après une pause', () => {
  const h = vide();
  const projet = config.projets[0];
  const vues = [];
  for (let i = 0; i < 7; i++) {
    const jour = `2026-10-${String(5 + i).padStart(2, '0')}`;
    questionsDuJour(config, h, jour);
    vues.push(h.jours[jour][projet.id][1]);
  }
  assert.equal(new Set(vues).size, 7, 'aucune question répétée sur 7 jours');
  // Une fois toutes posées, on reprend la plus ancienne plutôt que de ne rien poser.
  questionsDuJour(config, h, '2026-10-12');
  assert.equal(h.jours['2026-10-12'][projet.id][1], vues[0]);
});

test('les questions du jour ne changent pas dans la journée', () => {
  const h = vide();
  const a = questionsDuJour(config, h, '2026-10-05').map((p) => p.questions.map((q) => q.id));
  const b = questionsDuJour(config, h, '2026-10-05').map((p) => p.questions.map((q) => q.id));
  assert.deepEqual(a, b);
});

test('enregistrer des réponses : valeurs contrôlées, vides ignorées, correction possible', () => {
  const h = vide();
  const maintenant = new Date('2026-10-05T10:00:00+02:00');
  const jour = jourParis(maintenant);
  const [nm] = questionsDuJour(config, h, jour);
  const note = `${nm.projet.id}:${nm.questions[0].id}`;
  const autre = `${nm.projet.id}:${nm.questions[1].id}`;
  assert.equal(enregistrerReponses(config, h, { [note]: '9', [autre]: '' }, maintenant), 0, 'note hors 1-5 refusée');
  assert.equal(enregistrerReponses(config, h, { [note]: '4', 'inconnu:x': 'bla' }, maintenant), 1);
  assert.equal(enregistrerReponses(config, h, { [note]: '5' }, maintenant), 1);
  assert.equal(h.reponses.length, 1, 'une correction remplace la réponse');
  assert.equal(h.reponses[0].reponse, 5);
  assert.equal(enAttente(config, h, jour), 13);
});

test('rappel du matin : une seule fois, après l’heure choisie', () => {
  const h = vide();
  assert.equal(rappelAEnvoyer(config, h, { heure: 9, maintenant: new Date('2026-10-05T08:30:00+02:00') }), null);
  const texte = rappelAEnvoyer(config, h, { heure: 9, maintenant: new Date('2026-10-05T09:10:00+02:00') });
  assert.match(texte, /14 petite\(s\) question\(s\)/);
  assert.equal(rappelAEnvoyer(config, h, { heure: 9, maintenant: new Date('2026-10-05T12:00:00+02:00') }), null);
});

test('la page affiche les questions et les réponses déjà données', () => {
  const h = vide();
  const maintenant = new Date();
  const jour = jourParis(maintenant);
  const [nm] = questionsDuJour(config, h, jour);
  enregistrerReponses(config, h, { [`${nm.projet.id}:${nm.questions[0].id}`]: '3' }, maintenant);
  const html = pageQuestions(config, h, { jour });
  assert.match(html, /13 question\(s\) sur 14/);
  assert.match(html, /value="3" checked/);
  assert.match(html, /Petites histoires vraies/);
});
