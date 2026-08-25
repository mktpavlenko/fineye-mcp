import { describe, it, expect, beforeEach } from 'vitest'
import { setActiveWorkspace, getActiveWorkspace, configDir } from '../src/config.js'
import { rmSync } from 'node:fs'
describe('config', () => {
  beforeEach(() => {
    try {
      rmSync(configDir(), { recursive: true, force: true })
    } catch {
      // no leftover dir from a previous run
    }
  })
  it('persists active workspace id', () => {
    expect(getActiveWorkspace()).toBeNull()
    setActiveWorkspace('ws-123')
    expect(getActiveWorkspace()).toBe('ws-123')
  })
})
