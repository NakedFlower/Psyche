const DEFAULT_API_VERSION = "preview";

export async function chatWithAzureOpenAI({
  prompt,
  system,
  endpoint = process.env.AZURE_OPENAI_PERSONA_ENDPOINT ||
    process.env.AZURE_OPENAI_RESPONSES_URL ||
    process.env.AZURE_OPENAI_ENDPOINT,
  apiKey = process.env.AZURE_OPENAI_API_KEY,
  deployment = process.env.AZURE_OPENAI_PERSONA_DEPLOYMENT ||
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion = process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION,
  apiStyle = process.env.AZURE_OPENAI_PERSONA_API || "auto",
  maxTokens = Number(process.env.AZURE_OPENAI_PERSONA_MAX_TOKENS || 1800),
  temperature = Number(process.env.AZURE_OPENAI_PERSONA_TEMPERATURE || 0.75)
}) {
  if (!endpoint) throw new Error("Missing AZURE_OPENAI_ENDPOINT");
  if (!apiKey) throw new Error("Missing AZURE_OPENAI_API_KEY");
  if (!deployment) {
    throw new Error("Missing AZURE_OPENAI_PERSONA_DEPLOYMENT or AZURE_OPENAI_DEPLOYMENT_NAME");
  }

  let request = buildRequest({
    endpoint,
    deployment,
    apiVersion,
    apiStyle,
    system,
    prompt,
    maxTokens,
    temperature
  });

  const started = performance.now();
  let response = await fetch(request.url, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify(request.body)
  });
  let result = await readResponse(response);

  if (!response.ok && isUnsupportedTemperatureError(result) && request.body.temperature !== undefined) {
    request = buildRequest({
      endpoint,
      deployment,
      apiVersion,
      apiStyle,
      system,
      prompt,
      maxTokens,
      temperature,
      omitTemperature: true
    });
    response = await fetch(request.url, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify(request.body)
    });
    result = await readResponse(response);
  }

  if (!response.ok) {
    throw new Error(`Azure OpenAI chat failed (${response.status}): ${stringifyBody(result)}`);
  }

  return {
    provider: "azure-openai",
    apiStyle: request.style,
    deployment,
    endpoint: redactEndpoint(request.url),
    latencyMs: Math.round(performance.now() - started),
    text: extractText(result),
    raw: result
  };
}

function buildRequest({
  endpoint,
  deployment,
  apiVersion,
  apiStyle,
  system,
  prompt,
  maxTokens,
  temperature,
  omitTemperature = false
}) {
  const normalizedEndpoint = endpoint.replace(/\/$/, "");
  const style =
    apiStyle === "auto"
      ? normalizedEndpoint.endsWith("/responses")
        ? "responses"
        : "chat"
      : apiStyle;

  if (style === "responses") {
    const url = normalizedEndpoint.endsWith("/responses")
      ? normalizedEndpoint
      : `${normalizedEndpoint}/openai/v1/responses`;
    return {
      style,
      url,
      body: {
        model: deployment,
        ...(system ? { instructions: system } : {}),
        input: prompt,
        max_output_tokens: maxTokens,
        ...(!omitTemperature ? { temperature } : {})
      }
    };
  }

  const url =
    apiVersion === "preview"
      ? `${normalizedEndpoint}/openai/v1/chat/completions`
      : `${normalizedEndpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  return {
    style: "chat",
    url,
    body: {
      model: deployment,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens,
      ...(!omitTemperature ? { temperature } : {})
    }
  };
}

function isUnsupportedTemperatureError(result) {
  const message = typeof result === "string" ? result : result?.error?.message || "";
  return /unsupported parameter/i.test(message) && /temperature/i.test(message);
}

function extractText(result) {
  if (typeof result.output_text === "string") return result.output_text.trim();
  const deepText = collectTextFields(result).join("").trim();
  if (deepText) return deepText;
  const responseText = (result.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || content.output_text || "")
    .join("")
    .trim();
  if (responseText) return responseText;
  return result.choices?.[0]?.message?.content?.trim() || "";
}

function collectTextFields(value, depth = 0) {
  if (!value || depth > 8) return [];
  if (typeof value === "string") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextFields(item, depth + 1));
  }
  if (typeof value !== "object") return [];

  const texts = [];
  for (const [key, nested] of Object.entries(value)) {
    if (
      typeof nested === "string" &&
      ["text", "output_text", "content"].includes(key) &&
      nested.trim()
    ) {
      texts.push(nested);
    } else {
      texts.push(...collectTextFields(nested, depth + 1));
    }
  }
  return texts;
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function stringifyBody(body) {
  return typeof body === "string" ? body : JSON.stringify(body);
}

function redactEndpoint(endpoint) {
  return endpoint.replace(/^https:\/\/([^./]+).*/, "https://$1...");
}
