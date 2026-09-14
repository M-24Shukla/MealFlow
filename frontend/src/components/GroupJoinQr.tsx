import { useEffect, useRef } from "react";
import type { Group } from "../lib/types";

type GroupJoinQrProps = {
  group: Group;
};

export function GroupJoinQr({ group }: GroupJoinQrProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const joinUrl = `${window.location.origin}/?join=${encodeURIComponent(group.slug)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`;

  useEffect(() => {
    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) {
        detailsRef.current?.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () =>
      document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, []);

  return (
    <details className="group-join-qr" ref={detailsRef}>
      <summary>Group join QR</summary>
      <div>
        <img alt={`QR code to join ${group.name}`} src={qrUrl} />
        <p>Scan to open this group’s join page and request access.</p>
      </div>
    </details>
  );
}
