"use client";

import { useSyncExternalStore } from "react";
import { getDeployment } from "@/lib/genlayer";
import type { Deployment } from "@/lib/genlayer";

/** The deployment chosen in this browser; "canonical" during SSR. Changing it reloads the page. */
export function useDeployment(): Deployment {
  return useSyncExternalStore(() => () => {}, getDeployment, () => "canonical");
}
