import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { ApiError, SERVER_ERROR_MESSAGE } from "../auth/api";
import { getTrip, TRIP_NOT_FOUND_MESSAGE, type TripView } from "../trips/api";

// The page is always in exactly one of these states.
type TripState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ready"; trip: TripView };

// A 404 means the trip is missing or not owned (F2.R12, F2.AC17). Any other failure is generic.
function stateFor(err: unknown): TripState {
  if (err instanceof ApiError && err.status === 404) {
    return { status: "not-found" };
  }
  return { status: "error" };
}

/**
 * Trip page (F2.R12). In F2 it shows the trip name as its only heading and no other trip content.
 * A missing or not-owned trip shows "Trip not found." and no trip data (F2.AC17).
 */
export function TripPage() {
  const { id } = useParams();
  const [state, setState] = useState<TripState>({ status: "loading" });

  useEffect(() => {
    if (id === undefined) {
      // The route always has an id. Without one there is no trip to show.
      setState({ status: "not-found" });
      return;
    }
    let active = true;
    setState({ status: "loading" });
    getTrip(id).then(
      (trip) => {
        if (active) setState({ status: "ready", trip });
      },
      (err: unknown) => {
        // The failure is shown as copy from the spec, never the raw error text.
        if (active) setState(stateFor(err));
      },
    );
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <main>
      {state.status === "loading" && <p role="status">Loading trip…</p>}
      {state.status === "error" && <p role="alert">{SERVER_ERROR_MESSAGE}</p>}
      {state.status === "not-found" && <p role="alert">{TRIP_NOT_FOUND_MESSAGE}</p>}
      {state.status === "ready" && <h1>{state.trip.name}</h1>}
    </main>
  );
}
