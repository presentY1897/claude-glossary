export type GlossaryScope = 'session' | 'project'

export type GlossaryTerm = {
  term: string
  definition: string
  scope: GlossaryScope
  /** The chapter the term is filed under; absent while unfiled. */
  chapter?: string
}

export type GlossaryView = {
  /** The tab shown: `null` every term, `""` the unfiled ones, else a chapter. */
  chapter: string | null
  query: string
  page: number
  /** The term whose definition is unfolded, if any. */
  open: string | null
}

declare module 'claude-code' {
  interface PluginState {
    glossary: { terms: Shaped<GlossaryTerm[]>; view: Shaped<GlossaryView> }
  }
}
