# Architecture de la refonte

## Principe de decoupage

Le noyau ne depend ni d'AdonisJS ni de Lucid. Il cree les objets `Attachment`, ecrit les octets via `AttachmentStorage` et publie les travaux asynchrones via `AttachmentQueue`.

```text
application / autre ORM / Lucid
             |
      AttachmentService
        |            |
AttachmentStorage  AttachmentQueue
        |            |
    Drive/S3/...  memory/@adonisjs/queue/...
```

La persistence en base n'est pas une responsabilite du noyau : l'appelant recupere l'objet `Attachment` cree puis le stocke avec l'ORM ou le mecanisme de son choix.

## Contrats initiaux

- `AttachmentStorage` : ecrit et supprime un fichier a partir d'un disque et d'un chemin.
- `AdonisDriveStorage` : adaptateur optionnel pour un `DriveService` Adonis, sans dependance Lucid.
- `AttachmentQueue` : recoit des travaux serialisables. Le premier est `generate-variants`.
- `MemoryAttachmentQueue` : implementation par defaut, executee dans le processus avec une concurrence configuree.
- `AttachmentService` : facade de creation, suppression et planification des variants.
- `defineConfig` : resout le stockage et la queue au boot Adonis, en direct ou depuis le conteneur applicatif. Sans queue externe, il utilise `MemoryAttachmentQueue`.
- `AttachmentRepository` : lit un attachment pour un worker, sans imposer de mecanisme de persistence.
- `AttachmentJobProcessor` : resout un job puis appelle le generateur de variants configure.

Un adaptateur `@adonisjs/queue` devra implementer le meme contrat. Le job Adonis appelle `AttachmentJobProcessor.process(this.payload)` dans sa methode `execute`. Cette limite permet de garder les jobs Adonis dans l'application, ou ils peuvent etre auto-decouverts et injectes par le conteneur.

## Modele Lucid cible

Le mode table dediee utilise une seule table `attachments`. Un variant est un attachment dont `parent_id` designe l'attachment original. Cela evite de reintroduire un document JSON imbrique.

| Colonne | Role |
| --- | --- |
| `id` | identifiant stable de l'attachment |
| `attachable_type`, `attachable_id` | relation polymorphe du fichier original |
| `field` | nom logique de l'attribut, par exemple `avatar` |
| `parent_id` | `NULL` pour l'original, sinon attachment parent du variant |
| `variant_key` | cle du variant, `NULL` pour l'original |
| `disk`, `path`, `name` | localisation du fichier |
| `original_name`, `mime_type`, `extname`, `size` | metadonnees de fichier |
| `metadata` | metadonnees extensibles non structurelles |
| `created_at`, `updated_at` | audit |

Contraintes a prevoir dans la migration Lucid : index sur `(attachable_type, attachable_id, field)`, index sur `parent_id`, et unicite de `(parent_id, variant_key)` lorsque `parent_id` est defini.

Le package expose deja `renderAttachmentsMigration()` afin de produire cette migration pour l'application. Une commande Ace optionnelle l'ecrira dans le dossier de migrations lorsque le provider Lucid sera ajoute.

`migrateLegacyAttachment()` convertit un document JSON v5 (original et variants) en lignes de cette table. Les variants reutilisent l'`original_name` du fichier parent, car ce champ represente le nom envoye par le client et non le nom produit par le converter.

## Prochaine tranche

1. Ajouter la commande Ace qui ecrit la migration Lucid.
2. Implementer le repository Lucid sur table polymorphe.
3. Construire la commande de migration depuis les colonnes JSON v5 autour de `migrateLegacyAttachment()`.
