import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthShell from "@/components/AuthShell";
import { Field, isValidEmail } from "@/components/form";
import { IconMail, IconArrowLeft } from "@/components/icons";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError("Email is required.");
    if (!isValidEmail(email)) return setError("That email looks invalid.");
    setError(undefined);
    setStatus("loading");
    // UI-only: the reset request returns the same message whether or not the account exists.
    window.setTimeout(() => setStatus("sent"), 1000);
  };

  if (status === "sent") {
    return (
      <AuthShell
        quote={
          <>
            We keep your account <em>safe.</em>
          </>
        }
      >
        <div className="info-card">
          <span className="info-ic">
            <IconMail width={26} height={26} />
          </span>
          <h1>Check your inbox</h1>
          <p className="sub" style={{ marginTop: 14 }}>
            If an account exists for <b>{email}</b>, we sent a link to reset your
            password. The link is valid for 30 minutes. (UI preview, no email is
            actually sent.)
          </p>
          <div style={{ marginTop: 26 }}>
            <Link to="/login" className="btn btn-primary">
              <IconArrowLeft width={18} height={18} /> Back to log in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      quote={
        <>
          Forgot your password? <em>No problem.</em>
        </>
      }
    >
      <Link to="/login" className="textlink" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <IconArrowLeft width={16} height={16} /> Back to log in
      </Link>
      <h1 style={{ marginTop: 18 }}>Reset your password</h1>
      <p className="sub">
        Enter your account email. We will send a link to set a new password.
      </p>

      <form className="auth-form" onSubmit={submit} noValidate>
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
          error={error}
          required
        />
        <button
          type="submit"
          className="btn btn-primary btn-block btn-lg"
          disabled={status === "loading"}
        >
          {status === "loading" ? (
            <>
              <span className="spinner" /> Sending link…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <p className="auth-alt">
        Remember your password?{" "}
        <Link to="/login" className="textlink">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
