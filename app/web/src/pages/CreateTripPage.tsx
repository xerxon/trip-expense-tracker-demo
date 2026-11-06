import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ApiError, SERVER_ERROR_MESSAGE } from "../auth/api";
import { createTrip } from "../trips/api";

// The text for a failed create. A 400 carries the server's name error (F2.AC2, F2.AC15).
// Any other failure shows the generic message (spec States & errors).
function errorTextFor(err: unknown): string {
  if (err instanceof ApiError && err.status === 400) {
    return err.message;
  }
  return SERVER_ERROR_MESSAGE;
}

/** Create trip (F2.R1, F2.R3). The API checks the name; this page only shows its answer. */
export function CreateTripPage() {
  const id = useId();
  const nameId = `${id}-name`;
  const errorId = `${id}-error`;
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const nameInput = useRef<HTMLInputElement>(null);

  // Move focus to the name field after a failed submit (spec Accessibility).
  useEffect(() => {
    if (error !== null) {
      nameInput.current?.focus();
    }
  }, [error]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);

    try {
      await createTrip(name);
    } catch (err) {
      setError(errorTextFor(err));
      return;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
    // F2.R3: back on Trips, where the new trip is listed first.
    navigate("/trips", { replace: true });
  }

  return (
    <main>
      <h1>Create trip</h1>
      <form noValidate onSubmit={handleSubmit}>
        <div>
          <label htmlFor={nameId}>Trip name</label>
          <input
            id={nameId}
            ref={nameInput}
            type="text"
            name="name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error !== null ? errorId : undefined}
          />
        </div>
        {error !== null && (
          <p id={errorId} role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          Create
        </button>
      </form>
    </main>
  );
}
