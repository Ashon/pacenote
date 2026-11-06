/**
 * Where a reasoner VM reaches this Mac: its run's door (vm-broker.ts).
 * Behind it, the ops broker at /mcp, Pace's own tools at OWN_TOOLS_PATH and
 * your MCP servers under SERVERS_PATH.
 */
export const DOOR_URL = 'http://127.0.0.1:8080'
/** The ops broker, behind the door */
export const BROKER_PATH = '/mcp'
/** Everything of Pace's behind the door; anything else goes to the broker */
export const PACE_PREFIX = '/pace/'
/** Pace's own tools (pace/tools.ts) */
export const OWN_TOOLS_PATH = '/pace/mcp'
/** Your MCP servers, one each at <name>/mcp (pace/mcp-relay.ts) */
export const SERVERS_PATH = '/pace/servers/'
