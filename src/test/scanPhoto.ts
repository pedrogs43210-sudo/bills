import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Put a photo through the scan control, the way a person does.
 *
 * "Scan receipt" is a button now, not a file input: it opens a sheet asking whether the receipt is
 * in the camera or the gallery, so the input the test has to reach is one tap further in. Kept in
 * one place because six test files do this, and the alternative is six copies of a two-step dance
 * that will change again the next time the control does.
 *
 * `from` picks which of the two options the sheet offers. They are the same request to the same
 * server and cost the same scan — the difference is only where the photo came from — so tests that
 * do not care take the camera.
 */
export async function scanPhoto(
  user: UserEvent,
  file: File,
  from: "camera" | "gallery" = "camera"
) {
  await user.click(screen.getByRole("button", { name: /scan receipt/i }));
  const label = from === "camera" ? /take a photo of the receipt/i : /choose a photo of a receipt/i;
  await user.upload(screen.getByLabelText(label), file);
}
