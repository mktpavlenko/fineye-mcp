import { rpc } from '../client.js'

export interface InboxItem {
  id: string
  title: string | null
  body: string | null
  cta_label: string | null
  deeplink: string | null
  delivered_at: string | null
}
// The in-app notification centre — an RPC, not a table (see READONLY_RPCS).
export async function listNotifications(): Promise<InboxItem[]> {
  return (await rpc<InboxItem[]>('notification_inbox_list', {})) ?? []
}
