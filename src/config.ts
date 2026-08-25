import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
export const configDir = () => process.env.FINEYE_CONFIG_DIR ?? join(homedir(), '.config', 'fineye')
const cfgFile = () => join(configDir(), 'config.json')
function read(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(cfgFile(), 'utf8'))
  } catch {
    return {}
  }
}
function write(o: Record<string, unknown>) {
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(cfgFile(), JSON.stringify(o, null, 2))
}
export function setActiveWorkspace(id: string) {
  const o = read()
  o.activeWorkspace = id
  write(o)
}
export function getActiveWorkspace(): string | null {
  return (read().activeWorkspace as string) ?? null
}
