/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getEquilibriumAnalysis(
  scenario: string,
  state: { temperature: number; pressure: number; reactantA: number; reactantB: number; product: number }
) {
  const prompt = `
    Analyze the following chemical equilibrium state for the ${scenario}.
    Parameters (normalized 0-1):
    - Temperature: ${state.temperature.toFixed(2)}
    - Pressure: ${state.pressure.toFixed(2)}
    - Reactant A Concentration: ${state.reactantA.toFixed(2)}
    - Reactant B Concentration: ${state.reactantB.toFixed(2)}
    - Product Concentration: ${state.product.toFixed(2)}

    Explain how Le Châtelier’s Principle applies to this specific configuration.
    Provide an "Honors-Level" insight into the real-world complexity of managing this system (e.g., economic trade-offs in Haber process or ecological consequences in ocean chemistry).
    Format the response as JSON with "explanation" and "complexityInsight" fields.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            explanation: { type: "string" },
            complexityInsight: { type: "string" }
          },
          required: ["explanation", "complexityInsight"]
        }
      },
    });

    const text = response.response.text();
    // Use regex to extract JSON if it's wrapped in markers or followed by junk
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return {
      explanation: "Unable to generate AI analysis at this time.",
      complexityInsight: "Real-world management of chemical systems involves delicate balancing of kinetic and thermodynamic factors."
    };
  }
}
