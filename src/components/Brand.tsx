import { IconCheck } from "./icons";

export default function Brand({ size = 32 }: { size?: number }) {
  return (
    <span className="brand">
      <span
        className="brand-mark"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <IconCheck width={size * 0.58} height={size * 0.58} strokeWidth={2.4} />
      </span>
      <span>Tracker</span>
    </span>
  );
}
