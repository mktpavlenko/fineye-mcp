// One error class, one discriminant. Not a hierarchy: the only consumers that branch are the CLI
// (exit code) and the MCP server (error payload), and both branch on exactly these seven cases.
export type ErrCode =
  | 'auth' // not logged in / refresh failed -> the user must run `fineye login`
  | 'forbidden' // the backend refused (RLS, 403)
  | 'not_found' // the row does not exist
  | 'gate' // OUR safety gate said no (read-only, FINEYE_DELETE, table allow-list, mass-update guard)
  | 'invalid' // bad arguments, caught before any request
  | 'network' // the request never got an answer
  | 'api' // any other HTTP failure; `status` carries it (429, 5xx…)

export class FineyeError extends Error {
  constructor(
    message: string,
    readonly code: ErrCode,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'FineyeError'
  }
}

// Distinct exit codes so a script can tell "no such transaction" from "the network is down"
// without parsing the message. Anything unrecognized stays 1.
export const EXIT_CODE: Record<ErrCode, number> = {
  invalid: 2,
  auth: 3,
  forbidden: 4,
  gate: 4,
  not_found: 5,
  network: 6,
  api: 1,
}
