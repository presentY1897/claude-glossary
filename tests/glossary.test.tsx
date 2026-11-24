import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'glossary',
  component: 'Pane',
  requestId: 'glossary',
  props: {
    title: '용어집',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const KEY = 'terms:/proj'

// Nothing sits beneath the plugin: these hooks stand for the engine, and the
// store they answer from is the test's to read.
const world = (on: On, entries: Record<string, unknown> = {}) => {
  const store = new Map(Object.entries(entries))

  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__glossary__define' } }))
  on('session.root', () => ({ value: '/proj' }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return store
}

test('a defined term shows in the pane, on every surface', async ($, on) => {
  const store = world(on)

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ran = await $.tool.call({
    tool: 'mcp__glossary__define',
    term: 'mod',
    definition: 'Claude Code를 바꾸는 플러그인',
  })
  expect(ran.result).toBe('Recorded "mod" in the glossary (session).')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /^mod$/ }))?.text).toBe('mod')
    // Folded, a row shows the definition's start; pressed, the whole of it.
    expect((await ui.find({ type: 'Text', text: /플러그인/ }))?.text).toBe(
      '  Claude Code를 바꾸는 플러그인',
    )
    await ui.press({ key: 'term:mod' })
    expect((await ui.find({ type: 'Text', text: /플러그인/ }))?.text).toBe(
      'Claude Code를 바꾸는 플러그인',
    )
    await ui.press({ key: 'term:mod' })
    await ui.unmount()
  }

  // A session term is not written to the project's store.
  expect(store.get(KEY)).toEqual([])
})

test('a project term is stored, and read back at the next start', async ($, on) => {
  const store = world(on, {
    [KEY]: [{ term: 'pane', definition: '옆에 떠 있는 패널' }],
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__glossary__define',
    term: 'band',
    definition: '프롬프트 위의 띠',
    scope: 'project',
  })

  expect(store.get(KEY)).toEqual([
    { term: 'pane', definition: '옆에 떠 있는 패널' },
    { term: 'band', definition: '프롬프트 위의 띠' },
  ])

  // The model removes a term, a kept one from the store too.
  await $.tool.call({ tool: 'mcp__glossary__define', term: 'tmp', definition: 'x', scope: 'project' })
  const removed = await $.tool.call({ tool: 'mcp__glossary__remove', term: 'TMP' })
  expect(removed.result).toBe('Removed "tmp" from the glossary.')
  expect((store.get(KEY) as unknown[]).length).toBe(2)
  const missing = await $.tool.call({ tool: 'mcp__glossary__remove', term: 'nope' })
  expect(missing.deny).toBe('The glossary has no term "nope".')

  const listed = await $.tool.call({ tool: 'mcp__glossary__list' })
  expect(listed.result).toBe(
    'pane [project]: 옆에 떠 있는 패널\nband [project]: 프롬프트 위의 띠',
  )

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^pane/ }))?.text).toBe('pane ●')
  await ui.unmount()
})

test('an empty glossary says so', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe(
    '아직 용어가 없습니다. /glossary add 용어: 정의',
  )
  await ui.unmount()
})

test('chapters are tabs, and a tab shows its own terms', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const define = (term: string, chapter?: string) =>
    $.tool.call({
      tool: 'mcp__glossary__define',
      term,
      definition: `${term}의 뜻`,
      ...(chapter === undefined ? {} : { chapter }),
    })
  await define('pane', '화면')
  await define('band', '화면')
  await define('hook', '코드')
  await define('mod')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /전체/ }))?.text).toBe(' 전체 4 ')
  expect((await ui.find({ type: 'Text', text: /미분류/ }))?.text).toBe(' 미분류 1 ')

  await ui.press({ key: 'tab:화면' })
  expect(await ui.find({ type: 'Text', text: /^pane$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^band$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^hook$/ })).toBeUndefined()

  // A term defined again without a chapter stays where it was filed.
  await define('hook')
  await ui.press({ key: 'tab:코드' })
  expect(await ui.find({ type: 'Text', text: /^hook$/ })).toBeDefined()

  await ui.input({ key: 'q', text: 'zzz' })
  expect(await ui.find({ type: 'Text', text: /일치하는/ })).toBeDefined()
  await ui.unmount()
})

test('a long glossary is paged', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  for (let n = 1; n <= 20; n++)
    await $.tool.call({
      tool: 'mcp__glossary__define',
      term: `t${String(n).padStart(2, '0')}`,
      definition: 'x',
    })

  // 20 body rows leave 16 for terms: two pages.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^1 \/ 2$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^t16$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^t17$/ })).toBeUndefined()

  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: /^2 \/ 2$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^t17$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^t01$/ })).toBeUndefined()
  await ui.unmount()
})
