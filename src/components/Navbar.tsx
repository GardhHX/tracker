import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Brand from "./Brand";
import ThemeToggle from "./ThemeToggle";
import { IconMenu, IconClose } from "./icons";

const LINKS = [
  { href: "#modules", label: "Modules" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`nav${scrolled ? " scrolled" : ""}`}>
      <div className="container">
        <Link to="/" aria-label="Tracker home">
          <Brand />
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <ThemeToggle />
          <Link to="/login" className="btn btn-quiet">
            Log in
          </Link>
          <Link to="/register" className="btn btn-primary">
            Create account
          </Link>
          <button
            type="button"
            className="icon-btn nav-burger"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <IconMenu />
          </button>
        </div>
      </div>

      <div className="mobile-menu" data-open={open} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="scrim" onClick={() => setOpen(false)} />
        <div className="sheet">
          <div className="sheet-head">
            <Brand size={30} />
            <button
              type="button"
              className="icon-btn"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <IconClose />
            </button>
          </div>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <div className="m-actions">
            <Link to="/login" className="btn btn-quiet btn-block" onClick={() => setOpen(false)}>
              Log in
            </Link>
            <Link
              to="/register"
              className="btn btn-primary btn-block"
              onClick={() => setOpen(false)}
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
