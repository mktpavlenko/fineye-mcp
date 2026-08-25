export const SUPABASE_REF = 'jpdlgglcucyoqoxrihyr'
export const SUPABASE_URL = `https://${SUPABASE_REF}.supabase.co`
// Public anon key (apikey) — shipped in the app bundle by design.
export const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwZGxnZ2xjdWN5b3FveHJpaHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTYyNzkzNzUsImV4cCI6MjAzMTg1NTM3NX0.nu_CZwBduweCWPfnFAXdOYjnHZxd30kQlfm-ZytebgQ'
export const FINEYE_API = 'https://fineye.app/api'
export const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'] as const // DELETE is gated hard (isDeleteEnabled + DELETABLE_TABLES); never PUT
export const WRITABLE_TABLES = ['transactions', 'categories', 'tags', 'accounts', 'budget_periods'] as const // POST upsert (RLS requires user_id=auth.uid())
export const PATCHABLE_TABLES = ['transactions', 'categories', 'accounts', 'workspace_settings'] as const // PATCH. accounts + workspace_settings are FIELD-restricted below.
// Hard delete is allowed ONLY for these — NEVER accounts or workspace_settings.
// (Categories also support reversible archive; prefer that.)
export const DELETABLE_TABLES = ['transactions', 'categories', 'tags'] as const
// never balance/currency/type or bank-linkage (company/syncId/iban/maskedPan)
export const ACCOUNT_EDITABLE_FIELDS = [
  'name',
  'emoji',
  'archived',
  'goal',
  'creditLimit',
  'includeInTotal',
  'includeInAnalytics',
  'savings',
] as const
// workspace_settings is shared config — the ONLY field the CLI may ever PATCH is the
// auto-categorization rules array. NEVER main_currency/financial_month_start/scenarios/etc.
export const WORKSPACE_SETTINGS_PATCHABLE_FIELDS = ['scenarios_overrides'] as const
export const READONLY_RPCS = ['get_deletions_since', 'notification_inbox_list', 'notification_inbox_get'] as const
// FINEYE_READONLY=1|true|yes|on -> block all writes (agent-safe unattended mode).
export function isReadonly(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.FINEYE_READONLY ?? '').trim().toLowerCase())
}
// FINEYE_DELETE=1|true|yes|on -> enable hard delete. SEPARATE opt-in from writes: an agent
// cannot delete anything unless this is explicitly set for the session (and writes are on).
export function isDeleteEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.FINEYE_DELETE ?? '').trim().toLowerCase())
}
