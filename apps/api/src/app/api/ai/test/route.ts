/**
 * Test AI Provider Configuration
 * POST /api/ai/test - Test AI provider connection
 */

import { NextRequest, NextResponse } from "next/server";
import { testAIConfigSchema } from "@brighttale/shared/schemas/ai";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = testAIConfigSchema.parse(body);

    // Parse optional config
    const config = validated.config_json
      ? JSON.parse(validated.config_json)
      : {};

    // Create provider based on type
    let testResult;
    switch (validated.provider) {
      case "openai": {
        const provider = new OpenAIProvider(validated.api_key, config);
        testResult = await testOpenAI(provider);
        break;
      }
      case "anthropic": {
        const provider = new AnthropicProvider(validated.api_key, config);
        testResult = await testAnthropic(provider);
        break;
      }
      case "local": {
        testResult = {
          success: false,
          error: "Local provider testing not implemented yet",
        };
        break;
      }
      default:
        return NextResponse.json(
          { error: "Unknown provider type" },
          { status: 400 },
        );
    }

    return NextResponse.json(testResult);
  } catch (error: any) {
    console.error("Error testing AI config:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to test AI config",
      },
      { status: 400 },
    );
  }
}

async function testOpenAI(provider: OpenAIProvider) {
  try {
    // Simple test generation
    const result = await provider.generateContent({
      agentType: "brainstorm",
      input: { test: "ping" },
      schema: require("zod").z.object({
        response: require("zod").z.string(),
      }),
      systemPrompt:
        "You are a test assistant. Respond with a simple JSON object containing a 'response' field with the value 'pong'.",
    });

    return {
      success: true,
      message: "OpenAI connection successful",
      test_response: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "OpenAI connection failed",
    };
  }
}

async function testAnthropic(provider: AnthropicProvider) {
  try {
    // Simple test generation
    const result = await provider.generateContent({
      agentType: "brainstorm",
      input: { test: "ping" },
      schema: require("zod").z.object({
        response: require("zod").z.string(),
      }),
      systemPrompt:
        "You are a test assistant. Respond with a simple YAML object containing a 'response' field with the value 'pong'.",
    });

    return {
      success: true,
      message: "Anthropic connection successful",
      test_response: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Anthropic connection failed",
    };
  }
}
