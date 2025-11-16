// src/lib/agents/tools/video-generation-tool.ts
/**
 * Video Generation Tool - Replicate & Runway Integration
 * Enables agents to generate short videos from text or images for:
 * - Hero section background videos
 * - Product demonstrations
 * - Animated illustrations
 * - Loading animations
 * - UI transitions and effects
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import fs from "fs/promises";
import path from "path";
import fetch, { type Response } from "node-fetch";

interface VideoGenerationParams {
  prompt: string;
  model: "replicate-svd" | "replicate-zeroscope" | "runway-gen2";
  duration?: number; // seconds (3-5 typical)
  fps?: number; // frames per second
  outputPath: string;
  inputImage?: string; // Optional: for image-to-video
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

interface GeneratedVideo {
  url: string;
  localPath: string;
  duration: number;
  model: string;
}

export class VideoGenerationTool extends BaseTool {
  name = "video_generation";
  description =
    "Generate short videos from text prompts or images for UI backgrounds, illustrations, and animations";

  parameters: ToolParameter[] = [
    {
      name: "prompt",
      type: "string",
      description:
        "Detailed description of the video to generate (motion, style, subject, camera movement)",
      required: true,
    },
    {
      name: "model",
      type: "string",
      description:
        "Video generation model: 'replicate-svd' (image-to-video, stable), 'replicate-zeroscope' (text-to-video, cinematic), 'runway-gen2' (high quality, expensive)",
      required: false,
      default: "replicate-zeroscope",
      enum: ["replicate-svd", "replicate-zeroscope", "runway-gen2"],
    },
    {
      name: "duration",
      type: "number",
      description: "Video duration in seconds (3-10, default: 4)",
      required: false,
      default: 4,
    },
    {
      name: "fps",
      type: "number",
      description: "Frames per second (24 or 30, default: 24)",
      required: false,
      default: 24,
    },
    {
      name: "aspectRatio",
      type: "string",
      description:
        "Video aspect ratio: '16:9' (landscape), '9:16' (portrait), '1:1' (square)",
      required: false,
      default: "16:9",
      enum: ["16:9", "9:16", "1:1"],
    },
    {
      name: "inputImage",
      type: "string",
      description:
        "Optional: Path to input image for image-to-video (required for replicate-svd model)",
      required: false,
    },
    {
      name: "outputPath",
      type: "string",
      description:
        "Relative path where to save the video (e.g., 'public/videos/hero-background.mp4')",
      required: true,
    },
  ];

  private parseParams(params: Record<string, unknown>): VideoGenerationParams {
    const prompt = params.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error(
        "prompt parameter is required and must be a non-empty string"
      );
    }

    const outputPath = params.outputPath;
    if (typeof outputPath !== "string" || !outputPath.trim()) {
      throw new Error(
        "outputPath parameter is required (e.g., 'public/videos/hero.mp4')"
      );
    }

    const model = (params.model as string) || "replicate-zeroscope";
    if (
      !["replicate-svd", "replicate-zeroscope", "runway-gen2"].includes(model)
    ) {
      throw new Error(
        "model must be one of: replicate-svd, replicate-zeroscope, runway-gen2"
      );
    }

    const duration = typeof params.duration === "number" ? params.duration : 4;
    if (duration < 3 || duration > 10) {
      throw new Error("duration must be between 3 and 10 seconds");
    }

    const fps = typeof params.fps === "number" ? params.fps : 24;
    if (![24, 30].includes(fps)) {
      throw new Error("fps must be 24 or 30");
    }

    const aspectRatio = (params.aspectRatio as string) || "16:9";
    if (!["16:9", "9:16", "1:1"].includes(aspectRatio)) {
      throw new Error("aspectRatio must be one of: 16:9, 9:16, 1:1");
    }

    const inputImage = params.inputImage as string | undefined;

    // Validate image-to-video requirements
    if (model === "replicate-svd" && !inputImage) {
      throw new Error(
        "inputImage is required when using replicate-svd (image-to-video) model"
      );
    }

    return {
      prompt: prompt.trim(),
      model: model as "replicate-svd" | "replicate-zeroscope" | "runway-gen2",
      duration,
      fps,
      outputPath: outputPath.trim(),
      inputImage,
      aspectRatio: aspectRatio as "16:9" | "9:16" | "1:1",
    };
  }

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const {
      prompt,
      model,
      duration,
      fps,
      outputPath,
      inputImage,
      aspectRatio,
    } = this.parseParams(params);
    const startTime = Date.now();

    try {
      this.logExecution("Generating video", {
        prompt: prompt.substring(0, 100),
        model,
        duration,
        fps,
        aspectRatio,
      });

      let generatedVideo: GeneratedVideo;

      // Route to appropriate generation service
      if (model.startsWith("replicate-")) {
        const replicateApiKey = env.REPLICATE_API_KEY;
        if (!replicateApiKey) {
          throw new Error(
            "REPLICATE_API_KEY environment variable is required for Replicate models"
          );
        }
        // Ensure duration and fps are always numbers
        const safeDuration = typeof duration === "number" ? duration : 4;
        const safeFps = typeof fps === "number" ? fps : 24;
        generatedVideo = await this.generateWithReplicate(
          replicateApiKey,
          prompt,
          model,
          safeDuration,
          safeFps,
          aspectRatio ?? "16:9",
          inputImage
        );
      } else if (model === "runway-gen2") {
        const runwayApiKey = env.RUNWAY_API_KEY;
        if (!runwayApiKey) {
          throw new Error(
            "RUNWAY_API_KEY environment variable is required for Runway Gen-2"
          );
        }
        generatedVideo = await this.generateWithRunway(
          runwayApiKey,
          prompt,
          typeof duration === "number" ? duration : 4,
          inputImage
        );
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }

      // Download and save the video
      const savedPath = await this.downloadAndSaveVideo(
        generatedVideo.url,
        outputPath,
        context.projectId
      );

      this.logExecution("Video generated successfully", {
        savedPath,
        duration: generatedVideo.duration,
        executionTime: Date.now() - startTime,
      });

      return {
        success: true,
        data: {
          prompt,
          localPath: savedPath,
          url: generatedVideo.url,
          duration: generatedVideo.duration,
          model: generatedVideo.model,
          fps,
          aspectRatio,
        },
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.logError("Video generation", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Generate video using Replicate API
   * Supports: Stable Video Diffusion (image-to-video), Zeroscope (text-to-video)
   */
  private async generateWithReplicate(
    apiKey: string,
    prompt: string,
    model: string,
    duration: number,
    fps: number,
    aspectRatio: string,
    inputImage?: string
  ): Promise<GeneratedVideo> {
    try {
      // Determine which Replicate model to use
      let modelVersion: string;
      let modelInput: Record<string, unknown>;

      if (model === "replicate-svd") {
        // Stable Video Diffusion - image to video
        modelVersion =
          "stablevideo/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438";

        if (!inputImage) {
          throw new Error("inputImage is required for Stable Video Diffusion");
        }

        modelInput = {
          input_image: inputImage,
          cond_aug: 0.02,
          decoding_t: 7,
          video_length: duration,
          sizing_strategy: "maintain_aspect_ratio",
          motion_bucket_id: 127,
          frames_per_second: fps,
        };
      } else {
        // Zeroscope - text to video
        modelVersion =
          "anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351";

        modelInput = {
          prompt,
          num_frames: duration * fps,
          fps,
          width:
            aspectRatio === "16:9" ? 1024 : aspectRatio === "9:16" ? 576 : 768,
          height:
            aspectRatio === "16:9" ? 576 : aspectRatio === "9:16" ? 1024 : 768,
          num_inference_steps: 50,
        };
      }

      // Create prediction
      let createResponse: Response;
      try {
        createResponse = await fetch(
          "https://api.replicate.com/v1/predictions",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              version: modelVersion,
              input: modelInput,
            }),
          }
        );
      } catch (fetchError) {
        throw new Error(
          `Failed to connect to Replicate API: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`
        );
      }

      if (!createResponse.ok) {
        let errorDetail = "Unknown error";
        try {
          const errorData: unknown = await createResponse.json();
          if (
            errorData &&
            typeof errorData === "object" &&
            "detail" in errorData
          ) {
            const detailValue = (errorData as Record<string, unknown>)[
              "detail"
            ];
            if (typeof detailValue === "string") {
              errorDetail = detailValue;
            }
          }
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(
          `Replicate API error: ${createResponse.status} - ${errorDetail}`
        );
      }

      const predictionJson: unknown = await createResponse.json();
      if (
        !predictionJson ||
        typeof predictionJson !== "object" ||
        !("id" in predictionJson) ||
        !("status" in predictionJson)
      ) {
        // Check if this is an error object
        if ("error" in (predictionJson as object)) {
          throw new Error(
            `Replicate API returned error: ${(predictionJson as { error?: string }).error ?? "Unknown error"}`
          );
        }
        throw new Error(
          "Replicate API did not return a valid prediction object"
        );
      }
      const prediction = {
        id: String((predictionJson as { id: unknown }).id),
        status: String((predictionJson as { status: unknown }).status),
        output: (predictionJson as { output?: unknown }).output as
          | string
          | undefined,
        error: (predictionJson as { error?: unknown }).error as
          | string
          | undefined,
      };

      logger.info("[VideoGenerationTool] Replicate prediction created", {
        predictionId: prediction.id,
        model,
      });

      // Poll for completion (with timeout)
      const videoUrl = await this.pollReplicatePrediction(
        apiKey,
        prediction.id,
        300000 // 5 minute timeout
      );

      return {
        url: videoUrl,
        localPath: "",
        duration,
        model,
      };
    } catch (error) {
      throw new Error(
        `Replicate video generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Poll Replicate prediction until complete
   */
  private async pollReplicatePrediction(
    apiKey: string,
    predictionId: string,
    timeout: number
  ): Promise<string> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeout) {
      const response = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: {
            Authorization: `Token ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to poll prediction: ${response.status}`);
      }

      const predictionJson: unknown = await response.json();
      if (
        !predictionJson ||
        typeof predictionJson !== "object" ||
        !("status" in predictionJson)
      ) {
        throw new Error("Replicate API did not return a valid prediction object");
      }

      const prediction = {
        status: String((predictionJson as { status: unknown }).status),
        output: (predictionJson as { output?: unknown }).output as string | undefined,
        error: (predictionJson as { error?: unknown }).error as string | undefined,
      };

      if (prediction.status === "succeeded") {
        if (!prediction.output) {
          throw new Error("Prediction succeeded but no output URL provided");
        }
        return prediction.output;
      }

      if (prediction.status === "failed") {
        throw new Error(
          `Prediction failed: ${prediction.error || "Unknown error"}`
        );
      }

      // Still processing, wait and retry
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error("Video generation timed out");
  }

  /**
   * Generate video using Runway Gen-2 API
   */
  private async generateWithRunway(
    apiKey: string,
    prompt: string,
    duration: number,
    inputImage?: string
  ): Promise<GeneratedVideo> {
    try {
      // Runway Gen-2 API endpoint
      const response = await fetch(
        "https://api.runwayml.com/v1/gen2/generate",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            promptText: prompt,
            ...(inputImage && { init_image: inputImage }),
            duration,
            resolution: "1280x768",
          }),
        }
      );

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(
          `Runway API error: ${response.status} - ${errorData.error || "Unknown error"}`
        );
      }

      const data = (await response.json()) as {
        id: string;
        status: string;
      };

      // Poll for completion
      const videoUrl = await this.pollRunwayGeneration(apiKey, data.id);

      return {
        url: videoUrl,
        localPath: "",
        duration,
        model: "runway-gen2",
      };
    } catch (error) {
      throw new Error(
        `Runway video generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Poll Runway generation until complete
   */
  private async pollRunwayGeneration(
    apiKey: string,
    generationId: string
  ): Promise<string> {
    const startTime = Date.now();
    const timeout = 300000; // 5 minutes
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < timeout) {
      const response = await fetch(
        `https://api.runwayml.com/v1/gen2/status/${generationId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to poll generation: ${response.status}`);
      }

      const data = (await response.json()) as {
        status: string;
        video_url?: string;
        error?: string;
      };

      if (data.status === "SUCCEEDED") {
        if (!data.video_url) {
          throw new Error("Generation succeeded but no video URL provided");
        }
        return data.video_url;
      }

      if (data.status === "FAILED") {
        throw new Error(`Generation failed: ${data.error || "Unknown error"}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error("Video generation timed out");
  }

  /**
   * Download video from URL and save to project directory
   */
  private async downloadAndSaveVideo(
    videoUrl: string,
    outputPath: string,
    projectId: string
  ): Promise<string> {
    try {
      // Fetch the video
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine the full path
      const projectDir = path.join(
        process.cwd(),
        "generated-projects",
        projectId
      );
      const fullPath = path.join(projectDir, outputPath);

      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Save the file
      await fs.writeFile(fullPath, buffer);

      logger.info("[VideoGenerationTool] Video saved", {
        path: fullPath,
        size: buffer.length,
      });

      return outputPath; // Return relative path for use in code
    } catch (error) {
      throw new Error(
        `Failed to save video: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  protected getExamples(): string[] {
    return [
      `// Generate hero background video (text-to-video)
{
  "prompt": "Smooth camera pan over abstract blue and purple geometric shapes, soft lighting, professional, clean minimalist design, slow motion",
  "model": "replicate-zeroscope",
  "duration": 5,
  "fps": 24,
  "aspectRatio": "16:9",
  "outputPath": "public/videos/hero-background.mp4"
}`,
      `// Generate product demo animation (text-to-video)
{
  "prompt": "3D isometric view of mobile app interface rotating slowly, modern UI with charts and graphs, smooth animation, professional lighting",
  "model": "replicate-zeroscope",
  "duration": 4,
  "fps": 30,
  "aspectRatio": "1:1",
  "outputPath": "public/videos/product-demo.mp4"
}`,
      `// Animate an existing image (image-to-video)
{
  "prompt": "Gentle camera zoom and parallax effect",
  "model": "replicate-svd",
  "duration": 3,
  "fps": 24,
  "inputImage": "public/images/hero.png",
  "outputPath": "public/videos/hero-animated.mp4"
}`,
      `// Generate loading animation
{
  "prompt": "Abstract flowing particles in blue and white colors, smooth motion, loop-able, minimal",
  "model": "replicate-zeroscope",
  "duration": 3,
  "fps": 30,
  "aspectRatio": "1:1",
  "outputPath": "public/videos/loading.mp4"
}`,
    ];
  }
}
