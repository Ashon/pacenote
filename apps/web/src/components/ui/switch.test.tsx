import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldLabel, Switch } from './switch'

afterEach(cleanup)

function Toggle({ disabled }: { disabled?: boolean }) {
  const [on, setOn] = useState(false)
  return (
    <Switch
      checked={on}
      onChange={setOn}
      disabled={disabled}
      label="Diagrams"
    />
  )
}

describe('a switch', () => {
  it('turns on and off', () => {
    render(<Toggle />)
    const toggle = screen.getByRole('switch', { name: 'Diagrams' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('does nothing while disabled', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} disabled label="x" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('is named by the row it sits in when it has no label', () => {
    render(
      <div>
        <span id="row-label">Launch at login</span>
        <FieldLabel.Provider value="row-label">
          <Switch checked onChange={() => {}} />
        </FieldLabel.Provider>
      </div>
    )
    expect(screen.getByRole('switch', { name: 'Launch at login' })).toBeTruthy()
  })

  it('keeps its own label over the row', () => {
    render(
      <div>
        <span id="row-label">Row</span>
        <FieldLabel.Provider value="row-label">
          <Switch checked onChange={() => {}} label="Own" />
        </FieldLabel.Provider>
      </div>
    )
    const toggle = screen.getByRole('switch', { name: 'Own' })
    expect(toggle.getAttribute('aria-labelledby')).toBeNull()
  })
})
