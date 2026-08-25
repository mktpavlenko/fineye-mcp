import { it, expect } from 'vitest'
import { extractCode, pollClipboardForCode, captureCode } from '../src/auth/capture.js'
it('empty prompt entry does NOT abort the login — the clipboard branch still wins', async () => {
  const code = await captureCode({ readClipboard: async () => 'http://x/?code=CLIP', promptCode: async () => '', timeoutMs: 2000 })
  expect(code).toBe('CLIP')
})
it('captureCode rejects only at the clipboard timeout when nothing arrives', async () => {
  // empty/EOF prompt parks the manual branch (no spin); the clipboard timeout bounds the wait
  await expect(captureCode({ readClipboard: async () => '', promptCode: async () => '', timeoutMs: 10 })).rejects.toThrow(/no auth code/i)
})
it('extractCode from full redirect URL', () => {
  expect(extractCode('http://10.0.0.1:8100/?code=abc-123')).toBe('abc-123')
})
it('extractCode from raw uuid', () => {
  expect(extractCode('abc-123-def-456-789012')).toBe('abc-123-def-456-789012')
})
it('extractCode returns null for noise', () => {
  expect(extractCode('hello world')).toBeNull()
})
it('pollClipboardForCode resolves when code appears', async () => {
  const seq = ['nothing', 'still', 'http://x/?code=THECODE']
  let i = 0
  const code = await pollClipboardForCode(async () => seq[Math.min(i++, seq.length - 1)], {
    intervalMs: 1,
    timeoutMs: 1000,
    ignore: 'nothing',
  })
  expect(code).toBe('THECODE')
})
