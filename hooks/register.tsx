import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GlossaryScope, GlossaryTerm, GlossaryView } from '../types'

const PANE = 'glossary'
const TITLE = '용어집'
const DEFINE = 'mcp__glossary__define'
const LIST = 'mcp__glossary__list'
const REMOVE = 'mcp__glossary__remove'
const UNFILED = '미분류'
const USAGE = [
  '/glossary                      패널 열기',
  '/glossary close                패널 닫기',
  '/glossary add 용어: 정의       용어 추가 (같은 용어는 덮어씀)',
  '/glossary rm 용어              용어 삭제',
  '/glossary chapter 용어: 챕터   챕터 지정 (챕터를 비우면 미분류)',
  '/glossary keep 용어            프로젝트에 보관',
  '/glossary unkeep 용어          이 세션에만 두기',
].join('\n')

// Change a tag when its value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const terms = atom({ plugin: 'glossary', key: 'terms' } as const, [], {
  shape: 'terms-1',
})
const START: GlossaryView = { chapter: null, query: '', page: 0, open: null }
const view = atom({ plugin: 'glossary', key: 'view' } as const, START, {
  shape: 'view-1',
})

const isSame = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

const scopeOf = (value: unknown, fallback: GlossaryScope): GlossaryScope =>
  value === 'project' || value === 'session' ? value : fallback

// A wide character (Hangul, CJK, full-width forms) takes two cells.
const cells = (char: string) => ((char.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1)
const widthOf = (text: string) =>
  [...text].reduce((sum, char) => sum + cells(char), 0)
const clip = (text: string, room: number) => {
  if (widthOf(text) <= room) return text
  let out = ''
  let used = 0
  for (const char of text) {
    if (used + cells(char) > room - 1) break
    out += char
    used += cells(char)
  }

  return `${out}…`
}

// Project terms are kept per project folder, so one store serves every project.
const storeKey = async ($: EngineInterface) =>
  `terms:${await $.session.root()}`

const kept = async ($: EngineInterface): Promise<GlossaryTerm[]> => {
  const raw = await $.store.get(await storeKey($))
  if (!Array.isArray(raw)) return []

  return raw.flatMap((one: unknown): GlossaryTerm[] => {
    const { term, definition, chapter } = (one ?? {}) as Record<string, unknown>
    if (typeof term !== 'string' || typeof definition !== 'string') return []

    return typeof chapter === 'string' && chapter !== ''
      ? [{ term, definition, scope: 'project', chapter }]
      : [{ term, definition, scope: 'project' }]
  })
}

const find = async ($: EngineInterface, name: string) =>
  (await read($, terms)).find(one => isSame(one.term, name))

// The session's terms stay; the project's are whatever the store holds now.
const refresh = async ($: EngineInterface) => {
  const saved = await kept($)

  await update($, terms, list => [
    ...list.filter(
      one =>
        one.scope === 'session' &&
        !saved.some(other => isSame(other.term, one.term)),
    ),
    ...saved,
  ])
}

// Writes one term's change over the store as it stands, not the whole of this
// session's list: another session of the project may have kept terms since.
const sync = async ($: EngineInterface, name: string) => {
  const now = await find($, name)
  const rest = (await kept($)).filter(one => !isSame(one.term, name))

  await $.store.set(
    await storeKey($),
    [...rest, ...(now?.scope === 'project' ? [now] : [])].map(
      ({ term, definition, chapter }) =>
        chapter === undefined ? { term, definition } : { term, definition, chapter },
    ),
  )
  await refresh($)
}

type Entry = Omit<GlossaryTerm, 'scope'> & { scope?: GlossaryScope }

// A term defined again keeps its chapter and its scope unless the new entry
// names one; an empty chapter unfiles it.
const put = async (
  $: EngineInterface,
  entry: Entry,
  fallback: GlossaryScope,
): Promise<GlossaryTerm> => {
  const before = await find($, entry.term)
  const chapter = (entry.chapter ?? before?.chapter ?? '').trim()
  const scope = entry.scope ?? before?.scope ?? fallback
  const { term, definition } = entry
  const stored: GlossaryTerm =
    chapter === '' ? { term, definition, scope } : { term, definition, scope, chapter }

  await update($, terms, list => [
    ...list.filter(one => !isSame(one.term, term)),
    stored,
  ])
  await sync($, term)

  return stored
}

const drop = async ($: EngineInterface, name: string) => {
  await update($, terms, list => list.filter(one => !isSame(one.term, name)))
  await sync($, name)
}

export const register: Register = (on, options) => {
  const defaultScope = scopeOf(options.defaultScope, 'session')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'glossary',
      description: '용어집 패널 열기, 용어 추가·삭제·챕터·보관',
      argumentHint:
        '[add 용어: 정의 | rm 용어 | chapter 용어: 챕터 | keep 용어 | unkeep 용어 | close]',
    })
    await $.tool.register({
      name: 'define',
      description:
        "Records a term in the user's glossary pane. Call it, without being asked, whenever a term is given a specific meaning in this conversation: coined, defined or agreed on by the user or by you. Write the definition in the user's language, in one or two sentences. Defining a term again replaces its definition.",
      inputSchema: {
        type: 'object',
        properties: {
          term: { type: 'string', description: 'The term, as it is used.' },
          definition: { type: 'string', description: 'What it means here.' },
          chapter: {
            type: 'string',
            description:
              "The chapter (topic group) to file it under, a word or two in the user's language; the pane shows one tab per chapter. Reuse a chapter the glossary already has where one fits. Leave out to keep the term's chapter.",
          },
          scope: {
            type: 'string',
            enum: ['session', 'project'],
            description:
              "'session' keeps it for this conversation only; 'project' keeps it across sessions for this project folder. Leave out to keep the term's scope, or for a new term to use the user's default.",
          },
        },
        required: ['term', 'definition'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'remove',
      description:
        "Removes a term from the user's glossary, a term kept for the project included. Call it when the user asks for a term to be deleted, or when a term was recorded by mistake. To change a term's definition, chapter or scope, call define again instead.",
      inputSchema: {
        type: 'object',
        properties: {
          term: { type: 'string', description: 'The term to remove.' },
        },
        required: ['term'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'list',
      description:
        "Lists every term in the user's glossary with its definition, scope and chapter, including terms kept for this project in earlier sessions. Read it before relying on a project term you were not told the meaning of, and before choosing a chapter for a new term.",
      isDeferred: false,
    })

    // A reload keeps the session's terms; the project's are read afresh.
    await refresh($)

    if (options.openOnStart === true)
      void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'glossary' }, async ($, e) => {
    const args = e.args.trim()
    const verb = args.split(/\s+/)[0] ?? ''
    const body = args.slice(verb.length).trim()
    const cut = body.search(/[:：]/)
    const head = cut < 0 ? body : body.slice(0, cut).trim()
    const tail = cut < 0 ? '' : body.slice(cut + 1).trim()
    const say = (text: string) => ({ text, isTextDisplayOnly: true as const })

    if (verb === '') {
      // Typed by the person, so the pane takes the keys: no chord or click
      // is needed to walk it, and Escape hands them back.
      await $.ui.open({ id: PANE, title: TITLE, focus: true })

      return say('용어집을 열었습니다.')
    }

    if (verb === 'close') {
      await $.ui.close({ id: PANE })

      return say('용어집을 닫았습니다.')
    }

    if (verb === 'add') {
      if (head === '' || tail === '') return say(USAGE)
      const stored = await put($, { term: head, definition: tail }, defaultScope)

      return say(
        `추가: ${head} (${stored.scope === 'project' ? '프로젝트 보관' : '이 세션'})`,
      )
    }

    if (verb === 'chapter') {
      if (body === '') return say(USAGE)
      // A term may hold a colon itself: the whole line first (no chapter, so
      // unfile), then the last colon, then the first.
      const last = Math.max(body.lastIndexOf(':'), body.lastIndexOf('：'))
      const splits: [string, string][] = [
        [body, ''],
        ...(cut < 0
          ? []
          : ([
              [body.slice(0, last).trim(), body.slice(last + 1).trim()],
              [head, tail],
            ] as [string, string][])),
      ]
      for (const [name, chapter] of splits) {
        const found = name === '' ? undefined : await find($, name)
        if (found === undefined) continue
        await put($, { ...found, chapter }, defaultScope)

        return say(`${found.term} → ${chapter === '' ? UNFILED : chapter}`)
      }

      return say(`용어집에 없는 용어입니다: ${head}`)
    }

    if (['rm', 'keep', 'unkeep'].includes(verb)) {
      if (body === '') return say(USAGE)
      const found = await find($, body)
      if (found === undefined) return say(`용어집에 없는 용어입니다: ${body}`)

      if (verb === 'rm') {
        await drop($, found.term)

        return say(`삭제: ${found.term}`)
      }

      await put(
        $,
        { ...found, scope: verb === 'keep' ? 'project' : 'session' },
        defaultScope,
      )

      return say(
        verb === 'keep'
          ? `프로젝트에 보관: ${found.term}`
          : `이 세션에만 둠: ${found.term}`,
      )
    }

    return say(USAGE)
  })

  // Answered at tool.call, ahead of the permission check: adding a line to
  // the person's own glossary asks them nothing.
  on('tool.call', { tool: DEFINE }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    const term = typeof input.term === 'string' ? input.term.trim() : ''
    const definition =
      typeof input.definition === 'string' ? input.definition.trim() : ''
    if (term === '' || definition === '')
      return { deny: 'define needs a term and a definition.' }

    const entry: Entry = { term, definition }
    if (input.scope === 'project' || input.scope === 'session')
      entry.scope = input.scope
    if (typeof input.chapter === 'string' && input.chapter.trim() !== '')
      entry.chapter = input.chapter.trim()
    const { scope } = await put($, entry, defaultScope)
    $.ui.toast(`용어집에 추가: ${term}`)

    return { result: `Recorded "${term}" in the glossary (${scope}).` }
  })

  on('tool.call', { tool: REMOVE }, async ($, e) => {
    const { term } = e as unknown as Record<string, unknown>
    if (typeof term !== 'string' || term.trim() === '')
      return { deny: 'remove needs a term.' }
    const found = await find($, term)
    if (found === undefined)
      return { deny: `The glossary has no term "${term.trim()}".` }

    await drop($, found.term)
    $.ui.toast(`용어집에서 삭제: ${found.term}`)

    return { result: `Removed "${found.term}" from the glossary.` }
  })

  on('tool.call', { tool: LIST }, async $ => {
    const list = await read($, terms)

    return {
      result:
        list.length === 0
          ? 'The glossary is empty.'
          : list
              .map(one => {
                const tags = [one.scope, one.chapter].filter(Boolean).join(', ')

                // One term to a line, whatever its definition holds.
                return `${one.term} [${tags}]: ${one.definition.replace(/\s*\n\s*/g, ' ')}`
              })
              .join('\n'),
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const all = [...(await read($, terms))].sort((a, b) =>
      a.term.localeCompare(b.term),
    )
    const now = await read($, view)
    const set = (change: Partial<GlossaryView>) =>
      update($, view, before => ({ ...before, ...change }))

    if (all.length === 0)
      return <Text dimColor>아직 용어가 없습니다. /glossary add 용어: 정의</Text>

    // One tab per chapter, and one for the unfiled once any term is filed.
    const chapters = [...new Set(all.flatMap(one => one.chapter ?? []))].sort(
      (a, b) => a.localeCompare(b),
    )
    const unfiled = all.filter(one => one.chapter === undefined).length
    const tabs: { id: string | null; label: string; count: number }[] =
      chapters.length === 0
        ? []
        : [
            { id: null, label: '전체', count: all.length },
            ...chapters.map(name => ({
              id: name,
              label: name,
              count: all.filter(one => one.chapter === name).length,
            })),
            ...(unfiled > 0 ? [{ id: '', label: UNFILED, count: unfiled }] : []),
          ]
    // A chapter whose last term left falls back to every term.
    const tab = tabs.some(one => one.id === now.chapter) ? now.chapter : null

    const query = now.query.trim().toLowerCase()
    const shown = all
      .filter(one => tab === null || (one.chapter ?? '') === tab)
      .filter(
        one =>
          query === '' ||
          one.term.toLowerCase().includes(query) ||
          one.definition.toLowerCase().includes(query),
      )

    const size = Math.max(5, e.props.scroll.bodyRows - (tabs.length > 0 ? 5 : 4))
    const pages = Math.max(1, Math.ceil(shown.length / size))
    const page = Math.min(Math.max(0, now.page), pages - 1)
    const columns = e.props.bodyColumns

    return (
      <Box flexDirection="column">
        {tabs.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {tabs.map(one => (
              <Button
                key={
                  one.id === null ? 'all' : one.id === '' ? 'unfiled' : `tab:${one.id}`
                }
                plain
                onPress={() => set({ chapter: one.id, page: 0, open: null })}
              >
                {one.id === tab ? (
                  <Text inverse>{` ${one.label} ${one.count} `}</Text>
                ) : (
                  <Text dimColor>{` ${one.label} ${one.count} `}</Text>
                )}
              </Button>
            ))}
          </Box>
        )}
        <Input
          key="q"
          placeholder="검색"
          value={now.query}
          onInput={value => set({ query: value, page: 0 })}
          onSubmit={value => set({ query: value, page: 0 })}
        />
        {shown.length === 0 && <Text dimColor>일치하는 용어가 없습니다.</Text>}
        {shown.slice(page * size, (page + 1) * size).map(one => {
          const isOpen = now.open !== null && isSame(now.open, one.term)
          const name = one.scope === 'project' ? `${one.term} ●` : one.term
          const room = columns - widthOf(name) - 4
          const firstLine = one.definition.split('\n')[0] ?? ''

          return (
            <Box flexDirection="column">
              <Button
                key={`term:${one.term}`}
                plain
                onPress={() => set({ open: isOpen ? null : one.term })}
              >
                {isOpen ? '▾ ' : '▸ '}
                <Text bold>{name}</Text>
                {!isOpen && room >= 8 && (
                  <Text dimColor>{`  ${clip(firstLine, room)}`}</Text>
                )}
              </Button>
              {isOpen && (
                <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
                  <Text wrap="wrap">{one.definition}</Text>
                  <Text dimColor>
                    {`${one.chapter ?? UNFILED} · ${one.scope === 'project' ? '프로젝트 보관' : '이 세션'}`}
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}
        {pages > 1 && (
          <Box flexDirection="row" columnGap={2}>
            <Button
              key="prev"
              plain
              hotkey="p"
              onPress={() => set({ page: (page + pages - 1) % pages, open: null })}
            >
              ◀
            </Button>
            <Text>{`${page + 1} / ${pages}`}</Text>
            <Button
              key="next"
              plain
              hotkey="n"
              onPress={() => set({ page: (page + 1) % pages, open: null })}
            >
              ▶
            </Button>
          </Box>
        )}
      </Box>
    )
  })
}
