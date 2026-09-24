// The little of Node the tests and benches use, so they type-check without
// pulling in @types/node for the sake of three names.
declare const process: {
  env: Record<string, string | undefined>
  exitCode?: number
  exit(code?: number): never
}
