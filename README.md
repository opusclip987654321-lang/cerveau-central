# Cerveau central

Surveille les projets de louis, le prévient sur Telegram quand quelque chose casse ou se répare, et affiche une page d'état.

C'est l'**étape 2** du cahier des charges : « Est-ce que tout tourne ? ». Le cerveau **ne corrige rien** : il observe et prévient.

## Ce qu'il fait

- Vérifie toutes les 3 heures que tout tourne, et prévient sur Telegram.
- Envoie chaque matin un résumé sur Telegram : état des projets, incidents des dernières 24 h, questions du jour.
- Pose 3 questions par jour et par projet sur la page.

## Ce qu'il vérifie

| Projet | Vérifications |
|---|---|
| Nūr Meet | le site répond, l'API et sa base de données répondent (`/health/ready`), certificats HTTPS |
| Leviaro | le site et l'admin répondent, certificats HTTPS |
| n8n | n8n répond (`/healthz`), certificat, et (avec une clé API en lecture) les exécutions tombées en erreur, avec le nom de l'automatisation |
| Serveur OVH | espace disque, mémoire, charge du processeur |

La liste se modifie dans [`config/surveillance.json`](config/surveillance.json), sans toucher au code.

Règles des alertes :

- 🔴 **panne** : le site ne répond pas, répond une erreur, certificat expiré ou à moins de 3 jours, disque plein à 95 %.
- 🟠 **à surveiller** : site lent (plus de 4 s), certificat à moins de 14 jours, disque à 85 %, mémoire à 90 %, nouvelles erreurs n8n.
- 🟢 **rétabli** : avec la durée de la panne.
- Un site qui rate une fois est revérifié 30 secondes plus tard avant d'alerter (pas de fausse alerte pour un raté passager).
- Une seule alerte par panne : pas de répétition tant qu'elle dure.

## Questions du jour

Chaque jour, l'onglet « Questions du jour » pose 3 questions par projet (les 7 projets) : une note sur 5 chaque jour, pour suivre la tendance, et deux questions qui changent. Une question déjà posée revient au plus tôt 7 jours plus tard. On répond à ce qu'on veut, le reste peut rester vide.

Le résumé Telegram du matin (9 h par défaut, `RESUME_HEURE`) rappelle combien de questions attendent. Les réponses sont gardées dans `data/reponses.json` ; l'analyse quotidienne par l'IA (étape suivante) s'en servira pour repérer les axes de progrès de chaque projet.

Les questions se modifient dans [`config/questions.json`](config/questions.json) (types : `note`, `nombre`, `choix`, `texte`).

## Journal

L'onglet **Journal** montre, jour par jour et projet par projet, ce qui a été fait : vidéos publiées (avec leur lien), mails envoyés, rendez-vous, notes… et un bilan des 7 derniers jours. Chaque matin, le résumé Telegram ajoute « Hier, projet par projet ».

Trois sources :
- **n8n, automatiquement** : avec `N8N_API_KEY`, le cerveau compte chaque heure les exécutions réussies et en erreur de chaque automatisation, rangées par projet d'après leur nom (`config/journal.json`).
- **n8n, précisément** : en fin de workflow, un nœud *HTTP Request* envoie ce qui a été produit :
  - méthode `POST`, adresse `https://cerveau.nourmeet.com/api/journal` (ou `http://cerveau-central:8090/api/journal` depuis le réseau Docker)
  - en-tête `Authorization: Bearer <RELEVE_JETON>`
  - corps JSON : `{"projet": "extrait-politique", "type": "video", "titre": "…", "lien": "https://youtu.be/…", "details": "…"}` (ou une liste de ces objets)
  - projets : `nour-meet`, `leviaro`, `extrait-politique`, `histoires-vraies`, `impacteur`, `cambodge`, `autre` ; types : `video`, `publication`, `mail`, `rdv`, `client`, `note`, `autre`
- **À la main** : « Ajouter une note » sur la page.

## Argent

L'onglet **Argent** liste les abonnements et recharges (pré-remplis avec le récap du 05/10/2026, dans `config/argent.json`, puis modifiables depuis la page) : total du mois, coût fixe, répartition par projet, rappel Telegram 3 jours avant un renouvellement quand sa date est connue.

On peut y **déposer ses factures** (PDF ou photo). Si `ANTHROPIC_API_KEY` est dans `.env`, le cerveau les lit avec Claude Sonnet 5.5 (environ 1 centime par facture), les rapproche de la liste et montre ce qui est à jour, ce qui manque et les montants différents. La dépense IA est plafonnée par mois (`PLAFOND_IA_DOLLARS`, 10 $ par défaut). Les factures restent sur le serveur, dans le volume `data/factures`.

## Serveurs

L'onglet **Serveurs** montre chaque VPS (liste dans `config/serveurs.json`) : place sur le disque, mémoire, processeur, quels projets tournent dessus et ce qu'ils prennent, la date estimée où le disque sera plein, et des conseils (nettoyage possible, conteneur arrêté, déplacer un projet vers le VPS le moins rempli). Le cerveau ne touche à rien : il propose, louis décide.

Chaque VPS envoie un relevé par heure avec `scripts/releve.sh` (lecture seule : `df`, `docker ps`, `docker stats`, `du`). Installation, une fois par VPS :

```sh
# 1. Sur le VPS Nūr, une seule fois : créer le jeton et l'ajouter au .env du cerveau
cd ~/cerveau-central && echo "RELEVE_JETON=$(openssl rand -hex 24)" >> .env && docker compose up -d --build

# 2. Sur chaque VPS : réglages (SERVEUR = vps-nour ou vps-youtube ; même jeton qu'au 1.)
#    sur le VPS Nūr, CERVEAU_URL peut être http://127.0.0.1:8090
mkdir -p ~/cerveau-releve && curl -fsSL https://raw.githubusercontent.com/opusclip987654321-lang/cerveau-central/main/scripts/releve.sh -o ~/cerveau-releve/releve.sh && chmod +x ~/cerveau-releve/releve.sh
nano ~/.cerveau-releve && chmod 600 ~/.cerveau-releve

# 3. Tester, puis lancer chaque heure
~/cerveau-releve/releve.sh
(crontab -l 2>/dev/null; echo "7 * * * * $HOME/cerveau-releve/releve.sh >/dev/null 2>&1") | crontab -
```

Si un VPS n'envoie plus rien pendant 3 h, une alerte Telegram part.

## Installer sur le VPS

Prérequis : Docker (déjà présent sur le serveur).

```bash
git clone https://github.com/opusclip987654321-lang/cerveau-central.git /opt/cerveau-central
cd /opt/cerveau-central
cp .env.example .env
nano .env          # remplir le bot Telegram (voir plus bas), puis enregistrer
chmod 600 .env     # lisible seulement par root
docker compose up -d --build
docker compose logs -f   # doit afficher « vérification terminée »
```

Les clés restent dans `.env` sur le serveur. Ce fichier n'est **jamais** envoyé sur GitHub (il est dans `.gitignore`).

Mettre à jour plus tard :

```bash
cd /opt/cerveau-central && git pull && docker compose up -d --build
```

## Ouvrir la page depuis ton Mac

La page s'ouvre sur **https://cerveau.nourmeet.com**, protégée par un mot de passe. Après 5 mauvais essais, l'adresse est bloquée 15 minutes. Une fois connecté, le navigateur s'en souvient 30 jours.

1. **Choisir le mot de passe** (12 caractères ou plus), sur le serveur :
   ```bash
   read -rs -p "Mot de passe : " MDP; echo; printf '%s' "$MDP" | docker compose run --rm -T cerveau node src/mot-de-passe.js >> .env; unset MDP
   docker compose up -d
   ```
   Le mot de passe ne s'affiche pas et n'est enregistré nulle part : seule son empreinte (`MOT_DE_PASSE_EMPREINTE=…`) est ajoutée à `.env`. Pour en changer, supprimer cette ligne de `.env` et recommencer.
2. **Nom de domaine** : chez OVH, ajouter un enregistrement `A` pour `cerveau.nourmeet.com` vers l'adresse IP du serveur (la même que `n8n.nourmeet.com`).
3. **Réseau de Caddy** : `docker network ls`, repérer le réseau du projet nour-meet (souvent `nour-meet_default`) et le mettre dans `RESEAU_CADDY` dans `.env`.
4. **Caddy** : ajouter ce bloc au `Caddyfile` (dépôt nour-meet, `infra/Caddyfile`), puis recharger Caddy :
   ```
   cerveau.nourmeet.com {
   	reverse_proxy cerveau-central:8090
   }
   ```
5. `docker compose up -d --build`

Sans `MOT_DE_PASSE_EMPREINTE`, la page n'a pas de mot de passe : ne pas ajouter le bloc Caddy dans ce cas, et l'ouvrir seulement par tunnel SSH :

```bash
ssh -L 8090:127.0.0.1:8090 utilisateur@ip-du-vps
```

puis <http://localhost:8090>.

## Brancher Telegram

Les alertes passent par le bot du récap hebdo.

1. `TELEGRAM_BOT_TOKEN` : le jeton du bot, donné par @BotFather (`/mybots` → le bot → *API Token*).
2. `TELEGRAM_CHAT_ID` : envoyer un message au bot, puis ouvrir `https://api.telegram.org/bot<JETON>/getUpdates` ; le chiffre après `"chat":{"id":` est l'identifiant.

Sans ces deux valeurs, le cerveau tourne quand même et écrit les alertes dans ses journaux.

## Brancher n8n (facultatif)

Dans n8n : *Settings → n8n API → Create an API key*, puis la mettre dans `N8N_API_KEY`. Le 2ᵉ n8n (n8n.actualitevideo.fr, VPS YouTube) se branche de la même façon avec `N8N_ACTUALITE_API_KEY`. Le cerveau ne fait que **lire** la liste des automatisations et des exécutions en erreur.

## Si le serveur lui-même tombe

Le cerveau tourne sur le serveur qu'il surveille : si le serveur tombe, il ne peut plus prévenir. Pour ça, ajouter un veilleur externe gratuit (par exemple UptimeRobot) qui vérifie `https://nourmeet.com` et `https://leviaro.fr` toutes les 5 minutes et prévient par mail ou Telegram.

## Tester sur sa machine

```bash
npm test               # les tests (Node 22, aucune dépendance)
npm run verifier       # une vérification complète, résultat dans le terminal
npm start              # la page d'état sur http://127.0.0.1:8090
```
