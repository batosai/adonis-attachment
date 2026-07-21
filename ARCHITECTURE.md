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

La persistence en base n'est pas une responsabilite du noyau : l'appelant cree un draft, appelle `persist()`, puis stocke l'objet `Attachment` avec l'ORM ou le mecanisme de son choix. Le decorateur Lucid appelle `persist()` automatiquement pendant `save()`.

La documentation contient un flux de persistence personnalisee avec un `AttachmentRepository` applicatif. Ce repository permet aux workers et a la route de lecture de retrouver un attachment sans introduire Lucid.

## Contrats initiaux

- `AttachmentStorage` : ecrit et supprime un fichier a partir d'un disque et d'un chemin.
- `AdonisDriveStorage` : adaptateur optionnel pour un `DriveService` Adonis, sans dependance Lucid.
- `AttachmentQueue` : recoit des travaux serialisables. Le premier est `generate-variants`.
- `MemoryAttachmentQueue` : implementation par defaut, executee dans le processus avec une concurrence configuree.
- `AttachmentService` : facade de persistance, suppression et planification des variants.
- `AttachmentManager` : normalise buffer, Base64, fichier multipart, chemin, URL et stream en drafts avant leur persistance par le service.
- `defineConfig` : resout le stockage et la queue au boot Adonis, en direct ou depuis le conteneur applicatif. Sans queue externe, il utilise `MemoryAttachmentQueue`.
- `configure` : enregistre le provider et la commande `make:attachments-table` dans l'application Adonis.
- `AttachmentRepository` : lit un attachment pour un worker, sans imposer de mecanisme de persistence.
- `AttachmentSchemaService` : definit et fait evoluer les tables Lucid `attachments` et `attachment_links` sans dupliquer leur structure dans les migrations applicatives.
- `AttachmentJobProcessor` : resout un job puis appelle le generateur de variants configure.

Un adaptateur `@adonisjs/queue` devra implementer le meme contrat. Le job Adonis appelle `AttachmentJobProcessor.process(this.payload)` dans sa methode `execute`. Cette limite permet de garder les jobs Adonis dans l'application, ou ils peuvent etre auto-decouverts et injectes par le conteneur.

Les converters v6 implementent `VariantConverter`. Ils recoivent l'attachment et ses octets, puis retournent les octets et les metadonnees du variant. `VariantGenerationService` ecrit les fichiers generes et peut etre utilise directement comme `VariantGenerator` par le processeur de jobs.

`AttachmentJobProcessor` peut aussi recevoir une factory de generateur asynchrone. Elle est resolue et memorisee au premier job, ce qui permet de construire un generateur dependant du service `jrmc.attachment` sans cycle au boot.

## Modele Lucid cible

Le mode table dediee separe le blob du fichier et son rattachement. La table `attachments` contient les blobs. La table `attachment_links` contient la relation polymorphe avec les modeles applicatifs. Un variant est un blob dont `parent_id` designe le blob original.

| Table | Colonnes | Role |
| --- | --- | --- |
| `attachments` | `id`, `disk`, `path`, `name`, `original_name`, `mime_type`, `extname`, `size`, `metadata` | blob immutable et metadonnees du fichier |
| `attachments` | `parent_id`, `variant_key` | lien et cle unique des variants d'un blob original |
| `attachment_links` | `id`, `attachment_id` | lien applicatif vers un blob |
| `attachment_links` | `attachable_type`, `attachable_id`, `field` | owner polymorphe et nom logique, par exemple `avatar` |
| `attachment_links` | `owner_key`, `position` | unicite d'une relation singuliere ou ordre d'une collection |

Contraintes a prevoir dans la migration Lucid : unicite de `attachment_links.owner_key` pour les relations singulieres, index sur `(attachable_type, attachable_id, field)` et `attachment_id`, index sur `attachments.parent_id`, et unicite de `(parent_id, variant_key)` lorsque `parent_id` est defini.

La commande Ace `make:attachments-table` rend le stub package `stubs/migrations/attachments_table.stub` dans `database/migrations` par defaut et accepte `--table` et `--folder`.

`migrateLegacyAttachment()` convertit un document JSON v5 (original et variants) en lignes de cette table. Les variants reutilisent l'`original_name` du fichier parent, car ce champ represente le nom envoye par le client et non le nom produit par le converter.

Le sous-chemin `@jrmc/adonis-attachment/lucid` expose `AttachmentModel`, `AttachmentLinkModel`, `LucidAttachmentRepository` et `LucidAttachmentStore`. Le repository donne au worker un acces type aux blobs, et le store persiste liens, collections et variants sans introduire Lucid dans le noyau. Quand une relation est appelee depuis un modele place dans une transaction Lucid, le store utilise le meme client SQL.

Les modules internes Lucid sont regroupes par responsabilite : `column/` contient la strategie JSON historique, `relations/` la strategie polymorphique et ses owners, `models/` les deux modeles Lucid, `persistence/` le store, le lifecycle, le repository et les variants, `schema/` les noms et definitions de tables, et `migrations/legacy/` la conversion des donnees v5. Le fichier `index.ts` conserve l'API publique du sous-chemin Lucid stable malgre cette organisation interne.

Deux decorateurs de relation completent le decorateur JSON `@attachment()`. `@attachmentRelation()` expose une relation singuliere sur le modele avec `get`, `attach`, `set`, `replace`, `detach`, `variants` et `regenerateVariants`. `attach` est strict et refuse de remplacer une valeur existante; `set` et `replace` effectuent la creation ou le remplacement. `@attachmentsRelation()` expose une collection ordonnee avec `all`, `add`, `remove`, `clear`, `replaceAll` et `move`. Les deux relations exigent un modele Lucid deja persiste et passent le modele au contexte de persistence pour resoudre les options de decorateur. En transaction, les nouveaux fichiers sont retires sur rollback et les suppressions de fichiers sont repoussees au commit. La suppression du modele parent retire ses liens; le store ne purge un blob et ses variants que si aucun lien ne le reference encore.

`LucidAttachmentLifecycleService` orchestre l'ecriture du fichier et la persistence Lucid. Lors d'un remplacement, il transfere temporairement la cle d'owner avant d'inserer le nouvel original, puis la restaure si l'insertion echoue. Il supprime un nouveau fichier si la persistence echoue. Les suppressions de fichiers qui suivent une suppression de ligne restent compensables par un job de nettoyage, car le stockage externe ne partage pas la transaction SQL.

La commande Ace `make:attachment-v5-migration` genere un script de migration de donnees. Le script utilise `migrateLegacyAttachmentRecords()` pour inserer les lignes par lots. Il laisse l'iteration du modele legacy et le mapping `{ type, id, field }` a l'application, car ces informations ne peuvent pas etre deduites de maniere fiable par le package.

## Route de lecture

Le provider expose `GET /attachments/:id` uniquement lorsque l'application est configuree avec un `AttachmentRepository`. La route est desactivable et son prefixe est configurable. Elle lit les octets via `AttachmentService` et renseigne le type MIME. Elle est publique par defaut : les applications qui ont besoin d'autorisation doivent definir leur propre route autour du repository et du service.
