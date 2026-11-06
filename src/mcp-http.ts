import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { BodyTooLargeError, readJsonBody, sendJson } from './http.js'

/**
 * The most an MCP request may carry: a tool call's arguments, a file the
 * broker writes among them. The reasoner's VM is not trusted, so a body is
 * never read without an end.
 */
export const MCP_BODY_LIMIT = 16 * 1024 * 1024

/** An MCP server, as both the SDK's Server and McpServer are */
export interface McpConnectable {
  connect(transport: Transport): Promise<void>
  close(): Promise<void>
}

/**
 * Serves one MCP request with no session: only POST (there is no SSE stream
 * or session to end), a server made for this request alone and closed with
 * its response. A body past maxBody gets 413 and one that is not JSON 400,
 * both before any server is made. around, when given, runs the request (the
 * broker keeps who asked in an async context around it).
 */
export async function serveStatelessMcp(
  req: IncomingMessage,
  res: ServerResponse,
  makeServer: () => McpConnectable,
  options: {
    maxBody?: number
    around?: (handle: () => Promise<void>) => Promise<void>
  } = {}
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST', 'Content-Length': '0' }).end()
    return
  }
  let body: unknown
  try {
    body = await readJsonBody(req, options.maxBody ?? MCP_BODY_LIMIT)
  } catch (error) {
    const tooLarge = error instanceof BodyTooLargeError
    sendJson(
      res,
      tooLarge ? 413 : 400,
      {
        jsonrpc: '2.0',
        error: tooLarge
          ? { code: -32600, message: 'Request body too large' }
          : { code: -32700, message: 'Parse error' },
        id: null,
      },
      tooLarge ? { Connection: 'close' } : {}
    )
    return
  }
  const server = makeServer()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  const handle = () => transport.handleRequest(req, res, body)
  await (options.around ? options.around(handle) : handle())
}
