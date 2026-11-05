import { useEffect, useEffectEvent, useRef, useState } from "react";

type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};

type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorInstance;

type QrJoinScannerProps = {
  disabled: boolean;
  onScan: (code: string) => void;
};

const codeFromQrValue = (value: string) => {
  try {
    const url = new URL(value);
    return url.searchParams.get("join") ?? value;
  } catch {
    return value;
  }
};

export function QrJoinScanner({ disabled, onScan }: QrJoinScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("");
  const reportScan = useEffectEvent((code: string) => onScan(code));

  useEffect(() => {
    if (!isScanning) return;
    const BarcodeDetector = (
      globalThis as typeof globalThis & {
        BarcodeDetector?: BarcodeDetectorConstructor;
      }
    ).BarcodeDetector;
    if (!BarcodeDetector) return;

    let stream: MediaStream | undefined;
    let frameId = 0;
    let timeoutId = 0;
    let active = true;
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const scheduleScan = () => {
      timeoutId = window.setTimeout(() => {
        if (active) frameId = requestAnimationFrame(scan);
      }, 150);
    };
    const scan = async () => {
      if (!active) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        scheduleScan();
        return;
      }
      const codes = await detector.detect(video).catch(() => []);
      if (!active) return;
      if (codes[0]?.rawValue) {
        setStatus("Code scanned. Opening group…");
        setIsScanning(false);
        reportScan(codeFromQrValue(codes[0].rawValue));
        return;
      }
      scheduleScan();
    };

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((cameraStream) => {
        if (!active) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = cameraStream;
        if (videoRef.current) videoRef.current.srcObject = cameraStream;
        frameId = requestAnimationFrame(scan);
      })
      .catch(() => {
        setStatus(
          "Camera access was unavailable. Allow camera access or use the invitation code tab.",
        );
        setIsScanning(false);
      });

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isScanning]);

  return (
    <div className="qr-scanner" role="tabpanel">
      <p>Scan your group’s QR code to open its join page.</p>
      {isScanning && <video autoPlay muted playsInline ref={videoRef} />}
      {status && <p className="field-help">{status}</p>}
      <button
        className="primary"
        disabled={disabled || isScanning}
        onClick={() => {
          const BarcodeDetector = (
            globalThis as typeof globalThis & {
              BarcodeDetector?: BarcodeDetectorConstructor;
            }
          ).BarcodeDetector;
          if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
            setStatus(
              "QR scanning is not supported by this browser. Use the invitation code tab instead.",
            );
            return;
          }
          setStatus("");
          setIsScanning(true);
        }}
        type="button"
      >
        {isScanning ? "Scanning…" : "Scan QR code"}
      </button>
    </div>
  );
}
