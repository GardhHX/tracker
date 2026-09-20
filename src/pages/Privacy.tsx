import { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy notice (preview) · Tracker";
  }, []);

  return (
    <>
      <Navbar />
      <main id="main" className="section">
        <div className="container" style={{ maxWidth: 760 }}>
          <span className="label">Preview</span>
          <h1 style={{ fontSize: "clamp(2rem,5vw,2.8rem)", marginTop: 12 }}>
            Privacy notice (preview)
          </h1>
          <p style={{ color: "var(--muted)", marginTop: 14 }}>
            This page is a data notice for the landing-page preview, not a production
            privacy policy. The account backend is not implemented yet.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 32 }}>
            <section>
              <h2 style={{ fontSize: "1.3rem" }}>What is shown</h2>
              <p style={{ color: "var(--muted)", marginTop: 10 }}>
                Every figure on the landing page (focus time, tasks, and progress) is
                synthetic and labeled Sample data. No real user data is processed on
                this page.
              </p>
            </section>
            <section>
              <h2 style={{ fontSize: "1.3rem" }}>Data isolation (planned)</h2>
              <p style={{ color: "var(--muted)", marginTop: 10 }}>
                In the implementation, every read, write, relation, report, and export
                is designed to use only the active user's data. IDs that belong to
                other people are treated as not found.
              </p>
            </section>
            <section>
              <h2 style={{ fontSize: "1.3rem" }}>Account forms</h2>
              <p style={{ color: "var(--muted)", marginTop: 10 }}>
                The log in, sign up, and reset forms on this site are UI ready to be
                connected. What you type is not sent to any server while it stays in
                preview mode.
              </p>
            </section>
          </div>

          <div style={{ marginTop: 36 }}>
            <Link to="/" className="btn btn-quiet">
              Back to home
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
