import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { login, messageFor, type AuthUser } from "../auth/api";

export interface LoginPageProps {
  onSuccess: (user: AuthUser) => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const id = useId();
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const errorId = `${id}-error`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const errorRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the error after a failed submit (spec Accessibility).
  useEffect(() => {
    if (error !== null) {
      errorRef.current?.focus();
    }
  }, [error]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);

    let user: AuthUser;
    try {
      user = await login({ email, password });
    } catch (err) {
      // Wrong password and unknown email get the same server message (F1.R5).
      setError(messageFor(err));
      return;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
    onSuccess(user);
  }

  return (
    <main>
      <h1>Log in</h1>
      <form noValidate onSubmit={handleSubmit}>
        <div>
          <label htmlFor={emailId}>Email</label>
          <input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error !== null ? errorId : undefined}
          />
        </div>
        <div>
          <label htmlFor={passwordId}>Password</label>
          <input
            id={passwordId}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error !== null ? errorId : undefined}
          />
        </div>
        {error !== null && (
          <p id={errorId} role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          Log in
        </button>
      </form>
    </main>
  );
}
