// Cambodge : la prospection d'emploi est à la main, mais la boîte Gmail de louis
// garde la trace de tout. L'automatisation n8n « CERVEAU - lecture Cambodge »
// (scripts/cambodge-n8n.py) renvoie les mails étiquetés « Cambodge » ; on en tire
// candidatures envoyées et réponses reçues.
import { createHash } from 'node:crypto';
import { jourDe } from './business.js';

export const ADRESSE_LOUIS = 'gougamwalid@gmail.com';

// Adresse secrète de l'automatisation (même calcul que scripts/cambodge-n8n.py).
export const cheminCambodge = (jeton) => `cerveau-cambodge-${createHash('sha256').update(`cambodge:${jeton}`).digest('hex').slice(0, 32)}`;

const texte = (v) => (v == null ? null : String(v));

export async function synchroniserCambodge(business, { url, jeton, delaiMs = 60_000, appel, maintenant = new Date() } = {}) {
  if (!appel && (!url || !jeton)) return { ignore: true };
  appel ??= () =>
    fetch(new URL(`/webhook/${cheminCambodge(jeton)}`, url), { signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
      if (!r.ok) throw new Error(`n8n répond ${r.status}`);
      return r.json();
    });
  const rep = await appel();
  const mails = (Array.isArray(rep) ? rep : [rep])
    .filter((m) => m && (m.id || m.From || m.from))
    .map((m) => {
      // Sortie « simplifiée » du nœud Gmail : les entêtes utiles au premier niveau.
      const de = texte(m.From ?? m.from) ?? '';
      const a = texte(m.To ?? m.to) ?? '';
      const date = m.date ?? m.Date ?? (m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null);
      return {
        jour: jourDe(date ? new Date(date).toISOString() : null),
        de: de.slice(0, 120),
        a: a.slice(0, 120),
        objet: (texte(m.Subject ?? m.subject) ?? '').slice(0, 200),
        extrait: (texte(m.snippet) ?? '').slice(0, 300),
        deMoi: de.toLowerCase().includes(ADRESSE_LOUIS),
      };
    })
    .sort((a, b) => ((b.jour ?? '') > (a.jour ?? '') ? 1 : -1));
  business.sources.cambodge = { maj: maintenant.toISOString(), mails };
  return { mails: mails.length };
}
