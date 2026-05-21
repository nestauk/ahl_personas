"use client";

const EXAMPLE_POLICIES = [
  {
    title: "Healthy Start voucher expansion",
    summary: "Means-tested voucher for healthier foods",
    description:
      "Provide direct-to-consumer benefits via vouchers to purchase healthier foods, such as by expanding the Healthy Start scheme, or a means-tested voucher for qualifying populations (such as those on universal credit or lower incomes)",
  },
  {
    title: "Manufacturer/retailer tax relief",
    summary: "Tax relief for health metric improvements",
    description:
      "Give food manufacturers or retailers a percentage tax relief for improvement in health metrics (such as progress against a mandatory health target using the sales weighted average nutrient profiling model score, or a specific minimum share of sales from healthier foods)",
  },
  {
    title: "Price caps on essential goods",
    summary: "Price ceilings on a basket of essentials",
    description:
      "Introduce price caps (price ceilings) on a defined basket of essential goods (e.g. eggs, flour, butter) at any point of sale for foods",
  },
  {
    title: "GLP-1 co-pay",
    summary: "Co-pay for GLP-1 patients with assets above threshold",
    description:
      "Impact of co-pay with the NHS for GLP-1s on patients (those with assets above 23k)",
  },
  {
    title: "GLP-1 via private providers",
    summary: "NHS medicine access, private wraparound support",
    description:
      "Expanding access to GLP-1s via private providers that are commissioned by the NHS so that the NHS handles the medicine access and private providers handle the wraparound support",
  },
  {
    title: "NHS wraparound support optimisation",
    summary: "Tailored support by patient criteria",
    description:
      "Optimising NHS wraparound support so that the right amount of support is provided to patients based on certain criteria e.g. ethnicity, starting BMI, age, gender etc.",
  },
];

interface PolicyCardsProps {
  onSelectPolicy: (description: string) => void;
}

export function PolicyCards({ onSelectPolicy }: PolicyCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {EXAMPLE_POLICIES.map((policy) => (
        <button
          key={policy.title}
          onClick={() => onSelectPolicy(policy.description)}
          className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left transition-all hover:border-[var(--color-accent)] hover:shadow-sm"
        >
          <div className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-accent)]">
            {policy.title}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {policy.summary}
          </div>
        </button>
      ))}
    </div>
  );
}
