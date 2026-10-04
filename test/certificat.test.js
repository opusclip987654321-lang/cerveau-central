import { test } from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifierCertificat } from '../src/checks/tls.js';

const seuils = { certificatJoursAttention: 14, certificatJoursCritique: 3 };

async function serveurAvecCertificat(jours) {
  const dossier = await mkdtemp(path.join(tmpdir(), 'cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-days', String(jours),
    '-keyout', path.join(dossier, 'cle.pem'), '-out', path.join(dossier, 'cert.pem')], { stdio: 'ignore' });
  const cert = await readFile(path.join(dossier, 'cert.pem'));
  const serveur = tls.createServer({ key: await readFile(path.join(dossier, 'cle.pem')), cert }, (s) => s.end());
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  return { port: serveur.address().port, cert, fermer: async () => { serveur.close(); await rm(dossier, { recursive: true }); } };
}

let openssl = true;
try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); } catch { openssl = false; }

test('certificat : ok, bientôt expiré, non reconnu', { skip: !openssl && 'openssl absent' }, async () => {
  const long = await serveurAvecCertificat(90);
  const court = await serveurAvecCertificat(10);
  try {
    const verif = (s) => ({ hote: 'localhost', port: s.port });
    const ok = await verifierCertificat(verif(long), seuils, { ca: long.cert });
    assert.equal(ok.etat, 'ok');
    assert.match(ok.detail, /valide encore (89|90) jours/);
    assert.equal((await verifierCertificat(verif(court), seuils, { ca: court.cert })).etat, 'attention');
    const inconnu = await verifierCertificat(verif(long), seuils);
    assert.equal(inconnu.etat, 'panne');
    assert.match(inconnu.detail, /refusé/);
  } finally {
    await long.fermer();
    await court.fermer();
  }
});
