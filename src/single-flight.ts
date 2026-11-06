/**
 * Work done one run at a time: asked again while a run is under way, it joins
 * that run instead of starting another (the work it was handed then goes
 * unused). Once the run settles, either way, the next ask starts afresh.
 */
export class SingleFlight<T> {
  private current?: Promise<T>

  /** The run under way, if one is */
  get running(): Promise<T> | undefined {
    return this.current
  }

  run(work: () => Promise<T>): Promise<T> {
    this.current ??= work().finally(() => {
      this.current = undefined
    })
    return this.current
  }
}
