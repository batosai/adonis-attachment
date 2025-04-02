# Queue

The media transforms are carried out int the queue, grouped by model attribut with the [@poppinss/defer](https://github.com/poppinss/defer) library.

## Events

Create your preload file for events catch:

```sh
node ace make:preload queue
```

```ts
import { attachmentManager } from '@jrmc/adonis-attachment'
import logger from '@adonisjs/core/services/logger'

attachmentManager.queue.onError = function (error, task) {
  logger.info(`${task.name} task failed with the following error`)
  logger.error(error.message)
}

attachmentManager.queue.taskCompleted = function (task) {
  logger.info(`${task.name} completed. ${attachmentManager.queue.size()} tasks left`)
}

attachmentManager.queue.drained = function () {
  logger.info('Processed last task in the queue')
}

```

