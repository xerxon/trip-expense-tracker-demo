import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { logout, me, messageFor, type AuthUser } from "./auth/api";
import { CreateTripPage } from "./pages/CreateTripPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TripsPage } from "./pages/TripsPage";
import { afterLogout, redirectFor, safeNextPath } from "./routes/rules";

// undefined: the session check has not finished. null: no session.
type SessionState = AuthUser | null | undefined;

/** The whole web app: a browser router around the shell. */
export function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

/** The shell and routes. Expects a router above it (BrowserRouter, or MemoryRouter in tests). */
export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<SessionState>(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // Ask the API who is logged in, once on load.
  useEffect(() => {
    let active = true;
    me().then(
      (user) => {
        if (active) setSession(user);
      },
      (err: unknown) => {
        if (active) setSessionError(messageFor(err));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const path = `${location.pathname}${location.search}${location.hash}`;

  // The route rules decide whether this path needs a redirect (F1.R8, F1.R12).
  // Routes are not rendered until the session is known and no redirect is needed.
  const redirectTarget =
    session === undefined
      ? undefined
      : redirectFor(session === null ? null : { userId: session.id }, path);

  useEffect(() => {
    if (redirectTarget !== undefined && redirectTarget !== null) {
      navigate(redirectTarget, { replace: true });
    }
  }, [redirectTarget, navigate]);

  function handleAuthSuccess(user: AuthUser) {
    setSession(user);
    navigate(safeNextPath(searchParams.get("next")), { replace: true });
  }

  async function handleLogout() {
    setLogoutError(null);
    try {
      await logout();
    } catch (err) {
      setLogoutError(messageFor(err));
      return;
    }
    setSession(null);
    navigate(afterLogout(), { replace: true });
  }

  const showRoutes = session !== undefined && redirectTarget === null;

  return (
    <>
      <h1>Trip Expense Tracker</h1>
      {session !== null && session !== undefined && (
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      )}
      {logoutError !== null && <p role="alert">{logoutError}</p>}
      {sessionError !== null && <p role="alert">{sessionError}</p>}
      {showRoutes && (
        <Routes>
          <Route path="/" element={<Navigate to="/trips" replace />} />
          <Route path="/login" element={<LoginPage onSuccess={handleAuthSuccess} />} />
          <Route path="/register" element={<RegisterPage onSuccess={handleAuthSuccess} />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/new" element={<CreateTripPage />} />
        </Routes>
      )}
    </>
  );
}
