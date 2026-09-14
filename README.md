# Planning d'appel

Espace de travail pour setter : import CSV, liste « À appeler » filtrable par
ville, 5 colonnes de classement, notes par contact, synchronisation temps réel
entre appareils via Firestore.

## Démarrer

```
npm install
npm run dev
```

## Utilisation

1. **Importer un CSV** — chaque ligne devient un contact dans la liste
   « À appeler ». Colonnes reconnues spécifiquement : `Company Name for Emails`
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
4. **Note par contact** — icône 📝 (liste) ou lien « Ajouter une note » (colonnes),
   repliée par défaut. Cliquer l'ouvre en zone de texte éditable qui reste
   ouverte tant qu'on ne clique pas explicitement sur « Fermer ». Le contenu est
   sauvegardé dans Firestore comme le reste des données du contact.
5. **Synchronisation** — l'état complet du tableau est enregistré dans Firestore
   (projet `setterplan`, document `board/current`) à chaque import, déplacement,
   note ou étoile, et lu en temps réel via `onSnapshot` : un changement fait sur
   un appareil apparaît sur les autres sans rechargement. Une pastille en haut à
   droite indique l'état de la connexion (« En ligne », « Hors ligne », « Accès
   refusé »). Hors ligne, le cache persistant du SDK garde le tableau consultable
   et rejoue les écritures au retour du réseau.
6. **Réinitialiser** vide tout le tableau (avec confirmation).
7. **Rechercher** (en haut) filtre sur l'entreprise, le gérant, la ville et le
   téléphone. Le ou les contacts trouvés ne sont jamais déplacés : ils
   s'illuminent d'un halo doré directement dans la colonne où ils sont déjà
   classés, avec défilement automatique jusqu'au premier résultat (et bascule
   d'onglet si besoin sur mobile).
8. **Ajouter un contact** (bouton **+** à côté de « À appeler ») ouvre un
   formulaire de création manuelle ; le nouveau contact est ajouté dans
   « À appeler ». La ville se choisit dans un menu déroulant listant les
   villes déjà connues (plus une option « + Nouvelle ville… ») plutôt qu'en
   texte libre, pour éviter les doublons dus aux fautes de frappe.

Une petite étoile ☆/★ en haut à droite de chaque contact sert de simple
marqueur visuel (elle ne change ni sa colonne ni son ordre d'affichage).

Un fichier `exemple-contacts.csv` (plusieurs villes) est fourni pour tester.

## Règles Firestore

La synchronisation exige que le document `board/current` soit accessible. Les
règles nécessaires sont dans `firestore.rules` ; tant qu'elles ne sont pas
déployées, l'application affiche « Accès refusé » et les modifications restent
locales à l'onglet.

## Compatibilité avec les données déjà importées

Les contacts déjà stockés avec l'ancien schéma (une seule colonne
« nom »/« entreprise » et des informations complémentaires génériques) restent
lisibles : l'entreprise est reprise depuis l'ancien champ, et la ville, le
dirigeant, l'adresse et le site web déjà connus sont retrouvés automatiquement.
Rien n'est perdu au chargement ; l'enregistrement au nouveau format se fait de
lui-même à la première action sur le tableau (déplacement, note, étoile…).
