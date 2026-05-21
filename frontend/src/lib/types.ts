export type SpecSource = "analyst" | "assumed" | "unspecified" | "empty";

export interface SpecValue {
  values: string[];
  source: SpecSource;
  rationale?: string | null;
}

export interface PolicySpecification {
  policy_lever: SpecValue;
  in_scope_businesses: SpecValue;
  business_size: SpecValue;
  delivery_channel: SpecValue;
  population: SpecValue;
  geography: SpecValue;
}

export interface SpecMetadata {
  spec: PolicySpecification;
  active_characteristic?: string | null;
  policy_name?: string | null;
}

export type ConversationStage = "specifying" | "chatting";

export const TAXONOMY: Record<
  keyof PolicySpecification,
  { label: string; options: string[] }
> = {
  policy_lever: {
    label: "Policy lever",
    options: [
      "Price",
      "Placement & Positioning",
      "Information",
      "Availability",
      "Reformulation",
      "Portion Size",
      "Advertisement",
      "Treatment",
      "Education",
      "Physical activity",
      "Penalties",
      "Rewards & Incentives",
    ],
  },
  in_scope_businesses: {
    label: "In-scope businesses",
    options: [
      "Retailers",
      "Out of Home (OOH)",
      "Manufacturers",
      "Convenience stores",
      "Public sector (hospitals, prisons, schools etc)",
      "Takeaways",
    ],
  },
  business_size: {
    label: "Business size",
    options: [
      "Large businesses (250+ employees)",
      "Medium businesses (50+ employees)",
      "SMEs",
      "MSEs",
    ],
  },
  delivery_channel: {
    label: "Delivery channel",
    options: [
      "In-person",
      "Public services",
      "Food business",
      "Online",
      "Private providers",
    ],
  },
  population: {
    label: "Population",
    options: [
      "General",
      "Adults",
      "Children",
      "Lower income people",
      "Pregnant women/young families",
      "Adults living with obesity",
    ],
  },
  geography: {
    label: "Geography",
    options: ["UK-wide", "England", "Wales", "Scotland"],
  },
};

export const EMPTY_SPEC: PolicySpecification = {
  policy_lever: { values: [], source: "empty" },
  in_scope_businesses: { values: [], source: "empty" },
  business_size: { values: [], source: "empty" },
  delivery_channel: { values: [], source: "empty" },
  population: { values: [], source: "empty" },
  geography: { values: [], source: "empty" },
};

export function createEmptySpecMetadata(): SpecMetadata {
  return {
    spec: { ...EMPTY_SPEC },
    active_characteristic: null,
    policy_name: null,
  };
}
