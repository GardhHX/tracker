import { useState, type FormEvent } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { PasswordField } from "@/components/form";
import { IconCheck, IconGlobe, IconGoogle, IconLock, IconLogOut, IconMail } from "@/components/icons";

const TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Jakarta", label: "Asia/Jakarta (WIB)" },
  { value: "Asia/Makassar", label: "Asia/Makassar (WITA)" },
  { value: "Asia/Jayapura", label: "Asia/Jayapura (WIT)" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "UTC", label: "UTC" },
];

const ACCOUNT_EMAIL = "budi@example.com"; // sample account, UI preview only

function PasswordModal({ mode, onClose, onSave }: { mode: "add" | "change"; onClose: () => void; onSave: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "change" && !current) {
      setError("Enter your current password.");
      return;
    }
    if (next.length < 12) {
      setError("Use at least 12 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    onSave();
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      {mode === "change" && (
        <div style={{ marginBottom: 14 }}>
          <PasswordField id="cur-pw" label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} lead={<IconLock width={18} height={18} />} />
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <PasswordField id="new-pw" label={mode === "add" ? "Password" : "New password"} autoComplete="new-password" placeholder="At least 12 characters" value={next} onChange={(e) => setNext(e.target.value)} lead={<IconLock width={18} height={18} />} hint="Use 12 to 128 characters." />
      </div>
      <PasswordField id="confirm-pw" label="Confirm password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} lead={<IconLock width={18} height={18} />} />
      <p className="field-hint" style={{ marginTop: 10 }}>
        UI preview: nothing is sent to a server yet.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {mode === "add" ? "Add password" : "Update password"}
        </button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const [name, setName] = useState("Budi S.");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [profileSaved, setProfileSaved] = useState(false);

  const [hasPassword, setHasPassword] = useState(true);
  const [googleLinked, setGoogleLinked] = useState(true);

  const [pwModal, setPwModal] = useState<null | "add" | "change">(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Name is required.");
      return;
    }
    setNameError(undefined);
    setProfileSaved(true);
  }

  function dirty() {
    setProfileSaved(false);
  }

  return (
    <AppShell title="Settings">
      <div className="settings-wrap">
        <div className="page-head">
          <h1>Settings</h1>
          <span className="sample-tag">UI preview</span>
        </div>
        <div className="info-note" style={{ marginBottom: 22 }}>
          This screen is a preview. Your name, timezone, login methods, and sign-out are not connected to a server yet, so changes here are not saved between visits.
        </div>

        {/* Profile */}
        <form className="settings-card" onSubmit={saveProfile} noValidate>
          <h2>Profile</h2>
          <p className="sc-sub">Your display name and the timezone used to group report dates.</p>
          <div className="settings-body">
            <div className="field">
              <label htmlFor="st-name">Name</label>
              <input id="st-name" className="input" value={name} maxLength={120} aria-invalid={!!nameError} onChange={(e) => { setName(e.target.value); dirty(); }} />
              {nameError && (
                <span className="field-error" role="alert">
                  {nameError}
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="st-tz">Timezone</label>
              <select id="st-tz" className="input" value={timezone} onChange={(e) => { setTimezone(e.target.value); dirty(); }}>
                {TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="info-note">
              Changing your timezone only changes how report dates are grouped from now on. Your transaction dates, habit check-ins, a habit&apos;s own calendar, project history, and recurring-rule times are all kept as they were.
            </div>
            <div className="save-row">
              <button type="submit" className="btn btn-primary">
                Save profile
              </button>
              {profileSaved && (
                <span className="saved-msg" role="status">
                  <IconCheck width={16} height={16} /> Saved
                </span>
              )}
            </div>
          </div>
        </form>

        {/* Regional defaults (fixed for MVP) */}
        <div className="settings-card">
          <h2>Regional defaults</h2>
          <p className="sc-sub">Fixed in this version of Tracker.</p>
          <div className="settings-body">
            <div className="info-list">
              <div className="info-row">
                <span className="ir-k">Currency</span>
                <span className="ir-v">Indonesian Rupiah (IDR)</span>
              </div>
              <div className="info-row">
                <span className="ir-k">Week starts on</span>
                <span className="ir-v">Monday</span>
              </div>
              <div className="info-row">
                <span className="ir-k">Interface language</span>
                <span className="ir-v">English</span>
              </div>
            </div>
          </div>
        </div>

        {/* Login methods */}
        <div className="settings-card">
          <h2>Login methods</h2>
          <p className="sc-sub">At least one method stays active at all times.</p>
          <div className="settings-body" style={{ gap: 0 }}>
            <div className="method-row">
              <span className="method-ic">
                <IconMail width={18} height={18} />
              </span>
              <div className="method-main">
                <div className="method-name">Email and password</div>
                <div className="method-sub">
                  {ACCOUNT_EMAIL} {hasPassword ? "· password set" : "· no password yet"}
                </div>
              </div>
              <div>
                {hasPassword ? (
                  <button type="button" className="btn btn-sm" onClick={() => setPwModal("change")}>
                    Change password
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setPwModal("add")}>
                    Add a password
                  </button>
                )}
              </div>
            </div>

            <div className="method-row">
              <span className="method-ic">
                <IconGoogle width={18} height={18} />
              </span>
              <div className="method-main">
                <div className="method-name">
                  Google {googleLinked && <span className="chip chip-ok">Connected</span>}
                </div>
                <div className="method-sub">
                  {googleLinked ? "Sign in with your Google account." : "Not connected."}
                </div>
              </div>
              <div>
                {googleLinked ? (
                  <button type="button" className="btn btn-sm" disabled={!hasPassword} title={!hasPassword ? "Add a password first" : undefined} onClick={() => setGoogleLinked(false)}>
                    Unlink
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => setGoogleLinked(true)}>
                    Connect Google
                  </button>
                )}
              </div>
            </div>
            {googleLinked && !hasPassword && (
              <p className="field-hint" style={{ marginTop: 4 }}>
                Add a password before unlinking Google, so you keep a way to sign in.
              </p>
            )}
          </div>
        </div>

        {/* Sessions */}
        <div className="settings-card">
          <h2>Sign out</h2>
          <p className="sc-sub">End your session on this device, or on every device at once.</p>
          <div className="settings-body">
            <div className="save-row">
              <button type="button" className="btn btn-danger" onClick={() => setLogoutOpen(true)}>
                <IconLogOut width={18} height={18} /> Log out of all devices
              </button>
            </div>
          </div>
        </div>
      </div>

      {pwModal && (
        <Modal title={pwModal === "add" ? "Add a password" : "Change password"} onClose={() => setPwModal(null)}>
          <PasswordModal
            mode={pwModal}
            onClose={() => setPwModal(null)}
            onSave={() => {
              setHasPassword(true);
              setPwModal(null);
            }}
          />
        </Modal>
      )}

      {logoutOpen && (
        <Modal title="Log out of all devices?" onClose={() => setLogoutOpen(false)}>
          <p className="detail-desc">You will also be logged out on this device. Log in again to continue.</p>
          <div className="modal-foot">
            <button type="button" className="btn btn-quiet" onClick={() => setLogoutOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                window.location.href = "/login";
              }}
            >
              Log out everywhere
            </button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
