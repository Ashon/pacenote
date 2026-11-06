import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * HTTP helpers shared by the servers Pacenote runs: Pace's own tools and your
 * MCP servers behind a run's door, the ops broker and the team hub. It
 * imports nothing but Node's, so each bundle (the broker's VM and the hub
 * among them) takes it as it is.
 */

/** A request body larger than its reader takes */
export class BodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`Request body too large (over ${limit} bytes)`)
  }
}

/**
 * Reads a request's body whole, up to limit bytes. Past it, it stops keeping
 * what comes (the rest is drained, not held) and rejects with
 * BodyTooLargeError.
 */
export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        req.off('data', onData)
        chunks.length = 0
        req.resume()
        reject(new BodyTooLargeError(limit))
        return
      }
      chunks.push(chunk)
    }
    req.on('data', onData)
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** A request's JSON body (undefined when empty), up to limit bytes */
export async function readJsonBody(
  req: IncomingMessage,
  limit: number
): Promise<unknown> {
  const text = (await readBody(req, limit)).toString('utf8')
  return text ? JSON.parse(text) : undefined
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  for (const [name, value] of Object.entries(headers))
    res.setHeader(name, value)
  res.end(JSON.stringify(body))
}
