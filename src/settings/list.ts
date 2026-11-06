/**
 * A list setting's items: comma-separated, each trimmed, empty ones left out
 * ("a, b,,c " is a, b and c)
 */
export function splitList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
