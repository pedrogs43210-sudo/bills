export type ShareOutcome = "shared" | "copied" | "failed";

/** Native share sheet when available; clipboard fallback otherwise. Never throws. */
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared"; // user closed the sheet — done
      // other failures fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed"; // clipboard missing (insecure context) or permission denied
  }
}
