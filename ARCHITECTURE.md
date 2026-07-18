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
- `configure` : enregistre le provider et la commande `make:attachments-table` dans l'application Adonis.
- `AttachmentRepository` : lit un attachment pour un worker, sans imposer de mecanisme de persistence.
- `AttachmentJobProcessor` : resout un job puis appelle le generateur de variants configure.

Un adaptateur `@adonisjs/queue` devra implementer le meme contrat. Le job Adonis appelle `AttachmentJobProcessor.process(this.payload)` dans sa methode `execute`. Cette limite permet de garder les jobs Adonis dans l'application, ou ils peuvent etre auto-decouverts et injectes par le conteneur.

Les converters v6 implementent `VariantConverter`. Ils recoivent l'attachment et ses octets, puis retournent les octets et les metadonnees du variant. `VariantGenerationService` ecrit les fichiers generes et peut etre utilise directement comme `VariantGenerator` par le processeur de jobs.

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

Le package expose `renderAttachmentsMigration()` et `createAttachmentsMigrationFile()` afin de produire cette migration pour l'application. La commande Ace `make:attachments-table` ecrit le fichier dans `database/migrations` par defaut et accepte `--table` et `--folder`.

`migrateLegacyAttachment()` convertit un document JSON v5 (original et variants) en lignes de cette table. Les variants reutilisent l'`original_name` du fichier parent, car ce champ represente le nom envoye par le client et non le nom produit par le converter.

Le sous-chemin `@jrmc/adonis-attachment/lucid` expose `AttachmentModel`, `LucidAttachmentRepository` et `LucidAttachmentStore`. Le repository donne au worker un acces type aux fichiers, et le store persiste originaux et variants dans la meme table sans introduire Lucid dans le noyau.

`LucidAttachmentLifecycleService` orchestre l'ecriture du fichier et la persistence Lucid. Il supprime un nouveau fichier si l'insertion de sa ligne echoue. Les suppressions de fichiers qui suivent une suppression de ligne restent compensables par un job de nettoyage, car le stockage externe ne partage pas la transaction SQL.

La commande Ace `make:attachment-v5-migration` genere un script de migration de donnees. Le script utilise `migrateLegacyAttachmentRecords()` pour inserer les lignes par lots. Il laisse l'iteration du modele legacy et le mapping `{ type, id, field }` a l'application, car ces informations ne peuvent pas etre deduites de maniere fiable par le package.

## Route de lecture

Le provider expose `GET /attachments/:id` uniquement lorsque l'application est configuree avec un `AttachmentRepository`. La route est desactivable et son prefixe est configurable. Elle lit les octets via `AttachmentService` et renseigne le type MIME. Elle est publique par defaut : les applications qui ont besoin d'autorisation doivent definir leur propre route autour du repository et du service.
