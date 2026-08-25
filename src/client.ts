import {
  SUPABASE_URL,
  ANON_KEY,
  WRITABLE_TABLES,
  PATCHABLE_TABLES,
  WORKSPACE_SETTINGS_PATCHABLE_FIELDS,
  DELETABLE_TABLES,
  READONLY_RPCS,
  ALLOWED_METHODS,
  isReadonly,
  isDeleteEnabled,
} from './constants.js'
import { getValidAccessToken, forceRefresh } from './auth/session.js'
import { FineyeError, type ErrCode } from './errors.js'
type Query = Record<string, string>
// encodeURIComponent leaves . * ( ) unescaped; we only need commas kept literal inside select/order/and values.
function qs(q?: Query) {
  return q && Object.keys(q).length
    ? '?' +
        Object.entries(q)
          .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',')}`)
          .join('&')
    : ''
}
function authHeaders(tok: string, extra: Record<string, string> = {}) {
  return { apikey: ANON_KEY, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...extra }
}
async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  if (!(ALLOWED_METHODS as readonly string[]).includes(method))
    throw new FineyeError(`HTTP method '${method}' not allowed (safety)`, 'gate')
  const send = async (tok: string) => {
    try {
      return await fetch(SUPABASE_URL + path, {
        method,
        headers: authHeaders(tok, extra),
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (e) {
      // fetch only rejects when the request never got an answer — DNS, offline, TLS.
      throw new FineyeError(`network error reaching ${SUPABASE_URL}: ${e instanceof Error ? e.message : String(e)}`, 'network')
    }
  }
  let res = await send(await getValidAccessToken())
  if (res.status === 401) res = await send(await forceRefresh()) // retry once with a fresh token
  if (!res.ok) {
    const t = await res.text()
    const code: ErrCode = res.status === 401 ? 'auth' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'not_found' : 'api'
    throw new FineyeError(`${method} ${path} -> ${res.status} ${t.slice(0, 300)}`, code, res.status)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}
export async function get<T>(table: string, query?: Query): Promise<T[]> {
  return (await call('GET', `/rest/v1/${table}${qs(query)}`)) ?? []
}
export async function getOne<T>(table: string, query?: Query): Promise<T | null> {
  const r = await get<T>(table, query)
  return r[0] ?? null
}
export async function write<T>(table: string, rows: object | object[], opts: { merge?: boolean } = {}): Promise<T[]> {
  if (isReadonly()) throw new FineyeError('Refusing to write: read-only mode (FINEYE_READONLY set)', 'gate')
  if (!(WRITABLE_TABLES as readonly string[]).includes(table))
    throw new FineyeError(`Table '${table}' is not writable (safety allow-list)`, 'gate')
  const prefer = `return=representation${opts.merge === false ? '' : ',resolution=merge-duplicates'}`
  return (await call('POST', `/rest/v1/${table}`, Array.isArray(rows) ? rows : [rows], { Prefer: prefer })) ?? []
}
export async function patch<T>(table: string, query: Query, patchBody: object): Promise<T[]> {
  if (isReadonly()) throw new FineyeError('Refusing to write: read-only mode (FINEYE_READONLY set)', 'gate')
  if (!(PATCHABLE_TABLES as readonly string[]).includes(table))
    throw new FineyeError(`Table '${table}' is not patchable (safety allow-list)`, 'gate')
  if (table === 'workspace_settings') {
    const allowed = WORKSPACE_SETTINGS_PATCHABLE_FIELDS as readonly string[]
    const bad = Object.keys(patchBody).filter((k) => !allowed.includes(k))
    if (bad.length)
      throw new FineyeError(`workspace_settings: only [${allowed.join(', ')}] is patchable (rejected: ${bad.join(', ')})`, 'gate')
  }
  if (!query || Object.keys(query).length === 0) throw new FineyeError('patch requires a non-empty filter (mass-update guard)', 'gate')
  return (await call('PATCH', `/rest/v1/${table}${qs(query)}`, patchBody, { Prefer: 'return=representation' })) ?? []
}
export async function rpc<T>(fn: string, params: object): Promise<T> {
  if (!(READONLY_RPCS as readonly string[]).includes(fn)) throw new FineyeError(`RPC '${fn}' is not allowed (read-only allow-list)`, 'gate')
  return await call('POST', `/rest/v1/rpc/${fn}`, params)
}
// HARD DELETE — three gates + allow-list + single-row guard.
export async function del(table: string, query: Query): Promise<void> {
  if (isReadonly()) throw new FineyeError('Refusing to delete: read-only mode (FINEYE_READONLY set)', 'gate')
  if (!isDeleteEnabled())
    throw new FineyeError('Delete is disabled. Set FINEYE_DELETE=1 to enable it (a separate opt-in from writes).', 'gate')
  if (!(DELETABLE_TABLES as readonly string[]).includes(table))
    throw new FineyeError(`Table '${table}' is not deletable (safety allow-list)`, 'gate')
  if (!query?.id || !query.id.startsWith('eq.'))
    throw new FineyeError('delete requires a single id filter (id=eq.<id>) — no mass delete', 'gate')
  await call('DELETE', `/rest/v1/${table}${qs(query)}`)
}
