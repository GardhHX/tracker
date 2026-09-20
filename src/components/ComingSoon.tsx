import { Link } from "react-router-dom";
import type { ComponentType, SVGProps } from "react";
import { IconArrowLeft } from "./icons";

export default function ComingSoon({
  icon: Icon,
  moduleName,
  note,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  moduleName: string;
  note: string;
}) {
  return (
    <div className="coming-soon">
      <span className="cs-ic" aria-hidden>
        <Icon width={26} height={26} />
      </span>
      <h1>{moduleName} isn&apos;t built yet</h1>
      <p>{note}</p>
      <p className="sub" style={{ marginTop: 8 }}>
        The Dashboard is the only signed-in screen wired up in this preview.
      </p>
      <Link to="/dashboard" className="btn btn-primary">
        <IconArrowLeft width={18} height={18} /> Back to Dashboard
      </Link>
    </div>
  );
}
