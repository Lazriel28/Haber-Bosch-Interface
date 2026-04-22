/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Scenario {
  HABER_BOSCH = "Haber-Bosch Process",
  OCEAN_ACIDIFICATION = "Ocean Carbonate System",
}

export interface SimulationState {
  temperature: number; // 0 to 1
  pressure: number;    // 0 to 1
  reactantA: number;   // 0 to 1 (N2 or CO2)
  reactantB: number;   // 0 to 1 (H2 or H2O)
  product: number;     // 0 to 1 (NH3 or H2CO3/H+)
}

export interface AnalysisData {
  shift: "left" | "right" | "none";
  reason: string;
  implication: string;
}
