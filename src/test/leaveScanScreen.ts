import { fireEvent, screen } from "@testing-library/react";

/**
 * Step off the camera.
 *
 * Billy opens on the Scan screen — it is a scan-first app, and the common reason to launch it is a
 * receipt in your hand. Every test that is about anything else therefore starts one screen further
 * back than it used to, so it says so in one line rather than each file inventing its own way past.
 *
 * `fireEvent` rather than userEvent deliberately: this is setup, not the behaviour under test, and a
 * second userEvent.setup() inside a test that already has one is a source of confusing pointer
 * errors. Silently does nothing when the app did not open on Scan — a test seeded with an invite
 * link lands somewhere else entirely and must not be dragged off it.
 */
export function leaveScanScreen(): void {
  const splits = screen.queryByRole("tab", { name: /splits/i });
  if (splits) fireEvent.click(splits);
}
