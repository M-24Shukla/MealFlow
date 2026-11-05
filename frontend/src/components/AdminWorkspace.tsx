import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { roleName } from "../lib/meal";
import type { Group, JoinRequest, Member } from "../lib/types";

type AdminWorkspaceProps = {
  busy: boolean;
  group: Group;
  currentUserId: string;
  run: (work: () => Promise<void>, trackBusy?: boolean) => Promise<void>;
};

export function AdminWorkspace({
  busy,
  group,
  currentUserId,
  run,
}: AdminWorkspaceProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      for (const menu of sectionRef.current?.querySelectorAll<HTMLDetailsElement>(
        ".member-actions[open]",
      ) ?? []) {
        if (!menu.contains(event.target as Node)) menu.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  const loadMembers = async () => {
    const data = await api<{ requests: JoinRequest[]; members: Member[] }>(
      `/groups/${group.id}/workspace/admin`,
    );
    setRequests(data.requests);
    setMembers(data.members);
    setLoaded(true);
  };
  const refresh = () => void run(loadMembers);

  const review = (requestId: string, action: "approve" | "reject") =>
    void run(async () => {
      await api(`/groups/${group.id}/join-requests/${requestId}/${action}`, {
        method: "POST",
      });
      await loadMembers();
    });

  const setAdmin = (member: Member, isAdmin: boolean) =>
    void run(async () => {
      await api(`/groups/${group.id}/members/${member.membershipId}/admin`, {
        method: "PUT",
        body: JSON.stringify({ isAdmin }),
      });
      await loadMembers();
    });

  const removeMember = (member: Member) =>
    void run(async () => {
      await api(`/groups/${group.id}/members/${member.membershipId}`, {
        method: "DELETE",
      });
      await loadMembers();
    });

  return (
    <section className="member-management" ref={sectionRef}>
      <div className="member-section-heading">
        <h2>Members</h2>
        <button
          className="secondary"
          onClick={refresh}
          disabled={busy}
          aria-label={loaded ? "Refresh members" : "Load members"}
          title={loaded ? "Refresh members" : "Load members"}
        >
          {loaded ? "↻" : "Load members"}
        </button>
      </div>
      {loaded && (
        <div className="member-management-grid">
          <section className="panel">
            <h2>Invite management</h2>
            {requests.length === 0 ? (
              <p className="empty">No pending join requests.</p>
            ) : (
              requests.map((item) => (
                <div className="list-row" key={item.id}>
                  <span>
                    <strong>{item.applicantName}</strong>
                    <br />
                    {item.requestedRole} · {item.applicantEmail}
                  </span>
                  <button onClick={() => review(item.id, "approve")}>
                    Approve
                  </button>
                  <button onClick={() => review(item.id, "reject")}>
                    Reject
                  </button>
                </div>
              ))
            )}
          </section>
          <section className="panel">
            <h2>Members</h2>
            {members.length === 0 ? (
              <p className="empty">No active members.</p>
            ) : (
              [
                {
                  title: "Cooks",
                  members: members.filter((member) =>
                    member.roles.includes("PRODUCER"),
                  ),
                },
                {
                  title: "Diners",
                  members: members.filter((member) =>
                    member.roles.includes("CONSUMER"),
                  ),
                },
              ].map(({ title, members: roleMembers }) => (
                <div className="member-role-group" key={title}>
                  <h3>{title}</h3>
                  {roleMembers.length === 0 ? (
                    <p className="empty">No {title.toLowerCase()} yet.</p>
                  ) : (
                    roleMembers.map((member) => (
                      <div className="list-row" key={member.membershipId}>
                        <span>
                          <strong>{member.displayName}</strong>
                          <br />
                          {member.roles.map(roleName).join(", ")}
                        </span>
                        {member.userId !== currentUserId &&
                          !member.isCreator && (
                            <details className="member-actions">
                              <summary
                                aria-label={`Actions for ${member.displayName}`}
                                aria-disabled={busy}
                                onClick={(event) => {
                                  if (busy) event.preventDefault();
                                }}
                              >
                                ⋯
                              </summary>
                              <div
                                className="member-actions-menu"
                                onClick={(event) => {
                                  if (
                                    (event.target as HTMLElement).closest(
                                      "button",
                                    )
                                  )
                                    event.currentTarget.parentElement?.removeAttribute(
                                      "open",
                                    );
                                }}
                              >
                                <button
                                  disabled={busy}
                                  onClick={() => removeMember(member)}
                                >
                                  Remove
                                </button>
                                {!member.roles.includes("PRODUCER") &&
                                  member.roles.includes("CONSUMER") && (
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        setAdmin(
                                          member,
                                          !member.roles.includes("ADMIN"),
                                        )
                                      }
                                    >
                                      {member.roles.includes("ADMIN")
                                        ? "Remove admin"
                                        : "Make admin"}
                                    </button>
                                  )}
                              </div>
                            </details>
                          )}
                      </div>
                    ))
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </section>
  );
}
