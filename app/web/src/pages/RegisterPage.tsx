import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { messageFor, register, type AuthUser } from "../auth/api";

export interface RegisterPageProps {
  onSuccess: (user: AuthUser) => void;
}

type Field = "email" | "password";

interface FormError {
  // The field the message concerns, or null for the whole form.
  field: Field | null;
  message: string;
}

// Picks the field a server message is about, so it sits next to that field.
// The server owns the rules and the copy; this only chooses where the copy is shown.
function fieldFor(message: string): Field | null {
  if (/password/i.test(message)) return "password";
  if (/email/i.test(message)) return "email";
  return null;
}

export function RegisterPage({ onSuccess }: RegisterPageProps) {
  const id = useId();
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const errorId = `${id}-error`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the first error after a failed submit (spec Accessibility).
  useEffect(() => {
    if (error === null) return;
    if (error.field === "email") {
      emailInput.current?.focus();
    } else if (error.field === "password") {
      passwordInput.current?.focus();
    } else {
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
      user = await register({ email, password });
    } catch (err) {
      const message = messageFor(err);
      setError({ field: fieldFor(message), message });
      return;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
    onSuccess(user);
  }

  function errorNodeFor(field: Field | null) {
    if (error === null || error.field !== field) return null;
    return (
      <p id={errorId} role="alert" tabIndex={-1} ref={errorRef}>
        {error.message}
      </p>
    );
  }

  return (
    <main>
      <h1>Register</h1>
      <form noValidate onSubmit={handleSubmit}>
        <div>
          <label htmlFor={emailId}>Email</label>
          <input
            id={emailId}
            ref={emailInput}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error?.field === "email"}
            aria-describedby={error?.field === "email" ? errorId : undefined}
          />
          {errorNodeFor("email")}
        </div>
        <div>
          <label htmlFor={passwordId}>Password</label>
          <input
            id={passwordId}
            ref={passwordInput}
            type="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error?.field === "password"}
            aria-describedby={error?.field === "password" ? errorId : undefined}
          />
          {errorNodeFor("password")}
        </div>
        {errorNodeFor(null)}
        <button type="submit" disabled={pending}>
          Register
        </button>
      </form>
    </main>
  );
}
