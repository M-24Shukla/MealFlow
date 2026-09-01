import type { Group } from "../lib/types";

type GroupJoinQrProps = {
  group: Group;
};

export function GroupJoinQr({ group }: GroupJoinQrProps) {
  const joinUrl = `${window.location.origin}/?join=${encodeURIComponent(group.slug)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`;

  return (
    <details className="group-join-qr">
      <summary>Group join QR</summary>
      <div>
        <img alt={`QR code to join ${group.name}`} src={qrUrl} />
        <p>Scan to open this group’s join page and request access.</p>
      </div>
    </details>
  );
}
