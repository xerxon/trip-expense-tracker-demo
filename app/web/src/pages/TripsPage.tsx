import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { SERVER_ERROR_MESSAGE } from "../auth/api";
import { DeleteTripDialog } from "../trips/DeleteTripDialog";
import { listTrips, type TripView } from "../trips/api";

// The page is always in exactly one of these states.
type ListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; trips: TripView[] };

/**
 * Trips (F2.R4, F2.R5, F2.R6, F2.R7, F2.R8, F2.R11). Shows the server's order and only each trip's name.
 * Delete opens the confirmation dialog. A confirmed delete removes that row from the list.
 */
export function TripsPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<ListState>({ status: "loading" });
  // The trip whose delete dialog is open, if any.
  const [deleting, setDeleting] = useState<TripView | null>(null);
  // The Delete button that opened the dialog, so focus can return to it on Cancel.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Where focus goes once the dialog has closed. Set just before the dialog closes.
  const focusAfterClose = useRef<HTMLElement | null>(null);

  // Focus moves after the dialog has unmounted, so its focus trap does not pull it back.
  useEffect(() => {
    if (deleting === null) {
      focusAfterClose.current?.focus();
      focusAfterClose.current = null;
    }
  }, [deleting]);

  function handleDeleteCancel() {
    focusAfterClose.current = openerRef.current;
    setDeleting(null);
  }

  function handleDeleted(id: string) {
    setList((current) =>
      current.status === "ready"
        ? { status: "ready", trips: current.trips.filter((trip) => trip.id !== id) }
        : current,
    );
    // The row is gone, so focus moves to the Trips heading (spec Decisions log, 2026-11-04).
    focusAfterClose.current = headingRef.current;
    setDeleting(null);
  }

  useEffect(() => {
    let active = true;
    listTrips().then(
      (trips) => {
        if (active) setList({ status: "ready", trips });
      },
      () => {
        // The failure is shown as the generic message (spec States & errors), never the raw error.
        if (active) setList({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <h1 ref={headingRef} tabIndex={-1}>
        Trips
      </h1>
      {list.status === "loading" && <p role="status">Loading trips…</p>}
      {list.status === "error" && <p role="alert">{SERVER_ERROR_MESSAGE}</p>}
      {list.status === "ready" && list.trips.length === 0 && (
        <div>
          <p>{"You don't have any trips yet."}</p>
          <button type="button" onClick={() => navigate("/trips/new")}>
            Create trip
          </button>
        </div>
      )}
      {list.status === "ready" && list.trips.length > 0 && (
        <>
          <button type="button" onClick={() => navigate("/trips/new")}>
            Create trip
          </button>
          <ul>
            {list.trips.map((trip) => (
              <li key={trip.id}>
                <Link to={`/trips/${encodeURIComponent(trip.id)}`}>{trip.name}</Link>{" "}
                <button
                  type="button"
                  aria-label={`Delete ${trip.name} trip`}
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    setDeleting(trip);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {deleting !== null && (
        <DeleteTripDialog
          key={deleting.id}
          trip={deleting}
          onCancel={handleDeleteCancel}
          onDeleted={handleDeleted}
        />
      )}
    </main>
  );
}
