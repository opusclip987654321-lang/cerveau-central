// Leviaro : la prospection tourne dans leviaro-agent (hors n8n) et range tout dans
// une base SQLite. Le cerveau en lit une copie (lecture seule) chaque heure.
import { copyFile, mkdtemp, rm, access, readdir, readFile } from 'node:fs/promises';
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
    // Trouvées mais pas encore étudiées par l'agent (l'étude coûte de l'IA).
    aEtudier: un("select count(*) from companies where state = 'decouverte'"),
    aEtudierDepuis: jour(un("select min(created_at) from companies where state = 'decouverte'") || null),
    recommandations: un("select count(*) from agency_recs where status = 'proposee'"),
    coutMois: Math.round(un(`select coalesce(sum(amount_eur), 0) from costs where status = 'realise' and month = '${mois}'`) * 100) / 100,
    // Le détail pour la page du projet : qui a été prospecté, quels mails, quelles réponses.
    detail: detailLeviaro(db),
  };
}

// Si le schéma de leviaro-agent change, on perd le détail mais jamais les chiffres.
function detailLeviaro(db) {
  const tout = (sql) => db.prepare(sql).all();
  try {
    return {
      entreprises: tout('select c.name nom, c.city ville, c.sector secteur, c.state etat, c.created_at creee from companies c order by c.id desc limit 300').map((x) => ({ ...x, creee: jour(x.creee) })),
      messages: tout("select m.step etape, m.status etat, m.subject objet, m.sent_at envoye, m.created_at cree, coalesce(c.name, '?') entreprise from messages m left join companies c on c.id = m.company_id order by m.id desc limit 300").map((x) => ({ ...x, envoye: jour(x.envoye), cree: jour(x.cree) })),
      reponses: tout("select r.from_email de, r.subject objet, r.snippet extrait, r.category categorie, r.received_at recu, r.handled traitee, coalesce(c.name, '') entreprise from replies r left join companies c on c.id = r.company_id order by r.id desc limit 200").map((x) => ({ ...x, recu: jour(x.recu), traitee: Boolean(x.traitee) })),
    };
  } catch {
    return undefined;
  }
}

// Garde, jour par jour, le nombre de fiches en attente d'étude (dernière lecture du jour)
// pour voir si la file baisse ou s'accumule. 60 jours suffisent.
export function suivreFile(avant, jourCourant, valeur) {
  const file = { ...avant, [jourCourant]: valeur };
  return Object.fromEntries(Object.entries(file).sort(([a], [b]) => a.localeCompare(b)).slice(-60));
}

// Bilans de la semaine que l'agent dépose dans data/bilans/AAAA-MM-JJ.md (texte libre).
// On garde les 8 derniers, du plus récent au plus ancien.
export async function lireBilans(dossier) {
  const rep = path.join(dossier, 'bilans');
  const noms = await readdir(rep).catch(() => []);
  const fichiers = noms.filter((n) => /^\d{4}-\d{2}-\d{2}\.(md|txt)$/.test(n)).sort().reverse().slice(0, 8);
  const bilans = [];
  for (const n of fichiers) {
    const texte = await readFile(path.join(rep, n), 'utf8').catch(() => null);
    if (texte?.trim()) bilans.push({ jour: n.slice(0, 10), texte: texte.trim().slice(0, 8000) });
  }
  return bilans;
}

// Diagnostic que l'agent réécrit à chaque tour (15 min) dans data/diagnostic.json :
// mode, budget du mois et erreurs des dernières 24 h. Absent ou illisible : null.
export async function lireDiagnostic(dossier) {
  try {
    const d = JSON.parse(await readFile(path.join(dossier, 'diagnostic.json'), 'utf8'));
    const nb = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
    return {
      genere: d.genere_le ?? null,
      mode: d.mode ? String(d.mode).slice(0, 40) : null,
      depense: nb(d.budget?.depense_mois_eur),
      plafond: nb(d.budget?.plafond_eur),
      erreurs24h: Array.isArray(d.erreurs_24h) ? d.erreurs_24h.length : 0,
    };
  } catch {
    return null;
  }
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
      const avant = business.sources.leviaro?.fileEtude ?? {};
      business.sources.leviaro = extraireLeviaro(db, maintenant);
      business.sources.leviaro.fileEtude = suivreFile(avant, jourDe(maintenant.toISOString()), business.sources.leviaro.aEtudier);
      business.sources.leviaro.bilans = await lireBilans(dossier);
      business.sources.leviaro.diagnostic = await lireDiagnostic(dossier);
    } finally {
      db.close();
    }
    return { envois: business.sources.leviaro.envois.length };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
