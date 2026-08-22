/**
 * Make a file dropped anywhere on the window inert.
 *
 * Without this, Chromium navigates the top-level frame to the dropped file — which is the trigger
 * for the file:// navigation hole main now closes (see the will-navigate guard in main/index.ts).
 * Stopping it here as well is cheap, and it means the drop never becomes a navigation in the first
 * place rather than depending on a single guard to catch it afterwards.
 *
 * PCT has no drag-and-drop feature. If it ever grows one — dropping a project.json, say — this
 * becomes a real handler and stays the single place that decides what a drop means.
 */
export function preventFileDrop(target: Window = window): void {
  const swallow = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
  };
  target.addEventListener("dragover", swallow);
  target.addEventListener("drop", swallow);
}
