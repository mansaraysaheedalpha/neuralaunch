// scripts/list-models.ts  (or you can rename it to check-models.ts)
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function checkModelAccess() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("❌ GOOGLE_API_KEY not found in your .env file.");
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // A comprehensive list of potential model names to check
  const modelsToCheck = [
    "gemini-pro",
    "gemini-1.0-pro",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ];

  console.log("🔍 Checking access for the following Gemini models...");
  console.log("==================================================");

  for (const modelName of modelsToCheck) {
    try {
      // Get the model
      const model = genAI.getGenerativeModel({ model: modelName });

      // Perform a lightweight operation to confirm access.
      // This will throw an error if the model is not accessible.
      await model.countTokens("test");

      console.log(`✅ SUCCESS: You have access to "${modelName}"`);
    } catch (error: any) {
      console.log(`❌ FAILED:  Cannot access "${modelName}"`);
      if (
        error.message.includes("not found") ||
        error.message.includes("permission")
      ) {
        console.log(
          `   Reason: Model not found or not available for your API key/region.`
        );
      } else {
        console.log(
          `   Reason: An unexpected error occurred. Details: ${error.message}`
        );
      }
    } finally {
      console.log("--------------------------------------------------");
    }
  }
}

checkModelAccess();
