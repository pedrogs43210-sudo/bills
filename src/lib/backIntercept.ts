/**
 * Letting a screen answer the back button before the app navigates.
 *
 * Android's back button is wired once, in App, because that is where the history lives. But a
 * screen can be in a state that back should leave *first* — a selection of items, most obviously:
 * holding an item by mistake has to be undoable with the gesture everyone already uses, and
 * leaving the receipt entirely would be a worse answer than clearing the selection.
 *
 * A stack rather than a single slot, so the innermost state gets asked first, and so two screens
 * mounting and unmounting in an unexpected order cannot leave a stale handler behind.
 */
const stack: Array<() => boolean> = [];

/**
 * Registers a handler that gets the back button before the app navigates. Return `true` to say
 * "handled, stop here"; return `false` to let back mean what it normally means. Returns a cleanup
 * function, so it drops straight into a `useEffect`.
 */
export function onBackIntercept(handler: () => boolean): () => void {
  stack.push(handler);
  return () => {
    const at = stack.lastIndexOf(handler);
    if (at !== -1) stack.splice(at, 1);
  };
}

/** Offers the back button to the handlers, innermost first. True when one of them took it. */
export function runBackIntercept(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]()) return true;
  }
  return false;
}
