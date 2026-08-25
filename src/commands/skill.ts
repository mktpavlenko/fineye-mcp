import { Command } from 'commander'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildSkillDoc } from '../skill/skillDoc.js'
export function defaultSkillPath() {
  return join(homedir(), '.claude', 'skills', 'use-fineye', 'SKILL.md')
}
export const skillCmd = new Command('skill')
  .description('Print or install the AI-agent skill for using fineye')
  .option('--install', 'write the skill to disk')
  .option('--dir <path>', 'install target file path')
  .action((o) => {
    const doc = buildSkillDoc()
    if (!o.install) {
      process.stdout.write(doc + '\n')
      return
    }
    const target = o.dir ?? defaultSkillPath()
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, doc)
    console.log(`Installed use-fineye skill to ${target}`)
  })
