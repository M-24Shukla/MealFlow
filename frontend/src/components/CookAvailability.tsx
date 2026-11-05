import { useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { dateValue, mealIndex, mealName, mealTypes } from "../lib/meal";
import type { Group } from "../lib/types";

export type Leave = {
  id: string;
  mealDate: string;
  mealType: string | null;
  reason: string | null;
};
type LeaveRange = {
  start: string;
  startMeal: string;
  end: string;
  endMeal: string;
  reason: string | null;
};
type CookAvailabilityProps = {
  busy: boolean;
  group: Group;
  leaves: Leave[];
  run: (work: () => Promise<void>, trackBusy?: boolean) => Promise<void>;
  onMessage: (message: string) => void;
  onLeavesChange: (leaves: Leave[]) => void;
};

export function CookAvailability({
  busy,
  group,
  leaves,
  run,
  onMessage,
  onLeavesChange,
}: CookAvailabilityProps) {
  const [leaveFilter, setLeaveFilter] = useState<
    "" | "UPCOMING" | "PRESENT" | "PAST"
  >("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const loadLeavePlans = async (filter: typeof leaveFilter) => {
    setLeaveFilter(filter);
    if (!filter) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ leaves: Leave[] }>(
        `/groups/${group.id}/my/leaves`,
      );
      if (requestId === requestRef.current) onLeavesChange(result.leaves);
    } catch (error) {
      if (requestId === requestRef.current)
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load leave plans.",
        );
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };
  const [editingLeave, setEditingLeave] = useState<LeaveRange | null>(null);

  const leaveRanges = useMemo(() => {
    const sortedLeaves = [...leaves].sort(
      (left, right) =>
        left.mealDate.localeCompare(right.mealDate) ||
        mealIndex(left.mealType ?? "BREAKFAST") -
          mealIndex(right.mealType ?? "BREAKFAST"),
    );
    const slot = (mealDate: string, mealType: string) =>
      Math.floor(Date.parse(`${mealDate}T12:00:00Z`) / 86_400_000) *
        mealTypes.length +
      mealIndex(mealType);

    return sortedLeaves.reduce<LeaveRange[]>((ranges, leave) => {
      const mealType = leave.mealType ?? "BREAKFAST";
      const previous = ranges.at(-1);
      if (
        previous &&
        previous.reason === leave.reason &&
        slot(leave.mealDate, mealType) ===
          slot(previous.end, previous.endMeal) + 1
      ) {
        previous.end = leave.mealDate;
        previous.endMeal = mealType;
      } else {
        ranges.push({
          start: leave.mealDate,
          startMeal: mealType,
          end: leave.mealDate,
          endMeal: mealType,
          reason: leave.reason,
        });
      }
      return ranges;
    }, []);
  }, [leaves]);
  const visibleLeaves = leaveRanges.filter((leave) => {
    const today = dateValue(new Date());
    return leaveFilter === "PRESENT"
      ? leave.start <= today && leave.end >= today
      : leaveFilter === "UPCOMING"
        ? leave.start > today
        : leave.end < today;
  });

  const recordLeave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const payload = {
        start: String(form.get("start")),
        startMeal: String(form.get("startMeal")),
        end: String(form.get("end")),
        endMeal: String(form.get("endMeal")),
        reason: String(form.get("reason") ?? "").trim() || null,
      };
      if (editingLeave)
        await api(`/groups/${group.id}/my/leaves`, {
          method: "DELETE",
          body: JSON.stringify(editingLeave),
        });
      await api(`/groups/${group.id}/my/leaves`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const result = await api<{ leaves: Leave[] }>(
        `/groups/${group.id}/my/leaves`,
      );
      onLeavesChange(result.leaves);
      requestRef.current += 1;
      setLoading(false);
      setError(null);
      setEditingLeave(null);
      onMessage(editingLeave ? "Leave updated." : "Leave recorded.");
    });
  };

  const deleteLeave = (leave: LeaveRange) => {
    if (!window.confirm("Delete this leave range?")) return;
    void run(async () => {
      await api(`/groups/${group.id}/my/leaves`, {
        method: "DELETE",
        body: JSON.stringify(leave),
      });
      const result = await api<{ leaves: Leave[] }>(
        `/groups/${group.id}/my/leaves`,
      );
      onLeavesChange(result.leaves);
      requestRef.current += 1;
      setLoading(false);
      setError(null);
      if (editingLeave === leave) setEditingLeave(null);
      onMessage("Leave deleted.");
    });
  };

  return (
    <>
      <div className="panel cook-availability">
        <h2>Leave</h2>
        <form
          key={
            editingLeave
              ? `${editingLeave.start}-${editingLeave.startMeal}`
              : "new"
          }
          onSubmit={recordLeave}
        >
          <label>
            Start date
            <input
              name="start"
              type="date"
              min={dateValue(new Date())}
              defaultValue={editingLeave?.start ?? dateValue(new Date())}
              required
            />
          </label>
          <label>
            First missed meal
            <select
              name="startMeal"
              defaultValue={editingLeave?.startMeal ?? "BREAKFAST"}
            >
              {mealTypes.map((mealType) => (
                <option key={mealType} value={mealType}>
                  {mealName(mealType)}
                </option>
              ))}
            </select>
          </label>
          <label>
            End date
            <input
              name="end"
              type="date"
              min={dateValue(new Date())}
              defaultValue={editingLeave?.end ?? dateValue(new Date())}
              required
            />
          </label>
          <label>
            Last missed meal
            <select
              name="endMeal"
              defaultValue={editingLeave?.endMeal ?? "DINNER"}
            >
              {mealTypes.map((mealType) => (
                <option key={mealType} value={mealType}>
                  {mealName(mealType)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <textarea name="reason" defaultValue={editingLeave?.reason ?? ""} />
          </label>
          <button className="primary" disabled={busy}>
            {editingLeave ? "Update leave" : "Record leave"}
          </button>
          {editingLeave && (
            <button
              className="text-button"
              type="button"
              onClick={() => setEditingLeave(null)}
            >
              Cancel
            </button>
          )}
        </form>
      </div>
      <div className="panel cook-leave-list">
        <h2>Leave plans</h2>
        <label>
          Show leaves
          <select
            value={leaveFilter}
            disabled={busy}
            onChange={(event) =>
              void loadLeavePlans(
                event.target.value as "UPCOMING" | "PRESENT" | "PAST",
              )
            }
          >
            <option value="" disabled>
              Select period
            </option>
            <option value="UPCOMING">Upcoming</option>
            <option value="PRESENT">Present</option>
            <option value="PAST">Past</option>
          </select>
        </label>
        {!leaveFilter && (
          <p className="empty">Select a period to load leave plans.</p>
        )}
        {loading && <p role="status">Loading…</p>}
        {!loading && error && <p role="alert">{error}</p>}
        {leaveFilter && !loading && !error && !visibleLeaves.length && (
          <p className="empty">No leave plans for this period.</p>
        )}
        {leaveFilter &&
          !loading &&
          !error &&
          visibleLeaves.map((leave) => (
            <div
              className="list-row"
              key={`${leave.start}-${leave.startMeal}-${leave.end}-${leave.endMeal}`}
            >
              <span>
                {leave.start} · {mealName(leave.startMeal)} – {leave.end} ·{" "}
                {mealName(leave.endMeal)}
                {leave.reason ? ` · ${leave.reason}` : ""}
              </span>
              <button
                type="button"
                aria-label="Edit leave"
                title="Edit leave"
                onClick={() => setEditingLeave(leave)}
              >
                ✎
              </button>
              <button
                type="button"
                aria-label="Delete leave"
                title="Delete leave"
                onClick={() => deleteLeave(leave)}
              >
                ×
              </button>
            </div>
          ))}
      </div>
    </>
  );
}
