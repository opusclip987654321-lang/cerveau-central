import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expliquer, expliquerAncien } from '../src/sens.js';

test('erreurs n8n de L’extrait politique : la tâche et la conséquence en clair', () => {
  const r = expliquerAncien({ projet: 'n8n (automatisations)', verification: 'Exécutions en erreur (n8n.actualitevideo.fr)', type: 'evenement', detail: '2 exécution(s) en erreur : ALERTES - Erreurs, VEILLE 1 - Détection des moments forts' });
  assert.equal(r.pour, 'L’extrait politique');
  assert.match(r.texte, /repérage des moments forts/);
  assert.match(r.texte, /a planté 2 fois/);
  assert.match(r.texte, /moins de sujets pour les vidéos du jour/);
});

test('erreurs n8n principal : rangées par projet d’après le nom', () => {
  const r = expliquer({ nom: 'n8n' }, { type: 'n8n' }, { etat: 'attention', detail: '…', erreurs: [{ workflow: 'IMPACTEUR C - ENVOIS AUTOMATIQUES' }] });
  assert.equal(r.pour, 'Impacteur');
  assert.match(r.texte, /envoi des mails de prospection a planté une fois/);
});

test('certificat illisible, site lent, site en panne, rétabli', () => {
  assert.match(expliquerAncien({ projet: 'Leviaro', verification: 'Certificat leviaro.fr', type: 'panne', detail: 'certificat illisible (EAI_AGAIN)' }).texte, /cadenas de sécurité de leviaro\.fr.*souci réseau passager/);
  const lent = expliquerAncien({ projet: 'n8n (automatisations)', verification: 'n8n.nourmeet.com', type: 'attention', detail: 'lent (5.4 s)' });
  assert.equal(lent.pour, 'Nūr Meet et Impacteur');
  assert.match(lent.texte, /répondent lentement/);
  const site = expliquer({ nom: 'Nūr Meet' }, { type: 'site', nom: 'API (base de données comprise)', url: 'https://api.nourmeet.com/health/ready' }, { etat: 'panne', detail: 'répond 502' });
  assert.match(site.texte, /inscriptions, réservations et paiements ne marchent plus/);
  assert.equal(expliquerAncien({ projet: 'Leviaro', verification: 'Certificat leviaro.fr', type: 'retabli', detail: 'valide encore 88 jours' }).texte, 'Revenu à la normale, rien à faire.');
  assert.match(expliquer({ nom: 'Nūr Meet' }, { type: 'certificat', hote: 'nourmeet.com' }, { etat: 'attention', detail: 'expire dans 10 jours' }).texte, /expire dans 10 jours/);
});
