import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { SERVER_ERROR_MESSAGE } from "../auth/api";
import { deleteTrip, type TripView } from "./api";

interface DeleteTripDialogProps {
  trip: TripView;
  // Cancel, or Escape. Calls nothing on the API (F2.AC8).
  onCancel: () => void;
  // Runs once the API has confirmed the delete (F2.AC9). The parent removes the row.
  onDeleted: (id: string) => void;
}

/**
 * Delete trip confirmation (F2.R6, F2.R7). Focus starts on Cancel and stays inside the dialog.
 * Escape closes it. Only Delete calls the API. No animation is added, so reduced motion needs no rule.
 */
export function DeleteTripDialog({ trip, onCancel, onDeleted }: DeleteTripDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  const errorId = `${id}-error`;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);

  // Focus starts on Cancel (spec Accessibility).
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  // Keeps focus inside the dialog while it is open. A focus move outside sends it back to Cancel.
  useEffect(() => {
    function keepFocusInside(event: FocusEvent) {
      const dialog = dialogRef.current;
      if (dialog !== null && event.target instanceof Node && !dialog.contains(event.target)) {
        cancelButton.current?.focus();
      }
    }
    document.addEventListener("focusin", keepFocusInside);
    return () => {
      document.removeEventListener("focusin", keepFocusInside);
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // While the delete runs, closing would hide a delete that is still going, so Escape waits.
      if (!inFlight.current) onCancel();
      return;
    }
    if (event.key === "Tab") {
      // Two buttons: Tab and Shift+Tab move between them and wrap around.
      event.preventDefault();
      const target =
        document.activeElement === cancelButton.current ? deleteButton.current : cancelButton.current;
      if (target !== null && !target.disabled) target.focus();
    }
  }

  async function handleDelete() {
    // A second click while the request runs does nothing (spec Edge cases).
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);

    try {
      await deleteTrip(trip.id);
    } catch {
      // The trip stays in the list. The generic message is shown (spec States & errors).
      inFlight.current = false;
      setPending(false);
      setError(SERVER_ERROR_MESSAGE);
      return;
    }
    onDeleted(trip.id);
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={handleKeyDown}
    >
      <h2 id={titleId}>Delete this trip?</h2>
      <p id={bodyId}>This removes the trip and everything in it. This can&apos;t be undone.</p>
      {error !== null && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
      <button ref={cancelButton} type="button" onClick={onCancel} disabled={pending}>
        Cancel
      </button>
      <button ref={deleteButton} type="button" onClick={handleDelete} disabled={pending}>
        Delete
      </button>
    </div>
  );
}
