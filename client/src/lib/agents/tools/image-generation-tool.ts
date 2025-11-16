// src/lib/agents/tools/image-generation-tool.ts
/**
 * Image Generation Tool - OpenAI DALL-E Integration
 * Enables agents to generate images from text prompts for:
 * - Hero images
 * - Illustrations
 * - Icons and graphics
 * - Product mockups
 * - UI placeholders
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

interface ImageGenerationParams {
  prompt: string;
  size: "1024x1024" | "1792x1024" | "1024x1792";
  quality: "standard" | "hd";
  outputPath: string;
  style?: "vivid" | "natural";
}

interface GeneratedImage {
  url: string;
  revisedPrompt?: string;
  localPath: string;
}

export class ImageGenerationTool extends BaseTool {
  name = "image_generation";
  description =
    "Generate images using OpenAI DALL-E 3 for UI elements, illustrations, and graphics";

  parameters: ToolParameter[] = [
    {
      name: "prompt",
      type: "string",
      description:
        "Detailed description of the image to generate (be specific about style, colors, composition)",
      required: true,
    },
    {
      name: "size",
      type: "string",
      description:
        "Image dimensions: 1024x1024 (square), 1792x1024 (landscape), 1024x1792 (portrait)",
      required: false,
      default: "1024x1024",
      enum: ["1024x1024", "1792x1024", "1024x1792"],
    },
    {
      name: "quality",
      type: "string",
      description: "Image quality: 'standard' (faster, cheaper) or 'hd' (higher detail)",
      required: false,
      default: "standard",
      enum: ["standard", "hd"],
    },
    {
      name: "style",
      type: "string",
      description:
        "Image style: 'vivid' (hyper-real, dramatic) or 'natural' (more realistic, subtle)",
      required: false,
      default: "natural",
      enum: ["vivid", "natural"],
    },
    {
      name: "outputPath",
      type: "string",
      description:
        "Relative path where to save the image (e.g., 'public/images/hero.png')",
      required: true,
    },
  ];

  private parseParams(params: Record<string, unknown>): ImageGenerationParams {
    const prompt = params.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("prompt parameter is required and must be a non-empty string");
    }

    const outputPath = params.outputPath;
    if (typeof outputPath !== "string" || !outputPath.trim()) {
      throw new Error(
        "outputPath parameter is required (e.g., 'public/images/hero.png')"
      );
    }

    const size = (params.size as string) || "1024x1024";
    if (!["1024x1024", "1792x1024", "1024x1792"].includes(size)) {
      throw new Error(
        "size must be one of: 1024x1024, 1792x1024, 1024x1792"
      );
    }

    const quality = (params.quality as string) || "standard";
    if (!["standard", "hd"].includes(quality)) {
      throw new Error("quality must be 'standard' or 'hd'");
    }

    const style = (params.style as string) || "natural";
    if (style && !["vivid", "natural"].includes(style)) {
      throw new Error("style must be 'vivid' or 'natural'");
    }

    return {
      prompt: prompt.trim(),
      size: size as "1024x1024" | "1792x1024" | "1024x1792",
      quality: quality as "standard" | "hd",
      outputPath: outputPath.trim(),
      style: style as "vivid" | "natural",
    };
  }

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { prompt, size, quality, outputPath, style } = this.parseParams(params);
    const startTime = Date.now();

    try {
      this.logExecution("Generating image with DALL-E", {
        prompt: prompt.substring(0, 100),
        size,
        quality,
        style,
      });

      // Check for OpenAI API key
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY environment variable is required for image generation"
        );
      }

      // Generate image using DALL-E 3
      const generatedImage = await this.generateWithDallE(
        apiKey,
        prompt,
        size,
        quality,
        style
      );

      // Download and save the image
      const savedPath = await this.downloadAndSaveImage(
        generatedImage.url,
        outputPath,
        context.projectId
      );

      this.logExecution("Image generated successfully", {
        savedPath,
        executionTime: Date.now() - startTime,
      });

      return {
        success: true,
        data: {
          prompt,
          revisedPrompt: generatedImage.revisedPrompt,
          localPath: savedPath,
          url: generatedImage.url,
          size,
          quality,
          style,
        },
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.logError("Image generation", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Generate image using OpenAI DALL-E 3 API
   */
  private async generateWithDallE(
    apiKey: string,
    prompt: string,
    size: string,
    quality: string,
    style?: string
  ): Promise<GeneratedImage> {
    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size,
          quality,
          style: style || "natural",
          response_format: "url",
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: { message?: string } };
        throw new Error(
          `OpenAI API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`
        );
      }

      const data = (await response.json()) as {
        data: Array<{
          url: string;
          revised_prompt?: string;
        }>;
      };

      if (!data.data || data.data.length === 0) {
        throw new Error("No image generated by DALL-E");
      }

      const imageData = data.data[0];

      logger.info("[ImageGenerationTool] DALL-E 3 generated image", {
        originalPrompt: prompt.substring(0, 100),
        revisedPrompt: imageData.revised_prompt?.substring(0, 100),
      });

      return {
        url: imageData.url,
        revisedPrompt: imageData.revised_prompt,
        localPath: "", // Will be set after download
      };
    } catch (error) {
      throw new Error(
        `DALL-E generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Download image from URL and save to project directory
   */
  private async downloadAndSaveImage(
    imageUrl: string,
    outputPath: string,
    projectId: string
  ): Promise<string> {
    try {
      // Fetch the image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine the full path
      // Assuming projects are stored in a specific directory structure
      // You may need to adjust this based on your project structure
      const projectDir = path.join(process.cwd(), "generated-projects", projectId);
      const fullPath = path.join(projectDir, outputPath);

      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Save the file
      await fs.writeFile(fullPath, buffer);

      logger.info("[ImageGenerationTool] Image saved", {
        path: fullPath,
        size: buffer.length,
      });

      return outputPath; // Return relative path for use in code
    } catch (error) {
      throw new Error(
        `Failed to save image: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  protected getExamples(): string[] {
    return [
      `// Generate hero image
{
  "prompt": "Modern tech startup hero image with abstract geometric shapes, gradient blue and purple colors, clean minimalist design, professional",
  "size": "1792x1024",
  "quality": "standard",
  "outputPath": "public/images/hero.png",
  "style": "natural"
}`,
      `// Generate product illustration
{
  "prompt": "Isometric illustration of a mobile app dashboard showing charts and analytics, flat design, pastel colors, clean and modern",
  "size": "1024x1024",
  "quality": "hd",
  "outputPath": "public/images/product-dashboard.png",
  "style": "vivid"
}`,
      `// Generate icon/graphic
{
  "prompt": "Simple icon of a rocket launching, flat design, single color navy blue, minimalist, transparent background suitable",
  "size": "1024x1024",
  "quality": "standard",
  "outputPath": "public/icons/rocket.png",
  "style": "natural"
}`,
      `// Generate background pattern
{
  "prompt": "Abstract wavy pattern background, soft pastel gradient from coral to lavender, smooth flowing curves, artistic and modern",
  "size": "1792x1024",
  "quality": "standard",
  "outputPath": "public/images/background-pattern.png",
  "style": "natural"
}`,
    ];
  }
}
