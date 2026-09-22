import { useEffect, useState } from "react";

function onlineNow() {
  return typeof navigator === "undefined" || navigator.onLine;
}

export default function ConnectionNotice() {
  const [online, setOnline] = useState(onlineNow);

  useEffect(() => {
    const update = () => setOnline(onlineNow());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="connection-notice" role="status" aria-live="polite">
      <strong>Offline.</strong> The information on screen may be out of date. Saving is unavailable until you reconnect.
    </div>
  );
}
