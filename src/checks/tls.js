// Vérifie la date d'expiration du certificat HTTPS d'un site.
import tls from 'node:tls';

export function lireExpiration(hote, port = 443, { delaiMs = 10_000, ca } = {}) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hote, port, servername: hote, ca, rejectUnauthorized: false, timeout: delaiMs }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) return reject(new Error('aucun certificat'));
      resolve({ expire: new Date(cert.valid_to), valide: socket.authorized, erreur: socket.authorizationError });
    });
    socket.on('timeout', () => socket.destroy(new Error('pas de réponse')));
    socket.on('error', reject);
  });
}

export async function verifierCertificat(verif, seuils, options) {
  let info;
  try {
    info = await lireExpiration(verif.hote, verif.port ?? 443, options);
  } catch (err) {
    return { etat: 'panne', detail: `certificat illisible (${err.code ?? err.message})` };
  }
  const jours = Math.floor((info.expire - Date.now()) / 86_400_000);
  if (jours < 0) return { etat: 'panne', detail: `expiré depuis ${-jours} jour(s)` };
  if (!info.valide && !options?.ignorerConfiance) return { etat: 'panne', detail: `certificat refusé (${info.erreur})` };
  if (jours < seuils.certificatJoursCritique) return { etat: 'panne', detail: `expire dans ${jours} jour(s)` };
  if (jours < seuils.certificatJoursAttention) return { etat: 'attention', detail: `expire dans ${jours} jours` };
  return { etat: 'ok', detail: `valide encore ${jours} jours` };
}
