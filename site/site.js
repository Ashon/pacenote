// Every page of pacenote.dev loads this: the copy buttons, and the track's
// line on the pages that have one.

// Copy the install command; the status line says so for screen readers too.
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent
    const status = button.parentElement.querySelector('.copied')
    try {
      await navigator.clipboard.writeText(text)
      button.textContent = 'Copied'
      status.textContent = 'Install command copied'
    } catch {
      status.textContent = 'Select the command to copy it'
    }
    setTimeout(() => {
      button.textContent = 'Copy'
      status.textContent = ''
    }, 2000)
  })
}

// The track's line draws once, the first time it is seen. The stages are
// there all along.
for (const track of document.querySelectorAll('.track')) {
  if (!('IntersectionObserver' in window)) {
    track.classList.add('drawn')
    continue
  }
  new IntersectionObserver(
    (entries, observer) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        track.classList.add('drawn')
        observer.disconnect()
      }
    },
    { threshold: 0.4 }
  ).observe(track)
}
