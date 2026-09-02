import { useEffect, useRef, useState } from "react";

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
    let active = true;
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const scan = async () => {
      const video = videoRef.current;
      if (
        !active ||
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        frameId = requestAnimationFrame(scan);
        return;
      }
      const codes = await detector.detect(video).catch(() => []);
      if (codes[0]?.rawValue) {
        setStatus("Code scanned. Opening group…");
        setIsScanning(false);
        onScan(codeFromQrValue(codes[0].rawValue));
        return;
      }
      frameId = requestAnimationFrame(scan);
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
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isScanning, onScan]);

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
