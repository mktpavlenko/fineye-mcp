import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { listTags, saveTag, resolveTag, deleteTag } from '../domain/tags.js'
import { output } from '../render.js'
import { FineyeError } from '../errors.js'
export const tagsCmd = new Command('tags')
  .description('List tags')
  .option('--json')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const tags = await listTags(workspaceId)
    if (o.json) {
      console.log(JSON.stringify(tags, null, 2))
      return
    }
    output(
      tags.map((t) => ({ id: t.id, name: t.name })),
      false,
      ['id', 'name'],
    )
  })
export const tagCmd = new Command('tag').description('Create / edit tags')
tagCmd.command('add <name>').action(async (name) => {
  const { session, workspaceId } = await requireWorkspace()
  const saved = await saveTag({ workspace_id: workspaceId, user_id: session.user.id, name })
  console.log(`Created tag ${saved.name} (${saved.id})`)
})
tagCmd
  .command('edit <id>')
  .requiredOption('--name <name>')
  .action(async (id, o) => {
    const { session, workspaceId } = await requireWorkspace()
    const saved = await saveTag({ id, workspace_id: workspaceId, user_id: session.user.id, name: o.name })
    console.log(`Updated tag ${saved.name}`)
  })
tagCmd
  .command('delete <idOrName>')
  .description('PERMANENTLY delete a tag (needs FINEYE_DELETE=1 + --force). Orphaned tag ids stay on transactions.')
  .option('--force', 'confirm the permanent delete')
  .action(async (idOrName, o) => {
    const { workspaceId } = await requireWorkspace()
    const tag = await resolveTag(workspaceId, idOrName)
    if (!tag) throw new FineyeError(`Tag not found: ${idOrName}`, 'not_found')
    if (!o.force) throw new FineyeError(`Refusing to delete tag "${tag.name}" without --force`, 'invalid')
    await deleteTag(tag.id)
    console.log(`Deleted tag ${tag.name}`)
  })
