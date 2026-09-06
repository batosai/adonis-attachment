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
- `MediaMetadataService` : execute les extracteurs techniques configures lors de `persist()` lorsque l'option `meta` est activee.
- `AttachmentManager` : normalise buffer, Base64, fichier multipart, chemin, URL et stream en drafts avant leur persistance par le service.
- `defineConfig` : resout le stockage et la queue au boot Adonis, en direct ou depuis le conteneur applicatif. Sans queue externe, il utilise `MemoryAttachmentQueue`.
- `configure` : enregistre le provider et la commande `make:attachments-table` dans l'application Adonis.
- `AttachmentRepository` : lit un attachment pour un worker, sans imposer de mecanisme de persistence.
- `AttachmentSchemaService` : definit et fait evoluer les tables Lucid `adonis_attachments` et `adonis_attachment_links` sans dupliquer leur structure dans les migrations applicatives.
- `AttachmentJobProcessor` : resout un job puis appelle le generateur de variants configure.

Un adaptateur `@adonisjs/queue` devra implementer le meme contrat. Le job Adonis appelle `AttachmentJobProcessor.process(this.payload)` dans sa methode `execute`. Cette limite permet de garder les jobs Adonis dans l'application, ou ils peuvent etre auto-decouverts et injectes par le conteneur.

Les converters peuvent etre declares dans `config/attachment.ts` sous une cle de variant, avec un import dynamique et des options de style v5. `ConfiguredVariantConverterRegistry` ne charge la classe qu'au premier job pour cette cle. Sans import explicite, il instancie `AutodetectConverter`: Sharp pour les images, ffmpeg pour les videos, Poppler pour les PDF et LibreOffice puis Poppler pour les documents Office. La commande `make:converter` genere une classe qui etend `Converter` et implemente `handle({ attachment, body, options })`. Les objets `VariantConverter` restent acceptes directement par `VariantGenerationService`. Les deux formes retournent les octets et les metadonnees du variant, ou `undefined` pour ignorer le fichier. `VariantGenerationService` ecrit les fichiers generes et peut etre utilise directement comme `VariantGenerator` par le processeur de jobs.

`InferConverters<typeof attachmentConfig>` peut etre fusionne dans l'interface publique `AttachmentVariants`. Les options `variants` utilisent alors les cles declarees; sans cette augmentation, elles restent volontairement ouvertes a `string` pour les applications sans registry configuree.

Les extracteurs de metadata implementent `MediaMetadataExtractor`. Ils sont independants des bibliotheques de traitement et peuvent filtrer leurs entrees avec `supports()`. Le noyau les execute apres la resolution du nom et du disque, avant l'ecriture. Les metadata explicites de l'appelant restent prioritaires sur les valeurs extraites.

Le sous-chemin optionnel `@jrmc/adonis-attachment/media/sharp` fournit un extracteur de metadata d'image et une fabrique de `VariantConverter`. Il recoit la factory Sharp de l'application, ce qui conserve Sharp hors du graphe de dependances du noyau.

Le sous-chemin `@jrmc/adonis-attachment/media/binaries` expose un `CommandRunner` injectable, sa mise en oeuvre Node sans shell et des adaptateurs `ffprobe`, `ffmpeg`, Poppler et LibreOffice. Chaque conversion utilise un repertoire temporaire isole puis le supprime, ce qui laisse les executables et leur emplacement sous le controle de l'application.

`AttachmentJobProcessor` peut aussi recevoir une factory de generateur asynchrone. Elle est resolue et memorisee au premier job, ce qui permet de construire un generateur dependant du service `jrmc.attachment` sans cycle au boot.

La queue externe ne transporte que le job serialisable `{ type, attachmentId, variantKeys? }`. Le worker recharge ensuite l'attachment dans son repository avant de lancer le generateur, ce qui evite de transporter des chemins, des octets ou un modele Lucid dans le message.

Pour les relations Lucid, l'option `variants` est resolue selon la priorite manager, decorateur, configuration. Une fois le blob et son lien ecrits, les cles sont planifiees immediatement hors transaction ou apres le commit d'une transaction. Les variants ne sont donc jamais envoyes a un worker pour un owner qui vient d'etre rollback.

## Modele Lucid cible

Le mode table dediee separe le blob du fichier et son rattachement. La table `adonis_attachments` contient les blobs. La table `adonis_attachment_links` contient la relation polymorphe avec les modeles applicatifs. Un variant est un blob dont `parent_id` designe le blob original.

| Table | Colonnes | Role |
| --- | --- | --- |
| `adonis_attachments` | `id`, `disk`, `path`, `name`, `original_name`, `mime_type`, `extname`, `size`, `metadata` | blob immutable et metadonnees du fichier |
| `adonis_attachments` | `parent_id`, `variant_key` | lien et cle unique des variants d'un blob original |
| `adonis_attachment_links` | `id`, `attachment_id` | lien applicatif vers un blob |
| `adonis_attachment_links` | `attachable_type`, `attachable_id`, `field` | owner polymorphe et nom logique, par exemple `avatar` |
| `adonis_attachment_links` | `owner_key`, `position` | unicite d'une relation singuliere ou ordre d'une collection |

Contraintes a prevoir dans la migration Lucid : unicite de `attachment_links.owner_key` pour les relations singulieres, index sur `(attachable_type, attachable_id, field)` et `attachment_id`, index sur `attachments.parent_id`, et unicite de `(parent_id, variant_key)` lorsque `parent_id` est defini.

La commande Ace `make:attachments-table` rend le stub package `stubs/migrations/attachments_table.stub` dans `database/migrations` par defaut et accepte `--table` et `--folder`.

`migrateLegacyAttachment()` convertit un document JSON v5 (original et variants) en lignes de cette table. Les variants reutilisent l'`original_name` du fichier parent, car ce champ represente le nom envoye par le client et non le nom produit par le converter.

Le sous-chemin `@jrmc/adonis-attachment/lucid` expose `AttachmentModel`, `AttachmentLinkModel`, `LucidAttachmentRepository` et `LucidAttachmentStore`. Le repository donne au worker un acces type aux blobs, et le store persiste liens, collections et variants sans introduire Lucid dans le noyau. Quand une relation est appelee depuis un modele place dans une transaction Lucid, le store utilise le meme client SQL.

Les modules internes Lucid sont regroupes par responsabilite : `column/` contient la strategie JSON historique, `relations/` la strategie polymorphique et ses owners, `models/` les deux modeles Lucid, `persistence/` le store, le lifecycle, le repository et les variants, `schema/` les noms et definitions de tables, et `migrations/legacy/` la conversion des donnees v5. Le fichier `index.ts` conserve l'API publique du sous-chemin Lucid stable malgre cette organisation interne.

Deux decorateurs de relation completent le decorateur JSON `@attachment()`. `@attachmentRelation()` expose une relation singuliere sur le modele avec `get`, `attach`, `set`, `replace`, `detach`, `persist`, `variants` et `regenerateVariants`. `attach` est strict et refuse de remplacer une valeur existante; `set` et `replace` preparent la creation ou le remplacement. `@attachmentsRelation()` expose une collection ordonnee avec `all`, `add`, `remove`, `clear`, `replaceAll`, `move` et `persist`. Les mutations sont conservees en attente sur le modele et executees apres `save()`, ce qui permet aussi de les definir avant la creation du parent. Si `save()` echoue, aucune ecriture de fichier ou de lien ne commence et la mutation reste disponible pour une nouvelle tentative. `persist()` force une execution immediate pour un modele deja persiste. Les relations passent le modele au contexte de persistence pour resoudre les options de decorateur. En transaction, les nouveaux fichiers sont retires sur rollback et les suppressions de fichiers sont repoussees au commit. La suppression du modele parent retire ses liens; le store ne purge un blob et ses variants que si aucun lien ne le reference encore.

`LucidAttachmentLifecycleService` orchestre l'ecriture du fichier et la persistence Lucid. Lors d'un remplacement, il transfere temporairement la cle d'owner avant d'inserer le nouvel original, puis la restaure si l'insertion echoue. Il supprime un nouveau fichier si la persistence echoue. Les suppressions de fichiers qui suivent une suppression de ligne restent compensables par un job de nettoyage, car le stockage externe ne partage pas la transaction SQL.

La commande Ace `make:attachment-v5-migration` rend le stub package `stubs/migrations/legacy_attachment_migration.stub` pour generer un script de migration de donnees. Le script utilise `migrateLegacyAttachmentRecords()` pour inserer les lignes par lots. Il laisse l'iteration du modele legacy et le mapping `{ type, id, field }` a l'application, car ces informations ne peuvent pas etre deduites de maniere fiable par le package.

## Route de lecture

Le provider expose `GET /attachments/:id` uniquement lorsque l'application est configuree avec un `AttachmentRepository`. La route est desactivable et son prefixe est configurable. Elle lit les octets via `AttachmentService` et renseigne le type MIME. Elle est publique par defaut : les applications qui ont besoin d'autorisation doivent definir leur propre route autour du repository et du service.
