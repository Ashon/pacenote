import { House, RotateCw } from 'lucide-react'
import { localized } from '@src/i18n/locale'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { text } from './error-boundary.text'

interface State {
  error?: Error
}

/**
 * A screen that throws while rendering shows what happened and a way back,
 * instead of a blank window. Pace keeps running either way; the error goes to
 * the app's log (logs/desktop.log).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void window.pacenoteDesktop
      ?.reportError({
        message: error.message,
        stack: `${error.stack ?? ''}${info.componentStack ?? ''}`,
      })
      .catch(() => undefined)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const t = localized(text)
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar p-10">
        <div className="w-full max-w-md">
          <h1 className="text-title">{t.title}</h1>
          <p className="mt-1 text-copy text-muted-foreground">{t.body}</p>
          <ScrollArea
            className="mt-4 rounded-lg bg-well"
            viewportClassName="max-h-48"
          >
            <pre className="px-3 py-2 font-mono text-meta break-words whitespace-pre-wrap text-muted-foreground select-text">
              {error.message}
            </pre>
          </ScrollArea>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              <RotateCw />
              {t.reload}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.location.hash = ''
                window.location.reload()
              }}
            >
              <House />
              {t.back}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
