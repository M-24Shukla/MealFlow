type AttendanceIconProps = { present: boolean };

export function AttendanceIcon({ present }: AttendanceIconProps) {
  return (
    <svg
      aria-hidden="true"
      className="attendance-hand"
      viewBox="0 0 24 24"
      fill={present ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 11V5.5a1.5 1.5 0 0 1 3 0V10" />
      <path d="M10.5 10V3.8a1.5 1.5 0 0 1 3 0V10" />
      <path d="M13.5 10V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M16.5 11V7.5a1.5 1.5 0 0 1 3 0v6.2c0 4.6-2.8 7.3-7.1 7.3-3 0-4.7-1.6-6.1-3.8L4.1 14a1.7 1.7 0 0 1 2.7-2l1.7 1.8" />
    </svg>
  );
}
