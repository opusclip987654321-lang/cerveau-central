import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { synchroniserStripe, encaissePeriode } from '../src/stripe.js';
import { tableauDeBord, joursJusqua } from '../src/business.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journalVide = () => ({ evenements: [], n8n: { jours: {}, instances: {} } });
const ts = (iso) => Math.floor(Date.parse(iso) / 1000);

function fauxStripe() {
  const pages = [];
  const appel = async (chemin, params) => {
    pages.push({ chemin, params });
    if (chemin === 'balance_transactions') {
      if (!params.starting_after)
        return { has_more: true, data: [
          { id: 'txn1', type: 'charge', net: 2850, currency: 'eur', created: ts('2026-10-04T10:00:00Z') },
          { id: 'txn2', type: 'stripe_fee', net: -100, currency: 'eur', created: ts('2026-10-04T10:00:00Z') },
        ] };
      return { has_more: false, data: [
        { id: 'txn3', type: 'refund', net: -950, currency: 'eur', created: ts('2026-10-02T10:00:00Z') },
        { id: 'txn4', type: 'charge', net: 1000, currency: 'usd', created: ts('2026-10-03T10:00:00Z') },
      ] };
    }
    if (chemin === 'subscriptions')
      return { has_more: false, data: [
        { id: 's1', status: 'active', trial_end: null, items: { data: [{ quantity: 1, price: { unit_amount: 4900, recurring: { interval: 'month', interval_count: 1 } } }] } },
        { id: 's2', status: 'active', trial_end: null, items: { data: [{ quantity: 1, price: { unit_amount: 46800, recurring: { interval: 'year' } } }] } },
      ] };
    throw new Error(`appel inattendu : ${chemin}`);
  };
  return { appel, pages };
}

test('synchroniserStripe : encaissements nets, pagination, abonnements et €/mois', async () => {
  const b = { sources: {}, objectifs: {} };
  const { appel, pages } = fauxStripe();
  const r = await synchroniserStripe(b, { appel, maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.deepEqual(r, { encaissements: 3, abonnements: 2 });
  assert.equal(pages.filter((p) => p.chemin === 'balance_transactions').length, 2);
  const st = b.sources.stripe;
  assert.deepEqual(st.encaissements[0], { jour: '2026-10-04', montant: 28.5, devise: 'EUR' });
  assert.equal(st.abonnements.actifs, 2);
  assert.equal(st.abonnements.parMois, 88); // 49 + 468/12
  assert.deepEqual(encaissePeriode(st, joursJusqua('2026-10-05', 7)), { EUR: 19, USD: 10 });
  assert.deepEqual(await synchroniserStripe({ sources: {} }, {}), { ignore: true });
});

test('carte Nūr Meet : abonnements payés et encaissé quand Stripe est branché', async () => {
  const b = { sources: { prospection: { maj: 'x', prospects: [], envois: [{ statut: 'envoye', jour: '2026-10-04', nom: 'A', objet: 'o' }], ouvertures: [] } }, objectifs: {} };
  const { appel } = fauxStripe();
  await synchroniserStripe(b, { appel, maintenant: new Date('2026-10-05T12:00:00Z') });
  const c = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'nour-meet');
  const titres = c.chiffres.map((x) => x.titre);
  assert.ok(titres.includes('Abonnements payés'));
  assert.equal(c.chiffres.find((x) => x.titre === 'Abonnements payés').detail, '88 €/mois');
  assert.match(c.chiffres.find((x) => x.titre.startsWith('Encaissé')).valeur, /19 € \+ 10 USD/);
  assert.deepEqual(c.manque, ['rendez-vous / démos']);
});
