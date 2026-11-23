import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GlossaryScope, GlossaryTerm } from '../types'

const PANE = 'glossary'
const TITLE = '용어집'
const DEFINE = 'mcp__glossary__define'
const LIST = 'mcp__glossary__list'
const USAGE = [
  '/glossary                  패널 열기',
  '/glossary close            패널 닫기',
  '/glossary add 용어: 정의   용어 추가 (같은 용어는 덮어씀)',
  '/glossary rm 용어          용어 삭제',
  '/glossary keep 용어        프로젝트에 보관',
  '/glossary unkeep 용어      이 세션에만 두기',
].join('\n')

// Change the tag when a term's fields change: it declines what an earlier
// version stored, which outlives a reload.
const terms = atom({ plugin: 'glossary', key: 'terms' } as const, [], {
  shape: 'terms-1',
})

const isSame = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

const scopeOf = (value: unknown, fallback: GlossaryScope): GlossaryScope =>
  value === 'project' || value === 'session' ? value : fallback

// Project terms are kept per project folder, so one store serves every project.
const storeKey = async ($: EngineInterface) =>
  `terms:${await $.session.root()}`

const kept = async ($: EngineInterface): Promise<GlossaryTerm[]> => {
  const raw = await $.store.get(await storeKey($))
  if (!Array.isArray(raw)) return []

  return raw.flatMap((one: unknown): GlossaryTerm[] => {
    const { term, definition } = (one ?? {}) as Record<string, unknown>

    return typeof term === 'string' && typeof definition === 'string'
      ? [{ term, definition, scope: 'project' }]
      : []
  })
}

const persist = async ($: EngineInterface) => {
  const list = await read($, terms)

  await $.store.set(
    await storeKey($),
    list
      .filter(one => one.scope === 'project')
      .map(({ term, definition }) => ({ term, definition })),
  )
}

const put = async ($: EngineInterface, entry: GlossaryTerm) => {
  await update($, terms, list => [
    ...list.filter(one => !isSame(one.term, entry.term)),
    entry,
  ])
  await persist($)
}

const find = async ($: EngineInterface, name: string) =>
  (await read($, terms)).find(one => isSame(one.term, name))

export const register: Register = (on, options) => {
  const defaultScope = scopeOf(options.defaultScope, 'session')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'glossary',
      description: '용어집 패널 열기, 용어 추가·삭제·보관',
      argumentHint: '[add 용어: 정의 | rm 용어 | keep 용어 | unkeep 용어 | close]',
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
          scope: {
            type: 'string',
            enum: ['session', 'project'],
            description:
              "'session' keeps it for this conversation only; 'project' keeps it across sessions for this project folder. Leave out to use the user's default.",
          },
        },
        required: ['term', 'definition'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'list',
      description:
        "Lists every term in the user's glossary with its definition and scope, including terms kept for this project in earlier sessions. Read it before relying on a project term you were not told the meaning of.",
      isDeferred: false,
    })

    // A reload keeps the session's terms; the project's are read afresh.
    const saved = await kept($)
    await update($, terms, list => [
      ...list.filter(
        one =>
          one.scope === 'session' &&
          !saved.some(other => isSame(other.term, one.term)),
      ),
      ...saved,
    ])

    if (options.openOnStart === true) void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'glossary' }, async ($, e) => {
    const args = e.args.trim()
    const verb = args.split(/\s+/)[0] ?? ''
    const body = args.slice(verb.length).trim()
    const say = (text: string) => ({ text, isTextDisplayOnly: true as const })

    if (verb === '') {
      await $.ui.open({ id: PANE, title: TITLE })

      return say('용어집을 열었습니다.')
    }

    if (verb === 'close') {
      await $.ui.close({ id: PANE })

      return say('용어집을 닫았습니다.')
    }

    if (verb === 'add') {
      const cut = body.search(/[:：]/)
      const term = cut < 0 ? '' : body.slice(0, cut).trim()
      const definition = cut < 0 ? '' : body.slice(cut + 1).trim()
      if (term === '' || definition === '') return say(USAGE)
      await put($, { term, definition, scope: defaultScope })

      return say(
        `추가: ${term} (${defaultScope === 'project' ? '프로젝트 보관' : '이 세션'})`,
      )
    }

    if (verb === 'rm' || verb === 'keep' || verb === 'unkeep') {
      const found = body === '' ? undefined : await find($, body)
      if (found === undefined) return say(`용어집에 없는 용어입니다: ${body}`)

      if (verb === 'rm') {
        await update($, terms, list =>
          list.filter(one => !isSame(one.term, found.term)),
        )
        await persist($)

        return say(`삭제: ${found.term}`)
      }

      await put($, { ...found, scope: verb === 'keep' ? 'project' : 'session' })

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

    const scope = scopeOf(input.scope, defaultScope)
    await put($, { term, definition, scope })
    $.ui.toast(`용어집에 추가: ${term}`)

    return { result: `Recorded "${term}" in the glossary (${scope}).` }
  })

  on('tool.call', { tool: LIST }, async $ => {
    const list = await read($, terms)

    return {
      result:
        list.length === 0
          ? 'The glossary is empty.'
          : list
              .map(one => `${one.term} [${one.scope}]: ${one.definition}`)
              .join('\n'),
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = [...(await read($, terms))].sort((a, b) =>
      a.term.localeCompare(b.term),
    )

    return (
      <Box flexDirection="column">
        {list.length === 0 && (
          <Text dimColor>아직 용어가 없습니다. /glossary add 용어: 정의</Text>
        )}
        {list.map(one => (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>
              {one.scope === 'project' ? `${one.term} ●` : one.term}
            </Text>
            <Text wrap="wrap">{one.definition}</Text>
          </Box>
        ))}
        {list.length > 0 && (
          <Text dimColor>● 프로젝트에 보관 · 표시 없음은 이 세션만</Text>
        )}
      </Box>
    )
  })
}
