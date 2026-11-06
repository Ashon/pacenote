import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Segmented } from './segmented'
import { FieldLabel } from './switch'

afterEach(cleanup)

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

function Theme() {
  const [theme, setTheme] = useState<string>('system')
  return (
    <Segmented
      label="Theme"
      value={theme}
      options={[...THEMES]}
      onChange={setTheme}
    />
  )
}

const checked = () =>
  screen
    .getAllByRole('radio')
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.textContent)

describe('a row of segments', () => {
  it('has one option chosen, and moves it on a click', () => {
    render(<Theme />)
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy()
    expect(checked()).toEqual(['System'])
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(checked()).toEqual(['Dark'])
  })

  it('takes numbers as values', () => {
    let picked = 0
    render(
      <Segmented
        label="Speed"
        value={1}
        options={[
          { value: 0.5, label: '0.5×' },
          { value: 1, label: '1×' },
        ]}
        onChange={(value) => (picked = value)}
      />
    )
    fireEvent.click(screen.getByRole('radio', { name: '0.5×' }))
    expect(picked).toBe(0.5)
  })

  it('is named by the row it sits in when it has no label', () => {
    render(
      <div>
        <span id="row-label">Language</span>
        <FieldLabel.Provider value="row-label">
          <Segmented
            value="en"
            options={[
              { value: 'en', label: 'English', lang: 'en' },
              { value: 'ko', label: '한국어', lang: 'ko' },
            ]}
            onChange={() => {}}
          />
        </FieldLabel.Provider>
      </div>
    )
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '한국어' }).lang).toBe('ko')
  })
})
