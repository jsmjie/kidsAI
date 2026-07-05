export const DEFAULT_AGE_ID = "child_9_12";

export const AGE_BANDS = [
  { id: "child_6_8", label: "6-8" },
  { id: "child_9_12", label: "9-12" },
  { id: "teen_13_17", label: "13-17" }
] as const;

export type LearnerMemory = {
  interests: string[];
  recentConcepts: string[];
  preferredHintStyle: "gentle" | "socratic" | "step_by_step";
};
