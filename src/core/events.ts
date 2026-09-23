/**
 * A minimal typed publish/subscribe channel. (spec 5.6)
 *
 * Lets a new feature react to "he banked" or "he died" without the code that
 * makes those things happen knowing the feature exists. The shop doesn't know
 * there's a save file; it just announces what it did.
 *
 * Deliberately tiny: synchronous, no priorities, no wildcards. Listeners run
 * in the order they subscribed, inside the emit call.
 */
export class EventBus<Events extends Record<string, unknown>> {
  private readonly listeners: { [K in keyof Events]?: ((payload: Events[K]) => void)[] } = {}

  /** Subscribe. Returns a function that unsubscribes again. */
  on<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): () => void {
    const list = (this.listeners[name] ??= [])
    list.push(listener)
    return () => {
      const index = list.indexOf(listener)
      if (index >= 0) list.splice(index, 1)
    }
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const list = this.listeners[name]
    if (!list) return
    // A copy, so a listener that unsubscribes itself doesn't skip the next one.
    for (const listener of [...list]) listener(payload)
  }
}
