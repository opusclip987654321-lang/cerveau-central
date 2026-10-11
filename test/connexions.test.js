import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONNEXIONS, etatConnexions, noterTentative, resumeConnexions } from '../src/connexions.js';
import { pageConnexions } from '../src/page-connexions.js';
import { pageEtat } from '../src/page.js';

const maintenant = new Date('2026-10-11T12:00:00Z');

test('etatConnexions : branchée, silencieuse, en erreur, pas branchée ; jamais une clé', () => {
  const business = {
    sources: {
      prospection: { maj: '2026-10-11T11:00:00Z' },
      youtube: { maj: '2026-10-08T11:00:00Z' },
    },
  };
  noterTentative(business, 'stripe', { erreur: 'Stripe répond 401 (clé refusée)', maintenant });
  noterTentative(business, 'vegebudget', { ignore: true, maintenant });
  noterTentative(business, 'histoires', { maintenant });
  const liste = etatConnexions({ business, journal: { n8n: { jours: {}, instances: {} } }, serveurs: { serveurs: {} }, maintenant });
  const par = Object.fromEntries(liste.map((c) => [c.id, c]));
  assert.equal(par.prospection.etat, 'ok');
  assert.equal(par.youtube.etat, 'silence');
  assert.match(par.youtube.detail, /depuis 3 jours/);
  assert.equal(par.stripe.etat, 'erreur');
  assert.match(par.stripe.detail, /401/);
  assert.equal(par.vegebudget.etat, 'pas-branche');
  assert.match(par.vegebudget.detail, /clé ou accès absent/);
  assert.equal(par.histoires.etat, 'ok'); // une tentative réussie vaut lecture
  assert.equal(par['n8n-principal'].etat, 'pas-branche');
  assert.equal(liste.length, CONNEXIONS.length);
  assert.deepEqual(resumeConnexions(liste), { ok: 2, silence: 1, erreur: 1, pasBranche: CONNEXIONS.length - 4, total: CONNEXIONS.length });
  // Aucune valeur de clé ne transite : seulement des noms de variables.
  assert.ok(CONNEXIONS.every((c) => !/[A-Za-z0-9_-]{32,}/.test(c.besoin)));

  const html = pageConnexions(liste, { nomProjet: (id) => ({ 'nour-meet': 'Nūr Meet' })[id] ?? id });
  assert.match(html, /1 connexion\(s\) en erreur/);
  assert.match(html, /Stripe répond 401/);
  assert.match(html, /Pour la brancher :<\/b> VEGEBUDGET_STATS_JETON/);
  assert.match(html, /Reste à brancher/);
  assert.match(html, /Umami/);
  assert.match(html, /class="actif" data-s="⚡">Connexions/);
  // L'erreur passe devant le reste.
  assert.ok(html.indexOf('Stripe') < html.indexOf('Prospection Nūr Meet'));
});

test('Surveillance : seulement le rouge devant, en mots simples, avec le schéma et la fiche', () => {
  const config = { projets: [{ id: 'nour-meet', nom: 'Nūr Meet' }, { id: 'n8n', nom: 'n8n (automatisations)' }], intervalleMinutes: 180 };
  const etat = {
    derniereVerification: '2026-10-11T11:00:00Z',
    verifications: {
      'n8n/x': { projet: 'n8n', etat: 'panne', nom: 'n8n (automatisations)', detail: '2 exécution(s) en erreur : NM3 Envoi des emails', sens: 'L’envoi des mails de prospection a planté 2 fois.', depuis: '2026-10-11T09:00:00Z' },
      site: { projet: 'nour-meet', etat: 'ok', nom: 'Site nourmeet.com', detail: 'répond en 120 ms' },
    },
    historique: [],
  };
  const html = pageEtat(config, etat, 0, { actions: [{ id: 'abc', cle: 'panne:n8n/x', statut: 'reponse_a_analyser' }] });
  assert.match(html, /Ce qui est en panne/);
  assert.match(html, /⛔ L’envoi des mails de prospection a planté 2 fois\./);
  assert.match(html, /class="etape-p bloquee">Écrire et envoyer le mail/);
  assert.match(html, /href="\/action\?id=abc">Ouvrir la fiche ›/);
  assert.match(html, /Le détail des 2 contrôles/);
  // Le vert est replié, pas en tête.
  assert.ok(html.indexOf('Ce qui est en panne') < html.indexOf('Site nourmeet.com'));
  const calme = pageEtat(config, { ...etat, verifications: { site: etat.verifications.site } }, 0, {});
  assert.match(calme, /Rien en panne/);
});
