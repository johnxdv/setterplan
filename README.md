# Planning d'appel

Espaces de travail pour setters : un tableau kanban indépendant par personne
(Victor, Alice, Jeyson) — import CSV, liste « À appeler » filtrable par ville,
5 colonnes de classement, notes par contact, export CSV, synchronisation temps
réel entre appareils via Firestore.

## Espaces de travail

La page d'accueil liste les espaces ; cliquer sur un nom ouvre son tableau
(`#/victor`, `#/alice`, `#/jeyson`), la flèche ← en haut à gauche revient au
menu. Chaque espace vit dans **son propre document Firestore** (`board/<id>`) :
aucune action faite dans l'espace d'Alice ne peut atteindre les données de
Victor ou de Jeyson.

Ajouter un 4e setter = ajouter une ligne dans `src/spaces.js` :

```js
export const SPACES = [
  { id: 'victor', name: 'Victor' },
  { id: 'alice', name: 'Alice' },
  { id: 'jeyson', name: 'Jeyson' },
  { id: 'nouveau', name: 'Nouveau' },   // <- rien d'autre à faire
]
```

Son document `board/nouveau` est créé au premier import. Ne jamais renommer un
`id` existant : c'est la clé du document qui contient les contacts.

## Démarrer

```
npm install
echo "APP_PASSWORD=..." > .env.local   # mot de passe de l'écran d'accès
npm run dev
```

## Mot de passe d'accès

Un écran de mot de passe partagé précède le menu des espaces. Le mot de passe
vient de la variable d'environnement `APP_PASSWORD` (Vercel > Settings >
Environment Variables en production, `.env.local` non versionné en local) ; le
build échoue s'il manque. Seule son empreinte SHA-256 est intégrée au bundle.
Une fois saisi, l'accès tient jusqu'à la fermeture de l'onglet. Changer
`APP_PASSWORD` puis redéployer redemande le mot de passe à tout le monde.

C'est un simple frein : la vérification a lieu dans le navigateur, et les
règles Firestore restent ouvertes.

## Utilisation

1. **Importer un CSV** — dès qu'un fichier est choisi, une modale demande quoi
   en faire, avant toute écriture :
   - **Ajouter à la liste existante** — les nouveaux contacts rejoignent
     « À appeler ». Les contacts déjà présents ne bougent pas : colonne, note
     et étoile sont conservées. Un contact du fichier déjà dans l'espace (même
     entreprise + même téléphone) est ignoré plutôt que dupliqué.
   - **Remplacer la liste existante** — supprime tous les contacts de l'espace
     et les remplace par le fichier. C'est destructif, donc une seconde
     confirmation explicite (« supprimera définitivement les X contacts… »)
     est demandée avant exécution. Échap ou « Annuler » à n'importe quel
     moment n'écrit rien.

   Chaque ligne du fichier devient un contact dans « À appeler ». Colonnes
   reconnues spécifiquement : `Company Name for Emails`
   (entreprise), `Gerant` (gérant), `Company Phone` (téléphone), `Company
   Address` (adresse), `Ville` (utilisée par le filtre) et `Website` (site
   web). Si ces en-têtes précis ne sont pas trouvés, une détection plus
   générique prend le relais (`Nom`, `Téléphone`/`Tel`, `Adresse`, `Site`…).
   Toute autre colonne présente dans le fichier est conservée et affichée dans
   le détail du contact (`Libellé : valeur`). Séparateur `,` `;` ou tabulation
   détecté automatiquement.
2. **« À appeler »** est une liste compacte (une ligne = entreprise, gérant,
   téléphone), pas des cartes. Cliquer sur une ligne la déplie pour voir
   l'adresse, la ville, le site web et tout autre champ importé. Un menu
   déroulant en haut de la liste filtre par ville (liste générée automatiquement
   à partir des contacts importés).
3. **5 colonnes fixes** à droite — « Rappel urgent -48h », « Rappel -7 jours »,
   « Relance dans 1-3 mois », « Mort », « Rendez-vous booké » — ne sont que
   des zones de dépôt : on y dépose un contact par glisser-déposer (drag & drop
   HTML5 natif) depuis « À appeler », il y reste affiché en permanence et
   disparaît de la liste de gauche. On ne peut pas glisser un contact depuis
   une colonne pour le remettre dans « À appeler » — ces colonnes ne sont pas
   des zones de dépôt entre elles dans ce sens ; en revanche on peut le
   déplacer d'une catégorie à l'autre (par glisser-déposer ou via les petites
   pastilles sous la carte).
4. **Date et heure de relance** — sur la colonne « Rappel -7 jours »
   uniquement (c'est là qu'on planifie le prochain appel), chaque contact
   porte un champ date + un champ heure. Choisir une date sans préciser
   d'heure met 9h00 par défaut ; la croix efface les deux. Quand l'échéance
   est passée, le cadre passe en rouge et le libellé devient « Relance en
   retard ». La valeur suit le contact s'il change de colonne (elle est juste
   masquée ailleurs) et ressort dans l'export CSV au format
   `JJ/MM/AAAA HH:MM`. Le champ n'interfère ni avec le dépliage de la ligne
   ni avec le glisser-déposer de la carte.
5. **Note par contact** — icône 📝 (liste) ou lien « Ajouter une note » (colonnes),
   repliée par défaut. Cliquer l'ouvre en zone de texte éditable qui reste
   ouverte tant qu'on ne clique pas explicitement sur « Fermer ». Le contenu est
   sauvegardé dans Firestore comme le reste des données du contact.
6. **Synchronisation** — l'état complet du tableau est enregistré dans Firestore
   (projet `setterplan`, document `board/<espace>`) à chaque import, déplacement,
   note ou étoile, et lu en temps réel via `onSnapshot` : un changement fait sur
   un appareil apparaît sur les autres sans rechargement. Une pastille en haut à
   droite indique l'état de la connexion (« En ligne », « Hors ligne », « Accès
   refusé »). Hors ligne, le cache persistant du SDK garde le tableau consultable
   et rejoue les écritures au retour du réseau.
7. **Exporter** télécharge un CSV de tous les contacts de l'espace actif
   (`contacts-<espace>-<date>.csv`) avec, pour chacun : nom (gérant),
   entreprise, téléphone, ville, catégorie où il est classé (« À appeler »,
   « Rappel urgent -48h », « Rappel -7 jours », « Relance dans 1-3 mois »,
   « Mort », « Rendez-vous booké »), date de relance si elle existe et note si
   elle existe. Le fichier est en UTF-8 avec BOM : Excel l'ouvre sans casser
   les accents. Les notes contenant virgules, guillemets ou retours ligne sont
   échappées correctement.
8. **Réinitialiser** vide tout le tableau de l'espace actif (avec
   confirmation).
9. **Rechercher** (en haut) filtre sur l'entreprise, le gérant, la ville et le
   téléphone. Le ou les contacts trouvés ne sont jamais déplacés : ils
   s'illuminent d'un halo doré directement dans la colonne où ils sont déjà
   classés, avec défilement automatique jusqu'au premier résultat (et bascule
   d'onglet si besoin sur mobile).
10. **Ajouter un contact** (bouton **+** à côté de « À appeler ») ouvre un
   formulaire de création manuelle ; le nouveau contact est ajouté dans
   « À appeler ». La ville se choisit dans un menu déroulant listant les
   villes déjà connues (plus une option « + Nouvelle ville… ») plutôt qu'en
   texte libre, pour éviter les doublons dus aux fautes de frappe.

Une petite étoile ☆/★ en haut à droite de chaque contact sert de simple
marqueur visuel (elle ne change ni sa colonne ni son ordre d'affichage).

Un fichier `exemple-contacts.csv` (plusieurs villes) est fourni pour tester.

## Règles Firestore

La synchronisation exige que les documents `board/*` soient accessibles. Les
règles nécessaires sont dans `firestore.rules` ; tant qu'elles ne sont pas
déployées, l'application affiche « Accès refusé » et les modifications restent
locales à l'onglet.

## Migration de l'ancien tableau unique

Avant les espaces, tous les contacts vivaient dans un document unique
`board/current`. L'espace de Victor reprend ces données telles quelles.

**Fait le 19/09/2026** : les 104 contacts ont été copiés dans `board/victor`
avec la même répartition (56 « À appeler », 8 « Rappel urgent -48h »,
24 « Rappel -7 jours », 10 « Relance dans 1-3 mois », 3 « Mort »,
3 « Rendez-vous booké »), 20 notes et 8 étoiles, zéro écart. `board/current`
est conservé intact comme point de retour.

La procédure ci-dessous reste valable pour rejouer une migration du même type.

**Dans cet ordre :**

1. Déployer `firestore.rules` (Firebase > Firestore Database > Règles) — sans
   ça, `board/victor` est refusé en lecture comme en écriture.
2. Simuler la migration (n'écrit rien, affiche la répartition par colonne) :

   ```
   node scripts/migrate-victor.mjs
   ```

3. Exécuter :

   ```
   node scripts/migrate-victor.mjs --apply
   ```

   Le script sauvegarde d'abord `board/current` dans `backups/`, copie les
   contacts vers `board/victor`, puis **relit la cible et vérifie contact par
   contact** que l'id, la colonne, la note, l'étoile et la date de classement
   sont identiques. Il échoue bruyamment si un seul contact diffère.

4. Déployer l'application.

**Retour en arrière** — `board/current` n'est jamais modifié ni supprimé par
la migration. En cas de problème :

```
node scripts/restore-board.mjs victor backups/board-current-<horodatage>.json --apply
```

(sans `--apply`, le script se contente d'afficher ce qu'il ferait), ou
redéployer la version précédente de l'application, qui lit `board/current`.

Tant que la migration n'a pas tourné, l'espace de Victor affiche un bandeau
rouge le rappelant, plutôt que de paraître vide.

## Compatibilité avec les données déjà importées

Les contacts déjà stockés avec l'ancien schéma (une seule colonne
« nom »/« entreprise » et des informations complémentaires génériques) restent
lisibles : l'entreprise est reprise depuis l'ancien champ, et la ville, le
dirigeant, l'adresse et le site web déjà connus sont retrouvés automatiquement.
Rien n'est perdu au chargement ; l'enregistrement au nouveau format se fait de
lui-même à la première action sur le tableau (déplacement, note, étoile…).
