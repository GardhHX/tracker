import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthShell from "@/components/AuthShell";
import { Field, PasswordField, GoogleButton, isValidEmail } from "@/components/form";
import { IconMail, IconLock, IconUser } from "@/components/icons";

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}
const LABELS = ["Too weak", "Weak", "Fair", "Strong", "Very strong"];
const COLORS = ["#b42318", "#b06a00", "#b06a00", "#17724c", "#17724c"];

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    agree?: string;
  }>({});
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");

  const score = useMemo(() => strength(password), [password]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!isValidEmail(email)) next.email = "That email looks invalid.";
    if (!password) next.password = "Password is required.";
    else if (password.length < 12) next.password = "Use at least 12 characters.";
    if (!agree) next.agree = "Please accept the privacy notice.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus("loading");
    // UI-only: registration and the verification email are wired up on the backend.
    window.setTimeout(() => setStatus("sent"), 1100);
  };

  if (status === "sent") {
    return (
      <AuthShell
        quote={
          <>
            One more <em>step.</em>
          </>
        }
      >
        <div className="info-card">
          <span className="info-ic">
            <IconMail width={26} height={26} />
          </span>
          <h1>Check your email</h1>
          <p className="sub" style={{ marginTop: 14 }}>
            If <b>{email}</b> is valid, we sent a verification link. Open it to activate
            every module. (UI preview, no email is actually sent.)
          </p>
          <div style={{ marginTop: 26, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/verify-email" className="btn btn-primary">
              Continue to verification
            </Link>
            <Link to="/login" className="btn btn-quiet">
              Go to log in
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
          Start tracking <em>everything</em>, today.
        </>
      }
      sub="Create a personal account for tasks, habits, Pomodoro, projects, and money in one place."
    >
      <h1>Create your Tracker account</h1>
      <p className="sub">
        Already have an account?{" "}
        <Link to="/login" className="textlink">
          Log in here
        </Link>
      </p>

      <form className="auth-form" onSubmit={submit} noValidate>
        <GoogleButton label="Sign up with Google" />
        <div className="divider-or">or with email</div>

        <Field
          id="name"
          label="Name"
          autoComplete="name"
          placeholder="Your name"
          lead={<IconUser width={18} height={18} />}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          required
        />
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
            autoComplete="new-password"
            placeholder="At least 12 characters"
            lead={<IconLock width={18} height={18} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint="Use 12 to 128 characters. Mix upper and lower case, numbers, and symbols."
            required
          />
          {password && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 6 }} aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    style={{
                      height: 6,
                      flex: 1,
                      borderRadius: 999,
                      background: i < score ? COLORS[score] : "var(--line-strong)",
                      transition: "background .3s ease",
                    }}
                  />
                ))}
              </div>
              <span className="field-hint" style={{ marginTop: 6, display: "block" }}>
                Strength: {LABELS[score]}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="check">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>
              I accept the preview{" "}
              <Link to="/privacy" className="textlink">
                privacy notice
              </Link>
              .
            </span>
          </label>
          {errors.agree && (
            <span className="field-error" role="alert" style={{ marginTop: 8, display: "flex" }}>
              {errors.agree}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block btn-lg"
          disabled={status === "loading"}
        >
          {status === "loading" ? (
            <>
              <span className="spinner" /> Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
