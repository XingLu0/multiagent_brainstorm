"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getLLMConfig,
  setLLMConfig,
  fetchWithConfig,
  type ClientLLMConfig,
} from "@/lib/client-config";

export default function SettingsPage() {
  // 使用 lazy initial state 从 localStorage 读取配置，避免 useEffect 中调用 setState
  const initialConfig = getLLMConfig();
  const [apiKey, setApiKey] = useState(initialConfig.apiKey ?? "");
  const [baseURL, setBaseURL] = useState(initialConfig.baseURL ?? "");
  const [model, setModel] = useState(initialConfig.model ?? "");
  const [maxTokens, setMaxTokens] = useState(initialConfig.maxTokens?.toString() ?? "");
  const [temperature, setTemperature] = useState(initialConfig.temperature?.toString() ?? "");
  const [searchApiKey, setSearchApiKey] = useState(initialConfig.searchApiKey ?? "");
  const [providerType, setProviderType] = useState(initialConfig.providerType ?? "openai-compatible");

  // DEF-03: Embedding 独立配置
  const [embeddingBaseURL, setEmbeddingBaseURL] = useState(initialConfig.embeddingBaseURL ?? "");
  const [embeddingApiKey, setEmbeddingApiKey] = useState(initialConfig.embeddingApiKey ?? "");
  const [embeddingModel, setEmbeddingModel] = useState(initialConfig.embeddingModel ?? "");
  const [showEmbeddingConfig, setShowEmbeddingConfig] = useState(false);
  const [showEmbeddingKey, setShowEmbeddingKey] = useState(false);

  const [showApiKey, setShowApiKey] = useState(false);
  const [showSearchKey, setShowSearchKey] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "failed"
  >("idle");
  const [connectionMessage, setConnectionMessage] = useState("");

  // LLM 调用统计
  const [llmStats, setLlmStats] = useState<{
    totalCalls: number;
    successCount: number;
    failedCount: number;
    successRate: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    avgDurationMs: number;
    recentCalls: {
      id: string;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      durationMs: number;
      success: boolean;
      errorMessage: string | null;
      createdAt: string;
    }[];
  } | null>(null);

  useEffect(() => {
    fetchWithConfig("/api/v1/llm-stats")
      .then((res) => res.json())
      .then((data) => setLlmStats(data))
      .catch(() => {});
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const buildConfig = useCallback((): ClientLLMConfig => {
    const config: ClientLLMConfig = {};
    if (apiKey.trim()) config.apiKey = apiKey.trim();
    if (baseURL.trim()) config.baseURL = baseURL.trim();
    if (model.trim()) config.model = model.trim();
    if (maxTokens.trim()) {
      const n = parseInt(maxTokens.trim());
      if (!isNaN(n) && n > 0) config.maxTokens = n;
    }
    if (temperature.trim()) {
      const t = parseFloat(temperature.trim());
      if (!isNaN(t) && t >= 0 && t <= 2) config.temperature = t;
    }
    if (searchApiKey.trim()) config.searchApiKey = searchApiKey.trim();
    if (providerType) config.providerType = providerType;
    // DEF-03: Embedding 配置
    if (embeddingBaseURL.trim()) config.embeddingBaseURL = embeddingBaseURL.trim();
    if (embeddingApiKey.trim()) config.embeddingApiKey = embeddingApiKey.trim();
    if (embeddingModel.trim()) config.embeddingModel = embeddingModel.trim();
    return config;
  }, [apiKey, baseURL, model, maxTokens, temperature, searchApiKey, providerType, embeddingBaseURL, embeddingApiKey, embeddingModel]);

  const handleSave = useCallback(() => {
    const config = buildConfig();
    setLLMConfig(config);
    setToast("设置已保存");
  }, [buildConfig]);

  const handleTestConnection = useCallback(async () => {
    // Save config first so the test uses the latest values
    const config = buildConfig();
    setLLMConfig(config);

    setConnectionStatus("testing");
    setConnectionMessage("");
    try {
      const res = await fetchWithConfig("/api/v1/test-connection");
      const data = await res.json();
      if (data.success) {
        setConnectionStatus("success");
        setConnectionMessage(`连接成功！模型: ${data.model}，Base URL: ${data.baseUrl}`);
      } else {
        setConnectionStatus("failed");
        setConnectionMessage(data.message ?? "连接失败");
      }
    } catch (e) {
      setConnectionStatus("failed");
      setConnectionMessage(e instanceof Error ? e.message : "未知错误");
    }
  }, [buildConfig]);

  return (
    <main className="min-h-full flex-1 bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          返回项目列表
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-gray-900">API 设置</h1>
        <p className="mb-2 text-sm text-gray-500">
          配置 LLM API 和搜索工具的 API Key
        </p>

        {/* Priority note */}
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-700">
            <span className="font-medium">配置优先级：</span>
            环境变量 (.env) &gt; 页面输入 &gt; 默认值。留空表示使用环境变量或默认值。
          </p>
        </div>

        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          {/* Provider Type */}
          <div>
            <label htmlFor="providerType" className="mb-1 block text-sm font-medium text-gray-700">
              LLM Provider
            </label>
            <select
              id="providerType"
              value={providerType}
              onChange={(e) => {
                const value = e.target.value;
                setProviderType(value);
                if (value === "ollama") {
                  setBaseURL("http://localhost:11434/v1");
                  setApiKey("ollama");
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="openai-compatible">OpenAI 兼容（DeepSeek / MiMo / 通义千问 等）</option>
              <option value="anthropic" disabled>Anthropic（即将支持）</option>
              <option value="ollama">Ollama（本地离线）</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              {providerType === "ollama"
                ? "Ollama 模式无需 API Key。请确保本地已安装 Ollama 并运行模型（如 ollama run llama3.2）。默认地址：http://localhost:11434/v1"
                : "选择 LLM 服务提供商。OpenAI 兼容模式支持所有遵循 OpenAI Chat Completions API 的服务。"}
            </p>
          </div>

          {/* LLM API Key */}
          <div>
            <label htmlFor="apiKey" className="mb-1 block text-sm font-medium text-gray-700">
              LLM API Key
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={providerType === "ollama"}
                placeholder={providerType === "ollama" ? "Ollama 无需 API Key" : "留空则使用环境变量 LLM_API_KEY"}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-20 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showApiKey ? "隐藏" : "显示"}
              </button>
            </div>
          </div>

          {/* API Base URL */}
          <div>
            <label htmlFor="baseURL" className="mb-1 block text-sm font-medium text-gray-700">
              API Base URL
            </label>
            <input
              id="baseURL"
              type="text"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoComplete="off"
            />
          </div>

          {/* Model name */}
          <div>
            <label htmlFor="model" className="mb-1 block text-sm font-medium text-gray-700">
              模型名称
            </label>
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini / deepseek-v4-pro / mimo-v2.5-pro"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoComplete="off"
            />
          </div>

          {/* Max Tokens & Temperature */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="maxTokens" className="mb-1 block text-sm font-medium text-gray-700">
                Max Tokens
              </label>
              <input
                id="maxTokens"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="2048"
                min={1}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="temperature" className="mb-1 block text-sm font-medium text-gray-700">
                Temperature
              </label>
              <input
                id="temperature"
                type="number"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="0.7"
                step={0.1}
                min={0}
                max={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 pt-4">
            <h2 className="mb-1 text-sm font-semibold text-gray-700">搜索工具配置</h2>
            <p className="mb-3 text-xs text-gray-400">
              配置 Tavily API Key 后，联网搜索将使用 Tavily（AI 专用搜索）。留空默认使用 DuckDuckGo 免费搜索，Wikipedia 作为最终回退。
            </p>
          </div>

          {/* Tavily Search API Key */}
          <div>
            <label htmlFor="searchApiKey" className="mb-1 block text-sm font-medium text-gray-700">
              Tavily 搜索 API Key
            </label>
            <div className="relative">
              <input
                id="searchApiKey"
                type={showSearchKey ? "text" : "password"}
                value={searchApiKey}
                onChange={(e) => setSearchApiKey(e.target.value)}
                placeholder="留空则使用环境变量 TAVILY_API_KEY，默认 DuckDuckGo 免费搜索"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-20 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSearchKey(!showSearchKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showSearchKey ? "隐藏" : "显示"}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              免费注册：{" "}
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                tavily.com
              </a>
              {" "}（免费额度 1000 次/月）
            </p>
          </div>

          {/* DEF-03: Embedding 配置（折叠式） */}
          <div className="border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowEmbeddingConfig(!showEmbeddingConfig)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-sm font-semibold text-gray-700">Embedding 向量嵌入配置（可选）</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 text-gray-400 transition-transform ${showEmbeddingConfig ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showEmbeddingConfig && (
              <div className="mt-3 space-y-4">
                <p className="text-xs text-gray-400">
                  配置独立的 Embedding 端点以启用 RAG 语义检索。留空则使用上方 LLM 配置（部分 Provider 如 MiMo 不支持 Embedding 端点，会导致 RAG 降级为全量检索）。
                </p>
                <div>
                  <label htmlFor="embeddingBaseURL" className="mb-1 block text-sm font-medium text-gray-700">
                    Embedding Base URL
                  </label>
                  <input
                    id="embeddingBaseURL"
                    type="text"
                    value={embeddingBaseURL}
                    onChange={(e) => setEmbeddingBaseURL(e.target.value)}
                    placeholder="https://api.openai.com/v1（留空则使用 LLM Base URL）"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="embeddingApiKey" className="mb-1 block text-sm font-medium text-gray-700">
                    Embedding API Key
                  </label>
                  <div className="relative">
                    <input
                      id="embeddingApiKey"
                      type={showEmbeddingKey ? "text" : "password"}
                      value={embeddingApiKey}
                      onChange={(e) => setEmbeddingApiKey(e.target.value)}
                      placeholder="留空则使用 LLM API Key"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-20 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmbeddingKey(!showEmbeddingKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
                    >
                      {showEmbeddingKey ? "隐藏" : "显示"}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="embeddingModel" className="mb-1 block text-sm font-medium text-gray-700">
                    Embedding 模型名称
                  </label>
                  <input
                    id="embeddingModel"
                    type="text"
                    value={embeddingModel}
                    onChange={(e) => setEmbeddingModel(e.target.value)}
                    placeholder="text-embedding-3-small（默认）"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    autoComplete="off"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Connection test result */}
          {connectionStatus !== "idle" && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                connectionStatus === "testing"
                  ? "border-gray-200 bg-gray-50 text-gray-600"
                  : connectionStatus === "success"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <div className="flex items-center gap-2">
                {connectionStatus === "testing" && (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400"></span>
                    <span>正在测试连接...</span>
                  </>
                )}
                {connectionStatus === "success" && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-green-500"></span>
                    <span>{connectionMessage}</span>
                  </>
                )}
                {connectionStatus === "failed" && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-500"></span>
                    <span>连接失败：{connectionMessage}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={connectionStatus === "testing"}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectionStatus === "testing" ? "测试中..." : "测试连接"}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              保存设置
            </button>
          </div>
        </form>
      </div>

      {/* LLM 调用统计 */}
      {llmStats && llmStats.totalCalls > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">LLM 调用统计</h2>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">总调用数</p>
              <p className="text-xl font-semibold text-gray-900">{llmStats.totalCalls}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">成功率</p>
              <p className="text-xl font-semibold text-gray-900">{(llmStats.successRate * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">平均耗时</p>
              <p className="text-xl font-semibold text-gray-900">{Math.round(llmStats.avgDurationMs)}ms</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">总 Token</p>
              <p className="text-xl font-semibold text-gray-900">{(llmStats.totalInputTokens + llmStats.totalOutputTokens).toLocaleString()}</p>
            </div>
          </div>
          {llmStats.recentCalls.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">时间</th>
                    <th className="py-2 pr-4 font-medium">模型</th>
                    <th className="py-2 pr-4 font-medium">耗时</th>
                    <th className="py-2 pr-4 font-medium">Token</th>
                    <th className="py-2 pr-4 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {llmStats.recentCalls.slice(0, 10).map((call) => (
                    <tr key={call.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-600">{new Date(call.createdAt).toLocaleString("zh-CN")}</td>
                      <td className="py-2 pr-4 text-gray-600">{call.model}</td>
                      <td className="py-2 pr-4 text-gray-600">{call.durationMs}ms</td>
                      <td className="py-2 pr-4 text-gray-600">
                        {(call.inputTokens ?? 0) + (call.outputTokens ?? 0)}
                      </td>
                      <td className="py-2 pr-4">
                        {call.success ? (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">成功</span>
                        ) : (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700" title={call.errorMessage ?? ""}>失败</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
            <p className="text-sm text-gray-700">{toast}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-gray-400 transition-colors hover:text-gray-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
