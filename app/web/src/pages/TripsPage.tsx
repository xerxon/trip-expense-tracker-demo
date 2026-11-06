import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { SERVER_ERROR_MESSAGE } from "../auth/api";
import { listTrips, type TripView } from "../trips/api";

// The page is always in exactly one of these states.
type ListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; trips: TripView[] };

/**
 * Trips (F2.R4, F2.R5, F2.R8, F2.R11). Shows the server's order and only each trip's name.
 * The Delete control is rendered here; the dialog that uses it comes with F2.T9.
 */
export function TripsPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<ListState>({ status: "loading" });

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
      <h1>Trips</h1>
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
                <button type="button" aria-label={`Delete ${trip.name} trip`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
