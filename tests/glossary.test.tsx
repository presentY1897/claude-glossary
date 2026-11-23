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
    expect((await ui.find({ type: 'Text', text: /플러그인/ }))?.text).toBe(
      'Claude Code를 바꾸는 플러그인',
    )
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
