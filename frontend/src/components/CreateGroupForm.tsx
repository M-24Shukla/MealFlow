import { useState, type FormEvent } from "react";

type CreateGroupFormProps = {
  busy: boolean;
  timezone: string;
  onSubmit: (groupName: string) => void;
};

export function CreateGroupForm({
  busy,
  timezone,
  onSubmit,
}: CreateGroupFormProps) {
  const [groupName, setGroupName] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(groupName);
  };

  return (
    <div className="panel">
      <h2>Create your group</h2>
      <form onSubmit={submit} autoComplete="off">
        <label>
          Name
          <input
            name="groupName"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            required
          />
        </label>
        <p className="field-help">
          Your group invitation link is generated automatically and cannot be
          changed.
        </p>
        <label>
          Your timezone
          <input name="timezone" value={timezone} readOnly />
        </label>
        <button className="primary" disabled={busy}>
          Create group
        </button>
      </form>
    </div>
  );
}
