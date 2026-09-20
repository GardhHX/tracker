import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthShell from "@/components/AuthShell";
import { Field, PasswordField, GoogleButton, isValidEmail } from "@/components/form";
import { IconMail, IconLock } from "@/components/icons";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Email is required.";
    else if (!isValidEmail(email)) next.email = "That email looks invalid.";
    if (!password) next.password = "Password is required.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus("loading");
    // UI-only: submits to Auth.js Credentials once the backend is connected.
    window.setTimeout(() => setStatus("error"), 1100);
  };

  return (
    <AuthShell
      quote={
        <>
          Welcome <em>back.</em>
        </>
      }
      sub="Pick up where you left off with your activities, focus, and money. Your data stays yours."
    >
      <h1>Log in to Tracker</h1>
      <p className="sub">
        No account yet?{" "}
        <Link to="/register" className="textlink">
          Create one free
        </Link>
      </p>

      <form className="auth-form" onSubmit={submit} noValidate>
        <GoogleButton label="Continue with Google" />
        <div className="divider-or">or with email</div>

        {status === "error" && (
          <div className="form-alert error" role="alert">
            <span>
              Wrong email or password. Try again, your input is kept. (UI preview, not
              connected to a server yet.)
            </span>
          </div>
        )}

        <Field
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="name@email.com"
          lead={<IconMail width={18} height={18} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />

        <div>
          <PasswordField
            id="password"
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your password"
            lead={<IconLock width={18} height={18} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
          />
          <div className="form-row" style={{ marginTop: 12 }}>
            <label className="check">
              <input type="checkbox" defaultChecked /> Remember me
            </label>
            <Link to="/forgot-password" className="textlink">
              Forgot password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block btn-lg"
          disabled={status === "loading"}
        >
          {status === "loading" ? (
            <>
              <span className="spinner" /> Signing in…
            </>
          ) : (
            "Log in"
          )}
        </button>
      </form>

      <p className="auth-alt">
        By logging in you agree to the preview{" "}
        <Link to="/privacy" className="textlink">
          privacy notice
        </Link>
        .
      </p>
    </AuthShell>
  );
}
