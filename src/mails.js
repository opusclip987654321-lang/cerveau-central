// Rendre les mails lisibles sans rien inventer : regroupement par journée,
// exemple stable du jour, détection des réponses automatiques, lien messagerie.
import { createHash } from 'node:crypto';

// Regroupe des éléments par jour (clé extractible), du plus récent au plus ancien.
export function grouperParJour(items, cle = (x) => x.jour) {
  const jours = new Map();
  for (const x of items) {
    const j = cle(x);
    if (!j) continue;
    if (!jours.has(j)) jours.set(j, []);
    jours.get(j).push(x);
  }
  return [...jours.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
}

// L'exemple du jour est tiré « au hasard » mais de façon stable : le même jour
// redonne toujours le même indice, même après rechargement (haché sur le jour).
export function exempleDuJour(jour, n) {
  return n ? parseInt(createHash('sha256').update(`exemple:${jour}`).digest('hex').slice(0, 8), 16) % n : -1;
}

// Une réponse automatique probable (absence, accusé, erreur de livraison) n'est
// pas une vraie réponse à traiter. C'est une détection par mots-clés : « probable ».
export const reponseAutomatique = (r) =>
  /r[ée]ponse automatique|accus[ée] de r[ée]ception|out of (the )?office|absen[ct]|automatic reply|auto[- ]?reply|ne pas r[ée]pondre|no[- ]?reply|undeliver|mailer-daemon|delivery (status|failure)|address not found/i.test(
    `${r.objet ?? ''} ${String(r.texte ?? '').slice(0, 300)}`,
  );

// Chercher l'échange dans Gmail, faute d'avoir le texte copié dans le cerveau.
export const lienGmail = (recherche) => `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(String(recherche ?? '').trim())}`;
