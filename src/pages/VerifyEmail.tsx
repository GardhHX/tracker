import { useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "@/components/AuthShell";
import { IconMail } from "@/components/icons";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");

  const resend = () => {
    setStatus("loading");
    window.setTimeout(() => setStatus("sent"), 900);
  };

  return (
    <AuthShell
      quote={
        <>
          Secure your account with <em>email verification.</em>
        </>
      }
    >
      <div className="info-card">
        <span className="info-ic">
          <IconMail width={26} height={26} />
        </span>
        <h1>Verify your email</h1>
        <p className="sub" style={{ marginTop: 14 }}>
          We sent a verification link to your email. Open it to unlock every Tracker
          module. The link is valid for 24 hours.
        </p>

        {status === "sent" && (
          <div className="form-alert success" role="status" style={{ marginTop: 20, textAlign: "left" }}>
            <span>
              If your email is registered and not yet verified, a new link is on its
              way. (UI preview.)
            </span>
          </div>
        )}

        <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={resend}
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <>
                <span className="spinner" /> Sending…
              </>
            ) : (
              "Resend link"
            )}
          </button>
          <Link to="/login" className="btn btn-quiet">
            Go to log in
          </Link>
        </div>

        <p className="auth-alt" style={{ marginTop: 22 }}>
          Wrong email address?{" "}
          <Link to="/register" className="textlink">
            Sign up again
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
