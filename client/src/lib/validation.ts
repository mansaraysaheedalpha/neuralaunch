// src/lib/validation.ts
// UPDATED VERSION - Using new @google/genai API

import { GoogleGenAI } from "@google/genai";
import { AI_MODELS } from "@/lib/models";

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || "",
});

interface ValidationScores {
  marketDemandScore: number;
  problemValidationScore: number;
  executionScore: number;
  totalValidationScore: number;
}

const SENTIMENT_PROMPT_TEMPLATE = `
You are an expert market validation analyst. Your task is to read the following raw customer interview notes and determine the user's sentiment regarding the *problem* being discussed.

**Output a single floating-point number from 0.0 to 1.0 and nothing else.**

- 0.0 means the users feel no pain, are indifferent, and do not have this problem.
- 0.5 means the users acknowledge the problem, but it's a minor inconvenience (a "nice-to-have" solution).
- 1.0 means the users are desperate, feel acute pain, and are actively seeking a solution (a "must-have" solution).

Here are the notes:
---
{{INTERVIEW_NOTES}}
---
`;

const INSIGHT_PROMPT_TEMPLATE = `
You are an expert startup advisor, like a Y Combinator partner. Your tone is direct, insightful, and "tough love."

A founder has just calculated their Validation Score. Based on their sub-scores, give them a 2-3 sentence actionable recommendation.

RULES:
- Be specific. Don't just say "good job."
- If a score is low, tell them why it's a problem and what to do.
- If a score is high, tell them what to double down on.

USER'S SCORES:
- Total Score: {{TOTAL}}/100
- Market Demand (from landing page): {{MARKET}}/40
- Problem Validation (from interviews): {{PROBLEM}}/50
- Execution (from sprint): {{EXECUTION}}/10

Your "Tough Love" Insight:
`;

/**
 * Generates an actionable insight based on validation scores.
 * @param {ValidationScores} scores - The calculated sub-scores.
 * @returns {Promise<string>} The AI-generated insight.
 */
export async function getValidationInsight(
  scores: ValidationScores
): Promise<string> {
  try {
    // Build the prompt with score replacements
    let prompt = INSIGHT_PROMPT_TEMPLATE.replace(
      "{{TOTAL}}",
      scores.totalValidationScore.toFixed(0)
    );
    prompt = prompt.replace("{{MARKET}}", scores.marketDemandScore.toFixed(0));
    prompt = prompt.replace(
      "{{PROBLEM}}",
      scores.problemValidationScore.toFixed(0)
    );
    prompt = prompt.replace("{{EXECUTION}}", scores.executionScore.toFixed(0));

    // Use the new API
    const result = await genAI.models.generateContent({
      model: AI_MODELS.PRIMARY,
      contents: prompt,
    });

    const text = result.text;

    if (!text) {
      throw new Error("No text content in AI response");
    }

    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error getting validation insight:", errorMessage);
    return "Could not generate AI insight. Check your scores and try again.";
  }
}

/**
 * Analyzes interview notes to generate a sentiment score.
 * @param {string} notes - The raw interview notes.
 * @returns {Promise<number>} A score from 0.0 to 1.0
 */
export async function getFeedbackSentiment(notes: string): Promise<number> {
  if (!notes || notes.trim().length < 20) {
    // Not enough data to analyze
    return 0.0;
  }

  try {
    const prompt = SENTIMENT_PROMPT_TEMPLATE.replace(
      "{{INTERVIEW_NOTES}}",
      notes
    );

    // Use the new API
    const result = await genAI.models.generateContent({
      model: AI_MODELS.FAST,
      contents: prompt,
    });

    const text = result.text;

    if (!text) {
      throw new Error("No text content in AI response");
    }

    const score = parseFloat(text);

    if (isNaN(score)) {
      console.error("AI sentiment analysis returned non-numeric value:", text);
      return 0.5; // Return a neutral score on failure
    }

    // Clamp the score between 0 and 1
    return Math.max(0, Math.min(1, score));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error getting feedback sentiment:", errorMessage);
    return 0.5; // Return neutral on error
  }
}
