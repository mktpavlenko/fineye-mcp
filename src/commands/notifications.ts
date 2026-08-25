import { Command } from 'commander'
import { output } from '../render.js'
import { listNotifications } from '../domain/notifications.js'

export const notificationsCmd = new Command('notifications')
  .alias('inbox')
  .description('List in-app notifications')
  .option('--json')
  .action(async (o) => {
    const items = await listNotifications()
    if (o.json) {
      console.log(JSON.stringify(items, null, 2))
      return
    }
    output(
      items.map((n) => ({
        date: n.delivered_at?.slice(0, 10) ?? '',
        title: n.title ?? '',
        body: (n.body ?? '').slice(0, 60),
      })),
      false,
      ['date', 'title', 'body'],
    )
  })
