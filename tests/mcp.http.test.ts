import { describe, it, expect } from 'vitest'
import { isAuthorized } from '../src/mcp/http.js'

// This IS the access control in HTTP mode: the server is reachable from the internet through
// whatever TLS front sits in front of it. Every case below is a way in someone could try.
describe('http authorization', () => {
  const token = 'a'.repeat(48)
  const req = (url?: string, authorization?: string) => ({ url, headers: authorization ? { authorization } : {} })

  it('accepts a Bearer header, case-insensitively on the scheme', () => {
    expect(isAuthorized(req('/mcp', `Bearer ${token}`), token)).toBe(true)
    expect(isAuthorized(req('/mcp', `bearer ${token}`), token)).toBe(true)
    expect(isAuthorized(req('/anything', `Bearer  ${token} `), token)).toBe(true)
  })

  it('accepts the token as the path when no header is sent', () => {
    expect(isAuthorized(req(`/${token}`), token)).toBe(true)
    expect(isAuthorized(req(`/${token}/`), token)).toBe(true)
    expect(isAuthorized(req(`/${token}?x=1`), token)).toBe(true)
  })

  it('rejects a wrong or malformed header WITHOUT falling back to the path', () => {
    // Otherwise a typo in the header silently downgrades to the weaker credential.
    expect(isAuthorized(req(`/${token}`, 'Bearer wrong'), token)).toBe(false)
    expect(isAuthorized(req(`/${token}`, token), token)).toBe(false) // no scheme
    expect(isAuthorized(req(`/${token}`, 'Basic ' + token), token)).toBe(false)
  })

  it('rejects everything else', () => {
    for (const bad of [undefined, '', '/', '/' + 'a'.repeat(47), '/' + 'a'.repeat(49), '/' + 'b'.repeat(48), `/${token}/extra`])
      expect(isAuthorized(req(bad), token)).toBe(false)
  })
})
