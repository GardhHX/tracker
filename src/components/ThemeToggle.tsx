import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as
        | "light"
        | "dark"
        | null) ?? "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("tracker-theme", next);
    } catch {
      /* storage may be unavailable */
    }
  };

  return { theme, toggle };
}

export default function ThemeToggle({
  className = "icon-btn",
}: {
  className?: string;
}) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}
