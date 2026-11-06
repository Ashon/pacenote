import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InlineError } from './inline-error'

afterEach(cleanup)

describe('an inline error', () => {
  it('says why, read out as it shows', () => {
    render(<InlineError error="The folder is not a git repository." />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('The folder is not a git repository.')
    expect(alert.className).toContain('text-status-failed')
  })

  it('shows nothing without an error', () => {
    const { container } = render(
      <>
        <InlineError />
        <InlineError error="" />
        <InlineError error={null} />
      </>
    )
    expect(container.innerHTML).toBe('')
  })

  it('takes the size and room it is given', () => {
    render(<InlineError error="Not saved." className="mt-2 text-meta" />)
    const { className } = screen.getByRole('alert')
    expect(className).toContain('text-meta')
    expect(className).not.toContain('text-copy')
    expect(className).toContain('mt-2')
  })
})
