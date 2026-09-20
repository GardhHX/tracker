import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { IconEye, IconEyeOff, IconGoogle } from "./icons";
import { googleStartUrl } from "@/lib/api";

export function GoogleButton({ label }: { label: string }) {
  // A full-page navigation (not fetch) is required: the API must set its OAuth cookies and redirect to Google.
  return (
    <a className="btn btn-quiet btn-block" href={googleStartUrl()}>
      <IconGoogle /> {label}
    </a>
  );
}

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  lead?: ReactNode;
  required?: boolean;
} & InputHTMLAttributes<HTMLInputElement>;

export function Field({
  id,
  label,
  error,
  hint,
  lead,
  required,
  ...rest
}: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {required && <span className="req" aria-hidden>*</span>}
      </label>
      <div className="input-wrap">
        {lead && <span className="lead">{lead}</span>}
        <input
          id={id}
          className="input"
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? `${id}-err` : null, hint ? `${id}-hint` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          required={required}
          {...rest}
        />
      </div>
      {hint && !error && (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

type PasswordProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  lead?: ReactNode;
  required?: boolean;
} & InputHTMLAttributes<HTMLInputElement>;

export function PasswordField({
  id,
  label,
  error,
  hint,
  lead,
  required,
  ...rest
}: PasswordProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {required && <span className="req" aria-hidden>*</span>}
      </label>
      <div className="input-wrap">
        {lead && <span className="lead">{lead}</span>}
        <input
          id={id}
          type={show ? "text" : "password"}
          className="input"
          style={{ paddingRight: 48 }}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? `${id}-err` : null, hint ? `${id}-hint` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          required={required}
          {...rest}
        />
        <button
          type="button"
          className="reveal-btn"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
        >
          {show ? <IconEyeOff width={18} height={18} /> : <IconEye width={18} height={18} />}
        </button>
      </div>
      {hint && !error && (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
