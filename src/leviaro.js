// Leviaro : la prospection tourne dans leviaro-agent (hors n8n) et range tout dans
// une base SQLite. Le cerveau en lit une copie (lecture seule) chaque heure.
import { copyFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { jourDe } from './business.js';

// SQLite écrit « 2026-10-05 08:12:00 » en heure UTC, sans le dire.
const utc = (t) => (t && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(t) ? `${t.replace(' ', 'T')}Z` : t);
const jour = (t) => jourDe(utc(t));

// Extrait de la base ce qui sert au tableau de bord.
export function extraireLeviaro(db, maintenant = new Date()) {
  const tout = (sql) => db.prepare(sql).all();
  const un = (sql) => Object.values(db.prepare(sql).get() ?? {})[0] ?? 0;
  const mois = maintenant.toISOString().slice(0, 7);
  return {
    maj: maintenant.toISOString(),
    // Mails réellement partis : step 0 = premier contact, 1 et 2 = relances.
    envois: tout("select step, sent_at from messages where status = 'envoye' and sent_at is not null").map((m) => ({ etape: m.step, jour: jour(m.sent_at) })),
    echecs: tout("select created_at from messages where status = 'erreur_permanente'").map((m) => jour(m.created_at)),
    // Réponses de vraies personnes (pas les absences ni les erreurs techniques).
    reponses: tout("select received_at, handled from replies where category = 'humaine'").map((r) => ({ jour: jour(r.received_at), traitee: Boolean(r.handled) })),
    oppositions: un("select count(*) from replies where category = 'opposition'"),
    entreprises: tout('select created_at from companies').map((c) => jour(c.created_at)),
    aValider: un("select count(*) from messages where status = 'attente_validation'"),
    sansContact: un("select count(*) from companies where state = 'contact_introuvable'"),
    enDiscussion: un("select count(*) from companies where state = 'discussion_active'"),
    recommandations: un("select count(*) from agency_recs where status = 'proposee'"),
    coutMois: Math.round(un(`select coalesce(sum(amount_eur), 0) from costs where status = 'realise' and month = '${mois}'`) * 100) / 100,
  };
}

// Copie la base (et ses fichiers -wal/-shm) puis la lit : on ne touche jamais l'originale.
export async function synchroniserLeviaro(business, dossier, { maintenant = new Date() } = {}) {
  const source = path.join(dossier, 'leviaro.db');
  try {
    await access(source);
  } catch {
    return { ignore: true };
  }
  const tmp = await mkdtemp(path.join(tmpdir(), 'leviaro-'));
  try {
    for (const ext of ['', '-wal', '-shm']) await copyFile(source + ext, path.join(tmp, `leviaro.db${ext}`)).catch((err) => {
      if (ext === '') throw err;
    });
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(tmp, 'leviaro.db'));
    try {
      business.sources.leviaro = extraireLeviaro(db, maintenant);
    } finally {
      db.close();
    }
    return { envois: business.sources.leviaro.envois.length };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
