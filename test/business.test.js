import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { jourDe, synchroniserProspection, tableauDeBord, messageSilences, validerObjectif, proposerObjectif, joursJusqua } from '../src/business.js';
import { pageJournal } from '../src/page-journal.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journalVide = () => ({ evenements: [], n8n: { jours: {}, instances: {} } });

test('jourDe lit les dates n8n, françaises et vides', () => {
  assert.equal(jourDe('2026-09-26T14:42:01.563Z'), '2026-09-26');
  assert.equal(jourDe('2026-10-04T23:30:00Z'), '2026-10-05'); // minuit passé à Paris
  assert.equal(jourDe('05/10/2026'), '2026-10-05');
  assert.equal(jourDe(''), null);
  assert.equal(jourDe(null), null);
  assert.equal(jourDe('pas une date'), null);
});

// Faux n8n : les tableaux np_* avec quelques lignes, paginés par 2.
function fauxN8n(tables) {
  const appels = [];
  const appel = async (chemin) => {
    appels.push(chemin);
    if (chemin.startsWith('/api/v1/data-tables?')) return { data: Object.keys(tables).map((name, i) => ({ id: `t${i}`, name })) };
    const m = chemin.match(/data-tables\/t(\d+)\/rows\?limit=250(?:&cursor=(\d+))?/);
    const lignes = Object.values(tables)[Number(m[1])];
    const debut = Number(m[2] ?? 0);
    return { data: lignes.slice(debut, debut + 2), nextCursor: debut + 2 < lignes.length ? String(debut + 2) : null };
  };
  return { appel, appels };
}

const P = (statut, extra = {}) => ({ statut, email: 'x@y.fr', date_decouverte: '2026-09-20T10:00:00Z', ...extra });

test('synchroniserProspection lit tout, page par page, sans les tests ni les doublons d’ouverture', async () => {
  const { appel } = fauxN8n({
    np_prospects: [
      P('contacte', { date_premier_envoi: '2026-10-01T09:00:00Z' }),
      P('repondu', { date_premier_envoi: '2026-09-29T09:00:00Z', date_reponse: '2026-10-02T09:00:00Z' }),
      P('sans_email', { email: null }),
      P('repondu', { email: 'resa@didon.fr', nom: 'Didon', ville: 'Paris', date_reponse: '2026-10-05T08:00:00Z' }),
      P('test'),
      P('propose'),
    ],
    np_envois: [
      { statut: 'envoye', date_decision: '2026-10-01T09:00:00Z' },
      { statut: 'envoye', date_decision: '2026-09-29T09:00:00Z' },
      { statut: 'echec', date_proposition: '2026-10-03T09:00:00Z' },
      { statut: 'test', date_decision: '2026-10-03T09:00:00Z' },
    ],
    np_ouvertures: [
      { envoi_id: 1, date: '2026-10-01T10:00:00Z' },
      { envoi_id: 1, date: '2026-10-02T10:00:00Z' },
      { envoi_id: 2, date: '2026-10-03T10:00:00Z' },
    ],
    np_reponses: [
      { email: 'RESA@didon.fr', de: 'Didon <resa@didon.fr>', objet: 'Re: Vos soirées', texte: 'Oui, rappelez-nous.', recu: '2026-10-05T08:30:00Z' },
      { email: 'inconnu@resto.fr', de: 'Quelqu’un', objet: 'Re', texte: 'Qui êtes-vous ?', recu: '2026-10-04T08:30:00Z' },
    ],
  });
  const b = { sources: {}, objectifs: {} };
  const r = await synchroniserProspection(b, { appel, maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.equal(r.prospects, 5);
  const pr = b.sources.prospection;
  assert.deepEqual(pr.envois.map((e) => [e.statut, e.jour]), [['envoye', '2026-10-01'], ['envoye', '2026-09-29'], ['echec', '2026-10-03']]);
  assert.deepEqual(pr.ouvertures.sort(), ['2026-10-01', '2026-10-03']);
  assert.equal(pr.prospects.find((x) => x.statut === 'repondu').reponse, '2026-10-02');
  // Le texte des réponses est rattaché au bon restaurant via l'adresse, même écrite autrement.
  assert.deepEqual(pr.reponses.map((x) => [x.nom, x.texte]), [['Didon', 'Oui, rappelez-nous.'], [null, 'Qui êtes-vous ?']]);
  assert.equal(pr.reponses[0].ville, 'Paris');
});

test('synchroniserProspection : sans clé on ne fait rien, sans tableau on le dit', async () => {
  assert.deepEqual(await synchroniserProspection({ sources: {} }, {}), { ignore: true });
  await assert.rejects(synchroniserProspection({ sources: {} }, { appel: async () => ({ data: [] }) }), /np_prospects introuvable/);
});

const jour = '2026-10-05';
function businessExemple() {
  const prospects = [];
  for (let i = 0; i < 6; i++) prospects.push({ statut: 'sans_email', email: false, decouvert: '2026-10-04' });
  prospects.push({ statut: 'propose', email: true, decouvert: '2026-10-04' });
  prospects.push({ statut: 'contacte', email: true, premier: '2026-10-03', reponse: '2026-10-04' });
  const envois = [
    ...Array(8).fill({ statut: 'envoye', jour: '2026-10-03' }),
    ...Array(2).fill({ statut: 'envoye', jour: '2026-09-27' }),
    ...Array(2).fill({ statut: 'echec', jour: '2026-10-03' }),
  ];
  return { sources: { prospection: { maj: '2026-10-05T11:00:00Z', prospects, envois, ouvertures: ['2026-10-03', '2026-10-04'] } }, objectifs: {} };
}

test('tableauDeBord : chiffres de prospection Nūr Meet sur 7 jours', () => {
  const t = tableauDeBord({ business: businessExemple(), journal: journalVide(), configJournal, jour });
  assert.deepEqual(t.periode, joursJusqua(jour, 7));
  const n = t.cartes.find((c) => c.id === 'nour-meet');
  assert.equal(n.principal.total, 8);
  assert.equal(n.principal.precedent, 2);
  assert.equal(n.principal.serie[4], 8); // le 3 octobre
  assert.equal(n.chiffres[0].valeur, 1); // une réponse
  assert.equal(n.chiffres[1].valeur, 2); // deux mails ouverts
  assert.equal(n.couleur, 'orange'); // 20 % d'échecs
  assert.ok(n.aDecider.some((t) => /1 mail\(s\) préparés ne sont jamais partis/.test(t)));
  assert.ok(n.aDecider.some((t) => /6 restaurants trouvés n'ont pas d'email \(75 %\)/.test(t)));
  assert.ok(n.aDecider.some((t) => /20 % des envois échouent/.test(t)));
  assert.equal(n.objectif.propose, 3); // 10 envois sur 4 semaines → 2,5/semaine × 1,2
  assert.deepEqual(n.manque, ['rendez-vous / démos', 'abonnements payés (Stripe)']);
});

test('tableauDeBord : rouge quand rien depuis trop longtemps, pause respectée', () => {
  const b = businessExemple();
  b.sources.prospection.envois = [{ statut: 'envoye', jour: '2026-09-28' }];
  let t = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour });
  const n = t.cartes.find((c) => c.id === 'nour-meet');
  assert.equal(n.couleur, 'rouge');
  assert.equal(n.silence, 7);
  assert.match(n.aDecider[0], /Plus aucun mail envoyé depuis 7 jours/);
  assert.match(messageSilences(t), /Nūr Meet : aucun mail envoyé depuis 7 jours/);
  t = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour, pauses: { projets: { 'nour-meet': {} } } });
  assert.equal(t.cartes.find((c) => c.id === 'nour-meet').couleur, 'pause');
});

test('tableauDeBord : vidéos de L’extrait politique comptées sur l’automatisation de publication', () => {
  const j = journalVide();
  j.n8n.jours['2026-10-04'] = { 'PUBLICATION YouTube': { ok: 3, erreur: 0 }, 'VEILLE actu': { ok: 40, erreur: 0 } };
  j.n8n.instances = { 'PUBLICATION YouTube': 'actualite', 'VEILLE actu': 'actualite' };
  j.evenements.push({ projet: 'histoires-vraies', type: 'video', jour: '2026-10-04', titre: 'Vidéo à la main' });
  const t = tableauDeBord({ business: { sources: {}, objectifs: {} }, journal: j, configJournal, jour });
  const x = t.cartes.find((c) => c.id === 'extrait-politique');
  assert.equal(x.principal.total, 3);
  assert.equal(x.couleur, 'vert');
  assert.equal(t.cartes.find((c) => c.id === 'histoires-vraies').principal.total, 1);
  assert.match(t.cartes.find((c) => c.id === 'nour-meet').manque[0], /pas encore faite/);
});

test('objectif validé : pourcentage atteint et couleur', () => {
  const b = businessExemple();
  assert.equal(validerObjectif(b, 'nour-meet', 'abc').erreur, 'Objectif invalide.');
  assert.ok(validerObjectif(b, 'nour-meet', '40').ok);
  const n = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour }).cartes.find((c) => c.id === 'nour-meet');
  assert.equal(n.objectif.valide, 40);
  assert.equal(n.principal.objectif, 40);
  assert.equal(proposerObjectif(0), 1);
});

test('page Journal : tableau de bord en tête, détail technique replié', () => {
  const html = pageJournal(configJournal, journalVide(), { jour, business: businessExemple() });
  assert.match(html, /Tableau de bord/);
  assert.match(html, /<a href="\/projet\?projet=nour-meet">Nūr Meet<\/a><\/h3><span class="statut orange">à surveiller<\/span>/);
  assert.match(html, /À décider/);
  assert.match(html, /action="\/journal\/objectif"/);
  assert.match(html, /<svg viewBox/);
  assert.match(html, /<details class="technique">/);
  assert.match(html, /Pas encore branché : rendez-vous \/ démos/);
  assert.ok(html.indexOf('Tableau de bord') < html.indexOf('Détail technique'));
});

test('projet pas encore branché et sans note : gris, sans alerte ni objectif', () => {
  const t = tableauDeBord({ business: businessExemple(), journal: journalVide(), configJournal, jour });
  const l = t.cartes.find((c) => c.id === 'cambodge');
  assert.equal(l.couleur, 'gris');
  assert.deepEqual(l.aDecider, []);
  const html = pageJournal(configJournal, journalVide(), { jour, business: businessExemple() });
  assert.match(html, /Emploi Cambodge<\/a><\/h3><span class="statut gris">données manquantes<\/span>/);
  assert.ok(html.indexOf('<a href="/projet?projet=cambodge">Emploi Cambodge</a>') > html.indexOf('>Nūr Meet</a>'));
});

test('Impacteur : lecture du Sheet via n8n et carte', async () => {
  const { synchroniserImpacteur, cheminImpacteur } = await import('../src/business.js');
  assert.match(cheminImpacteur('abc'), /^cerveau-impacteur-[0-9a-f]{32}$/);
  const lignes = [
    { statut: 'CONFIG' },
    { statut: 'ENVOYE', chaine: 'Afrique', date_envoi: '2026-10-03T10:00:00Z', ouvert_le: '2026-10-04T08:00:00Z' },
    { statut: 'ENVOYE', chaine: 'Frexit', date_envoi: '2026-09-01T10:00:00Z', ouvert_le: '' },
    { statut: 'A_VERIFIER' },
    { statut: 'A_VERIFIER' },
    { statut: 'BROUILLON_CREE' },
    { statut: 'A_VERIFIER_DECES' },
  ];
  const b = { sources: {}, objectifs: {} };
  assert.deepEqual(await synchroniserImpacteur(b, { appel: async () => lignes }), { fiches: 6 });
  const c = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour }).cartes.find((x) => x.id === 'impacteur');
  assert.equal(c.principal.total, 1);
  assert.equal(c.chiffres[0].valeur, 1);
  assert.match(c.chiffres[0].detail, /50 % ouverts/);
  assert.equal(c.chiffres[1].valeur, 3);
  assert.equal(c.chiffres[2].detail, '1 Afrique, 1 Frexit');
  assert.ok(c.aDecider.some((t) => /2 fiche\(s\) d'invités attendent ta vérification/.test(t)));
  assert.ok(c.aDecider.some((t) => /1 brouillon/.test(t)));
  assert.ok(c.aDecider.some((t) => /décédé/.test(t)));
  assert.notEqual(c.couleur, 'gris');
  assert.deepEqual(await synchroniserImpacteur({ sources: {} }, {}), { ignore: true });
});
