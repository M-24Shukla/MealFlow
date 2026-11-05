import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { roleName } from "../lib/meal";
import type { Group, JoinRequest, Member } from "../lib/types";

type AdminWorkspaceProps = {
  busy: boolean;
  group: Group;
  run: (work: () => Promise<void>, trackBusy?: boolean) => Promise<void>;
};

export function AdminWorkspace({ busy, group, run }: AdminWorkspaceProps) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const loadMembers = async () => {
    const [requestData, memberData] = await Promise.all([
      api<{ data: JoinRequest[] }>(`/groups/${group.id}/join-requests`),
      api<{ data: Member[] }>(`/groups/${group.id}/members`),
    ]);
    setRequests(requestData.data);
    setMembers(memberData.data);
  };
  const refresh = () => void run(loadMembers);

  useEffect(() => {
    let current = true;
    void Promise.all([
      api<{ data: JoinRequest[] }>(`/groups/${group.id}/join-requests`),
      api<{ data: Member[] }>(`/groups/${group.id}/members`),
    ])
      .then(([requestData, memberData]) => {
        if (!current) return;
        setRequests(requestData.data);
        setMembers(memberData.data);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [group.id]);

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
    <section className="member-management">
      <h2>Members</h2>
      <div className="member-management-grid">
        <section className="panel">
          <h2>Invite management</h2>
          <button className="primary" onClick={refresh} disabled={busy}>
            Refresh requests & members
          </button>
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
                      {member.roles.includes("ADMIN") ? (
                        <button onClick={() => setAdmin(member, false)}>
                          Remove admin
                        </button>
                      ) : (
                        <button onClick={() => setAdmin(member, true)}>
                          Make admin
                        </button>
                      )}
                      <button onClick={() => removeMember(member)}>
                        Remove member
                      </button>
                    </div>
                  ))
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </section>
  );
}
