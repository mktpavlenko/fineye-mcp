import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { listCategories, saveCategory, resolveCategory, archiveCategory, deleteCategory, countCategoryUsage } from '../domain/categories.js'
import { output } from '../render.js'
import { FineyeError } from '../errors.js'
export const categoriesCmd = new Command('categories')
  .description('List categories')
  .option('--archived', 'include archived categories')
  .option('--json')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const all = await listCategories(workspaceId)
    const cats = o.archived ? all : all.filter((c) => !c.archived_at)
    const titleById = new Map(all.map((c) => [c.id, c.title]))
    if (o.json) {
      // raw categories (budget stays an object) + a convenience parentTitle so the
      // agent sees the hierarchy without re-joining (parent id is still present)
      console.log(
        JSON.stringify(
          cats.map((c) => ({ ...c, parentTitle: c.parent ? (titleById.get(c.parent) ?? null) : null })),
          null,
          2,
        ),
      )
      return
    }
    output(
      cats.map((c) => ({
        id: c.id,
        title: c.title,
        parent: c.parent ? (titleById.get(c.parent) ?? c.parent) : '',
        type: c.type ?? '',
        budget: c.budget != null ? JSON.stringify(c.budget) : '',
      })),
      false,
      ['id', 'title', 'parent', 'type', 'budget'],
    )
  })
export const catCmd = new Command('cat').description('Create / edit categories (title/type/icon/color/emoji)')
catCmd
  .command('add <title>')
  .option('--type <type>', 'income|expense')
  .option('--icon <icon>')
  .option('--color <color>')
  .option('--emoji <emoji>')
  .option('--parent <name|id>', 'create as a sub-category of this parent')
  .action(async (title, o) => {
    const { session, workspaceId } = await requireWorkspace()
    const parent = o.parent ? await resolveCategory(workspaceId, o.parent) : null
    const saved = await saveCategory({
      workspace_id: workspaceId,
      user_id: session.user.id,
      title,
      type: o.type ?? parent?.type, // inherit the parent's type when not given
      icon: o.icon,
      color: o.color,
      emoji: o.emoji,
      parent: parent?.id ?? null,
    })
    console.log(`Created category ${saved.title} (${saved.id})${parent ? ` under ${parent.title}` : ''}`)
  })
catCmd
  .command('edit <id>')
  .option('--title <title>')
  .option('--type <type>')
  .option('--icon <icon>')
  .option('--color <color>')
  .option('--emoji <emoji>')
  .option('--parent <name|id>', 'move under this parent category')
  .option('--clear-parent', 'promote to a top-level category')
  .action(async (id, o) => {
    const { session, workspaceId } = await requireWorkspace()
    if (o.parent && o.clearParent) throw new FineyeError('Use either --parent or --clear-parent, not both', 'invalid')
    const existing = (await listCategories(workspaceId)).find((c) => c.id === id)
    if (!existing) throw new FineyeError(`Category not found: ${id}`, 'not_found')
    let parent = existing.parent ?? null
    if (o.clearParent) parent = null
    else if (o.parent) {
      const p = await resolveCategory(workspaceId, o.parent)
      if (p.id === id) throw new FineyeError('A category cannot be its own parent', 'invalid')
      parent = p.id
    }
    const saved = await saveCategory({
      ...existing,
      workspace_id: workspaceId,
      user_id: session.user.id,
      id,
      title: o.title ?? existing.title,
      type: o.type ?? existing.type,
      icon: o.icon ?? existing.icon,
      color: o.color ?? existing.color,
      emoji: o.emoji ?? existing.emoji,
      parent,
    })
    console.log(`Updated category ${saved.title}`)
  })
catCmd
  .command('archive <id>')
  .description("Archive a category (reversible soft-delete — hides it, the app's own mechanism)")
  .action(async (id) => {
    const { workspaceId } = await requireWorkspace()
    const existing = (await listCategories(workspaceId)).find((c) => c.id === id)
    if (!existing) throw new FineyeError(`Category not found: ${id}`, 'not_found')
    await archiveCategory(id, true)
    console.log(`Archived category ${existing.title} (reversible: fineye cat unarchive ${id})`)
  })
catCmd
  .command('unarchive <id>')
  .description('Restore an archived category')
  .action(async (id) => {
    const { workspaceId } = await requireWorkspace()
    const existing = (await listCategories(workspaceId)).find((c) => c.id === id)
    if (!existing) throw new FineyeError(`Category not found: ${id}`, 'not_found')
    await archiveCategory(id, false)
    console.log(`Unarchived category ${existing.title}`)
  })
catCmd
  .command('delete <id>')
  .description('PERMANENTLY delete a category (irreversible; prefer `cat archive`). Needs FINEYE_DELETE=1 + --force.')
  .option('--force', 'confirm the permanent delete')
  .action(async (id, o) => {
    const { workspaceId } = await requireWorkspace()
    const existing = (await listCategories(workspaceId)).find((c) => c.id === id)
    if (!existing) throw new FineyeError(`Category not found: ${id}`, 'not_found')
    const used = await countCategoryUsage(workspaceId, id)
    if (!o.force)
      throw new FineyeError(
        `Refusing to delete "${existing.title}" without --force` +
          (used ? ` — ${used} transactions use it and would keep an orphaned category id; consider \`cat archive\` instead` : ''),
        'gate',
      )
    await deleteCategory(id)
    console.log(`Deleted category ${existing.title}${used ? ` (${used} transactions now have an orphaned category id)` : ''}`)
  })
