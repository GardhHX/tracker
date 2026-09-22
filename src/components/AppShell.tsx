import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { Link } from "react-router-dom";
import Brand from "./Brand";
import ThemeToggle from "./ThemeToggle";
import {
  IconHome,
  IconTasks,
  IconRepeat,
  IconClock,
  IconKanban,
  IconWallet,
  IconSettings,
  IconChevronDown,
  IconLogOut,
  IconMenu,
  IconClose,
  IconUser,
} from "./icons";

type NavKey = "dashboard" | "tasks" | "habits" | "pomodoro" | "projects" | "finance";

type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  built: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: IconHome, built: true },
  { key: "tasks", href: "/tasks", label: "Tasks", icon: IconTasks, built: true },
  { key: "habits", href: "/habits", label: "Habits", icon: IconRepeat, built: true },
  { key: "pomodoro", href: "/pomodoro", label: "Pomodoro", icon: IconClock, built: true },
  { key: "projects", href: "/projects", label: "Projects", icon: IconKanban, built: true },
  { key: "finance", href: "/finance/accounts", label: "Finance", icon: IconWallet, built: true },
];

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="app-sidebar-foot" ref={ref}>
      {open && (
        <div className="app-account-menu" role="menu">
          <Link to="/settings" role="menuitem" onClick={() => setOpen(false)}>
            <IconSettings width={17} height={17} /> Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.location.href = "/login";
            }}
          >
            <IconLogOut width={17} height={17} /> Log out
          </button>
        </div>
      )}
      <button
        type="button"
        className="app-account-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="app-avatar" aria-hidden>
          <IconUser width={16} height={16} />
        </span>
        <span>Account</span>
        <IconChevronDown width={16} height={16} className="care" />
      </button>
    </div>
  );
}

export default function AppShell({
  active,
  title,
  children,
}: {
  active?: NavKey;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const triggeredBy = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = menuSheetRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    queueMicrotask(() => menuSheetRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      (menuTriggerRef.current ?? triggeredBy)?.focus();
    };
  }, [open]);

  return (
    <div className="app-shell">
      <a href="#app-main" className="skip-link">
        Skip to content
      </a>

      <aside className="app-sidebar">
        <div className="app-brand-row">
          <Link to="/dashboard" className="app-brand" aria-label="Tracker home">
            <Brand size={26} />
          </Link>
          <ThemeToggle />
        </div>
        <nav className="app-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              to={item.href}
              className={`app-nav-item${active === item.key ? " is-active" : ""}`}
              aria-current={active === item.key ? "page" : undefined}
            >
              <item.icon width={18} height={18} />
              <span>{item.label}</span>
              {!item.built && <span className="app-nav-tag">Soon</span>}
            </Link>
          ))}
        </nav>
        <AccountMenu />
      </aside>

      <div className="app-main">
        <div className="app-topbar">
          <button
            type="button"
            className="icon-btn"
            ref={menuTriggerRef}
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <IconMenu />
          </button>
          <span className="app-topbar-title">{title}</span>
          <span style={{ flex: 1 }} />
          <ThemeToggle />
        </div>

        <main id="app-main" className="app-content">
          {children}
        </main>
      </div>

      <div className="mobile-menu" data-open={open} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="scrim" onClick={() => setOpen(false)} />
        <div className="sheet" ref={menuSheetRef}>
          <div className="sheet-head">
            <Brand size={28} />
            <button
              type="button"
              className="icon-btn"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <IconClose />
            </button>
          </div>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              to={item.href}
              className="app-link"
              aria-current={active === item.key ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <item.icon width={18} height={18} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {!item.built && <span className="app-nav-tag">Soon</span>}
            </Link>
          ))}
          <div className="m-actions">
            <Link to="/settings" className="btn btn-quiet btn-block" onClick={() => setOpen(false)}>
              <IconSettings width={18} height={18} /> Settings
            </Link>
            <Link to="/login" className="btn btn-quiet btn-block" onClick={() => setOpen(false)}>
              <IconLogOut width={18} height={18} /> Log out
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
