import { Link } from "react-router-dom";
import Brand from "./Brand";

const PRODUCT = [
  { label: "Modules", href: "/#modules" },
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "FAQ", href: "/#faq" },
];

const ACCOUNT = [
  { label: "Log in", href: "/login" },
  { label: "Create account", href: "/register" },
  { label: "Forgot password", href: "/forgot-password" },
  { label: "Privacy notice", href: "/privacy" },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Brand />
            <p className="about">
              One ledger for personal activities, money, and projects. Stored on the
              server, your data stays yours.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              {PRODUCT.map((l) => (
                <li key={l.label}>
                  <Link to={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Account</h4>
            <ul>
              {ACCOUNT.map((l) => (
                <li key={l.label}>
                  <Link to={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Tracker. Draft spec 0.3.</span>
          <span>English UI · IDR · Asia/Jakarta</span>
        </div>
      </div>
    </footer>
  );
}
