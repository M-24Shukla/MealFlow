type LeaveGroupButtonProps = {
  busy: boolean;
  onLeave: () => void;
};

export function LeaveGroupButton({ busy, onLeave }: LeaveGroupButtonProps) {
  return (
    <button
      className="secondary leave-group-button"
      onClick={onLeave}
      disabled={busy}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 4H5v16h5" />
        <path d="M14 8l4 4-4 4" />
        <path d="M18 12H9" />
      </svg>
      Leave group
    </button>
  );
}
