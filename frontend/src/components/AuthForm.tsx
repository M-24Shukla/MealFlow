import { useState, type FormEvent } from "react";

type AuthFormProps = {
  busy: boolean;
  invited: boolean;
  onSubmit: (
    mode: "login" | "register",
    email: string,
    password: string,
    displayName: string,
  ) => void;
};

export function AuthForm({ busy, invited, onSubmit }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(mode, email, password, displayName);
  };

  return (
    <div className="panel auth-card">
      <div className="tab-list" role="tablist" aria-label="Account access">
        <span
          aria-controls="auth-form"
          aria-selected={mode === "login"}
          className={mode === "login" ? "tab is-active" : "tab"}
          onClick={() => setMode("login")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setMode("login");
          }}
          role="tab"
          tabIndex={0}
        >
          Sign in
        </span>
        <span
          aria-controls="auth-form"
          aria-selected={mode === "register"}
          className={mode === "register" ? "tab is-active" : "tab"}
          onClick={() => setMode("register")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setMode("register");
          }}
          role="tab"
          tabIndex={0}
        >
          Register
        </span>
      </div>
      <h2>
        {invited
          ? mode === "login"
            ? "Sign in to join this group"
            : "Create an account to join this group"
          : mode === "login"
            ? "Sign in"
            : "Create an account"}
      </h2>
      {invited && (
        <p className="field-help">
          To join a group, sign in or create an account first. You can request
          your role after authentication.
        </p>
      )}
      <form id="auth-form" onSubmit={submit} autoComplete="off" role="tabpanel">
        {mode === "register" && (
          <label>
            Name
            <input
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
        )}
        <label>
          Email
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={8}
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
    </div>
  );
}
