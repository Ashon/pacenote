import { ProcessExitError } from '../sandbox/process.js'
import type { Requester, Sandbox } from '../sandbox/runtime.js'
import { claudeAdapter } from './claude.js'
import { codexAdapter } from './codex.js'
import type { ReasonerId } from './ids.js'
import type {
  CliAdapter,
  McpServerRef,
  Reasoner,
  ReasonerOptions,
  ReasonRequest,
} from './types.js'

/**
 * The CLI adapters by id. Adding a CLI: an adapter here, its id in ids.ts, and
 * the CLI in the reasoner image.
 */
const ADAPTERS: Record<ReasonerId, CliAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
}

/**
 * Runs any CLI adapter in a sandbox: the invocation from the adapter, the
 * process from the sandbox
 */
export class CliReasoner implements Reasoner {
  readonly backend: ReasonerId
  readonly sandbox: Sandbox['kind']
  readonly canReadFiles: boolean
  readonly mcpServerNames: string[]

  constructor(
    private readonly adapter: CliAdapter,
    private readonly options: ReasonerOptions,
    private readonly box: Sandbox
  ) {
    this.backend = adapter.id
    this.sandbox = box.kind
    this.canReadFiles = adapter.canReadFiles(box)
    this.mcpServerNames = (options.mcpServers ?? []).map(
      (server) => server.name
    )
  }

  yourServers(requester: Requester | undefined): McpServerRef[] {
    return this.options.yourServers?.(requester) ?? []
  }

  async complete(request: ReasonRequest): Promise<string> {
    const readOnlyDir = this.canReadFiles ? request.readOnlyDir : undefined
    const yours = this.yourServers(request.requester)
    const { after, ...invocation } = await this.adapter.invocation(request, {
      sandbox: this.box,
      options:
        yours.length > 0
          ? {
              ...this.options,
              mcpServers: [...(this.options.mcpServers ?? []), ...yours],
            }
          : this.options,
      readOnlyDir,
    })
    const onEvent = request.onEvent
    try {
      const { stdout } = await this.box.run({
        ...invocation,
        timeoutMs: this.options.timeoutMs,
        signal: request.signal,
        requester: request.requester,
        onOutputLine: onEvent
          ? (line) =>
              this.adapter.events(line).forEach((event) => onEvent(event))
          : undefined,
      })
      return this.adapter.answer(stdout)
    } catch (err) {
      const reason =
        err instanceof ProcessExitError
          ? this.adapter.failure(err.stdout)
          : undefined
      if (reason) throw new Error(reason, { cause: err })
      throw err
    } finally {
      await after?.()
    }
  }
}

export function createReasoner(
  options: ReasonerOptions,
  sandbox: Sandbox
): Reasoner {
  return new CliReasoner(ADAPTERS[options.backend], options, sandbox)
}
