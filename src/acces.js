// Protection de la page par mot de passe.
// Le mot de passe n'est jamais stocké en clair : seulement son empreinte (scrypt) dans .env.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const DUREE_SESSION_MS = 30 * 86_400_000;
const ESSAIS_MAX = 5;
const BLOCAGE_MS = 15 * 60_000;

export function empreinte(motDePasse, sel = randomBytes(16).toString('hex')) {
  return `scrypt:${sel}:${scryptSync(motDePasse, sel, 32).toString('hex')}`;
}

export function verifierMotDePasse(motDePasse, reference) {
  const [algo, sel, attendu] = String(reference ?? '').split(':');
  if (algo !== 'scrypt' || !sel || !attendu) return false;
  const calcule = scryptSync(String(motDePasse), sel, 32);
  const voulu = Buffer.from(attendu, 'hex');
  return voulu.length === calcule.length && timingSafeEqual(voulu, calcule);
}

export function creerAcces({ empreinteMotDePasse, secret, maintenant = () => Date.now() }) {
  const signer = (texte) => createHmac('sha256', secret).update(texte).digest('base64url');
  const echecs = new Map();

  return {
    actif: Boolean(empreinteMotDePasse),

    jeton() {
      const expire = String(maintenant() + DUREE_SESSION_MS);
      return `${expire}.${signer(expire)}`;
    },

    jetonValide(jeton) {
      const [expire, signature] = String(jeton ?? '').split('.');
      if (!expire || !signature) return false;
      const attendu = Buffer.from(signer(expire));
      const recu = Buffer.from(signature);
      return attendu.length === recu.length && timingSafeEqual(attendu, recu) && Number(expire) > maintenant();
    },

    // Renvoie 'ok', 'faux' ou 'bloque' (trop d'essais depuis cette adresse).
    essayer(ip, motDePasse) {
      const e = echecs.get(ip);
      if (e && e.bloqueJusqua > maintenant()) return 'bloque';
      if (verifierMotDePasse(motDePasse, empreinteMotDePasse)) {
        echecs.delete(ip);
        return 'ok';
      }
      const n = (e && e.bloqueJusqua > 0 && e.bloqueJusqua <= maintenant() ? 0 : e?.n ?? 0) + 1;
      echecs.set(ip, { n, bloqueJusqua: n >= ESSAIS_MAX ? maintenant() + BLOCAGE_MS : 0 });
      return n >= ESSAIS_MAX ? 'bloque' : 'faux';
    },
  };
}

export function lireCookie(req, nom) {
  for (const morceau of (req.headers.cookie ?? '').split(';')) {
    const [cle, ...valeur] = morceau.trim().split('=');
    if (cle === nom) return decodeURIComponent(valeur.join('='));
  }
  return undefined;
}

export function pageConnexion(message) {
  const e = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cerveau central</title>
<style>
:root { --fond:#f6f5f2; --carte:#fff; --texte:#1d1d1b; --doux:#6b6a66; --bord:#e4e2dc; --panne:#c2332b; }
@media (prefers-color-scheme: dark) { :root { --fond:#151514; --carte:#1f1f1d; --texte:#ecebe7; --doux:#9b9a95; --bord:#33322f; --panne:#f06a5f; } }
body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--fond); color:var(--texte); font:15px/1.45 system-ui, sans-serif; padding:16px; box-sizing:border-box; }
form { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:24px; width:100%; max-width:340px; }
h1 { font-size:20px; margin:0 0 16px; }
input, button { font:inherit; width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
button { margin-top:12px; background:var(--texte); color:var(--fond); border-color:var(--texte); font-weight:600; cursor:pointer; }
p { color:var(--panne); margin:10px 0 0; font-size:14px; }
</style></head>
<body><form method="post" action="/connexion">
<h1>🧠 Cerveau central</h1>
<input type="password" name="motDePasse" placeholder="Mot de passe" autocomplete="current-password" autofocus required>
<button type="submit">Entrer</button>
${message ? `<p>${e(message)}</p>` : ''}
</form></body></html>`;
}
