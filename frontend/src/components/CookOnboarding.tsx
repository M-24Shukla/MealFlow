import { useState } from "react";

const cookTourSteps = [
  {
    title: "Today’s preparation",
    body: "Choose a meal, review its expected diner count, and mark each dish prepared as work is completed.",
  },
  {
    title: "Menu and diner counts",
    body: "Browse upcoming menus by day. Each meal shows its expected attendance as 🙋🏻 × N, while every dish shows its own diner count.",
  },
  {
    title: "Action items",
    body: "Add shared action items with due dates, work from the latest deadline downward, and mark items complete for the whole group.",
  },
  {
    title: "Leaves and availability",
    body: "Mark one meal unavailable directly from the menu, or record and manage a longer leave range from the Leaves section.",
  },
  {
    title: "Group access",
    body: "Use the group QR to invite someone to request access. You can also leave the group at any time from the header.",
  },
];

type CookOnboardingProps = {
  busy: boolean;
  required: boolean;
  onClose: () => void;
  onFinish: () => Promise<boolean>;
};

export function CookOnboarding({
  busy,
  required,
  onClose,
  onFinish,
}: CookOnboardingProps) {
  const [step, setStep] = useState(0);
  const current = cookTourSteps[step]!;

  const finish = async () => {
    if (await onFinish()) onClose();
  };

  return (
    <div className="dialog-backdrop diner-tour-backdrop" role="presentation">
      <section
        className="panel diner-tour cook-tour"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cook-tour-title"
      >
        {!required && (
          <button
            className="dialog-close diner-tour-close"
            aria-label="Close cook tour"
            onClick={onClose}
          >
            ×
          </button>
        )}
        <p className="eyebrow">
          Cook tour · {step + 1} of {cookTourSteps.length}
        </p>
        <h2 id="cook-tour-title">{current.title}</h2>
        <p className="tour-copy">{current.body}</p>
        <div className="tour-progress" aria-hidden="true">
          {cookTourSteps.map((tourStep, index) => (
            <span
              className={index <= step ? "is-active" : ""}
              key={tourStep.title}
            />
          ))}
        </div>
        <div className="dialog-actions tour-actions">
          <button
            className="secondary"
            disabled={step === 0}
            onClick={() => setStep((currentStep) => currentStep - 1)}
          >
            Previous
          </button>
          {step < cookTourSteps.length - 1 ? (
            <button
              className="primary"
              onClick={() => setStep((currentStep) => currentStep + 1)}
            >
              Next
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={finish}>
              Finish
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
