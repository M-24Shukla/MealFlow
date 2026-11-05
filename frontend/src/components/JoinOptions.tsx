import { useState, type FormEvent } from "react";
import { toGroupSlug } from "../lib/meal";
import { QrJoinScanner } from "./QrJoinScanner";

type JoinOptionsProps = {
  busy: boolean;
  onJoin: (code: string) => void;
};

export function JoinOptions({ busy, onJoin }: JoinOptionsProps) {
  const [mode, setMode] = useState<"qr" | "invitation">("qr");
  const [code, setCode] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onJoin(code);
  };

  return (
    <>
      <div className="tab-list" role="tablist" aria-label="Join a group">
        <span
          aria-selected={mode === "qr"}
          className={mode === "qr" ? "tab is-active" : "tab"}
          onClick={() => setMode("qr")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setMode("qr");
          }}
          role="tab"
          tabIndex={0}
        >
          Join via QR code
        </span>
        <span
          aria-selected={mode === "invitation"}
          className={mode === "invitation" ? "tab is-active" : "tab"}
          onClick={() => setMode("invitation")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              setMode("invitation");
          }}
          role="tab"
          tabIndex={0}
        >
          Invitation code
        </span>
      </div>
      {mode === "qr" ? (
        <QrJoinScanner
          disabled={busy}
          onScan={(scannedCode) => {
            setCode(scannedCode.trim().toLowerCase());
            onJoin(scannedCode);
          }}
        />
      ) : (
        <form onSubmit={submit} autoComplete="off" role="tabpanel">
          <label>
            Invitation code
            <input
              name="joinGroupSlug"
              value={code}
              onChange={(event) => setCode(toGroupSlug(event.target.value))}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Open group
          </button>
        </form>
      )}
    </>
  );
}
