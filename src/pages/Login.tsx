import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "@/components/AuthShell";
import { Field, PasswordField, GoogleButton, isValidEmail } from "@/components/form";
import { IconMail, IconLock } from "@/components/icons";
import { loginWithPassword, TrackerApiError } from "@/lib/api";

function loginErrorMessage(error: unknown) {
  if (!(error instanceof TrackerApiError)) return "Tracker could not sign you in. Try again.";
  if (error.code === "UNAUTHENTICATED") return "Wrong email or password. Check both fields and try again.";
  if (error.code === "RATE_LIMITED") {
    return error.retryAfterSeconds
      ? `Too many login attempts. Wait ${error.retryAfterSeconds} seconds and try again.`
      : "Too many login attempts. Wait a few minutes and try again.";
  }
  if (error.code === "SERVICE_UNAVAILABLE") {
    return "Tracker could not reach the sign-in service. Check that the API is running and try again.";
  }
  return "Tracker could not sign you in. Try again.";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [serverError, setServerError] = useState<string | null>(() => {
    const oauthError = searchParams.get("error");
    if (oauthError === "link_required") return "This Google email already belongs to an account. Log in with your password, then link Google from settings.";
    if (oauthError) return "Google sign-in could not be completed. Try again.";
    return null;
  });
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (serverError) errorRef.current?.focus();
  }, [serverError]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Email is required.";
    else if (!isValidEmail(email)) next.email = "That email looks invalid.";
    if (!password) next.password = "Password is required.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus("loading");
    try {
      await loginWithPassword({ email: email.trim(), password });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setServerError(loginErrorMessage(error));
      setStatus("idle");
    }
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

        {serverError && (
          <div className="form-alert error" role="alert" tabIndex={-1} ref={errorRef}>
            <span>{serverError}</span>
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
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((current) => ({ ...current, email: undefined }));
            setServerError(null);
          }}
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
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((current) => ({ ...current, password: undefined }));
              setServerError(null);
            }}
            error={errors.password}
            required
          />
          <div className="form-row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
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
        By logging in you agree to the{" "}
        <Link to="/privacy" className="textlink">
          privacy notice
        </Link>
        .
      </p>
    </AuthShell>
  );
}
