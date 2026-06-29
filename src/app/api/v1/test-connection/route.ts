import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createLLMModel } from "@/lib/llm";
import { resolveConfigFromRequest } from "@/lib/server-config";

export async function GET(request: Request) {
  try {
    const config = resolveConfigFromRequest(request);
    const model = createLLMModel(config);

    const result = await generateText({
      model,
      prompt: "请回复'连接成功'四个字。",
      maxOutputTokens: 20,
    });

    return NextResponse.json({
      success: true,
      message: "连接成功",
      model: config.model,
      baseUrl: config.baseURL,
      response: result.text,
    });
  } catch (error) {
    console.error("[Test Connection Error]", error);
    const config = resolveConfigFromRequest(request);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "连接失败，请检查API配置",
        model: config.model,
        baseUrl: config.baseURL,
      },
      { status: 500 }
    );
  }
}
