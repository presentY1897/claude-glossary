export type GlossaryScope = 'session' | 'project'

export type GlossaryTerm = {
  term: string
  definition: string
  scope: GlossaryScope
}

declare module 'claude-code' {
  interface PluginState {
    glossary: { terms: Shaped<GlossaryTerm[]> }
  }
}
