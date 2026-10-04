// Vérifie la santé du serveur lui-même : disque, mémoire, charge.
import { statfs, readFile } from 'node:fs/promises';
import os from 'node:os';

export async function verifierDisque(verif, seuils) {
  const s = await statfs(verif.chemin ?? '/');
  const total = s.blocks * s.bsize;
  const libre = s.bavail * s.bsize;
  const pct = Math.round(((total - libre) / total) * 100);
  const detail = `${pct} % utilisé, ${go(libre)} libres`;
  if (pct >= seuils.disqueCritique) return { etat: 'panne', detail };
  if (pct >= seuils.disqueAttention) return { etat: 'attention', detail };
  return { etat: 'ok', detail };
}

export async function verifierMemoire(_verif, seuils, { meminfo } = {}) {
  let total = os.totalmem();
  let dispo = os.freemem();
  try {
    const texte = meminfo ?? (await readFile('/proc/meminfo', 'utf8'));
    const lire = (cle) => Number(texte.match(new RegExp(`^${cle}:\\s+(\\d+)`, 'm'))?.[1]) * 1024;
    if (lire('MemTotal')) total = lire('MemTotal');
    if (lire('MemAvailable')) dispo = lire('MemAvailable');
  } catch {}
  const pct = Math.round(((total - dispo) / total) * 100);
  const detail = `${pct} % utilisée, ${go(dispo)} disponibles`;
  if (pct >= seuils.memoireAttention) return { etat: 'attention', detail };
  return { etat: 'ok', detail };
}

export async function verifierCharge(_verif, seuils, { charge, coeurs } = {}) {
  const c15 = charge ?? os.loadavg()[2];
  const n = coeurs ?? os.availableParallelism();
  const parCoeur = c15 / n;
  const detail = `${Math.round(parCoeur * 100)} % sur 15 min (${n} cœurs)`;
  if (parCoeur >= seuils.chargeParCoeurAttention) return { etat: 'attention', detail };
  return { etat: 'ok', detail };
}

function go(octets) {
  return `${(octets / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
}
