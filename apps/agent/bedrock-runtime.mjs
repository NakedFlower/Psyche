import crypto from "node:crypto";

const DEFAULT_REGION = "us-east-1";
const DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-20250514-v1:0";

export async function converseWithBedrock({
  prompt,
  system,
  modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID,
  region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || DEFAULT_REGION,
  maxTokens = Number(process.env.BEDROCK_MAX_TOKENS || 1800),
  temperature = Number(process.env.BEDROCK_TEMPERATURE || 0.45)
}) {
  const normalizedModelId = normalizeBedrockModelId(modelId);
  const authMode = getAuthMode();
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const path = `/model/${normalizedModelId}/converse`;
  const url = `https://${host}${path}`;
  const body = JSON.stringify({
    ...(system ? { system: [{ text: system }] } : {}),
    messages: [
      {
        role: "user",
        content: [{ text: prompt }]
      }
    ],
    inferenceConfig: {
      maxTokens,
      temperature
    }
  });

  const headers =
    authMode === "bearer"
      ? getBearerHeaders()
      : signAwsRequest({
          method: "POST",
          host,
          path,
          region,
          service: "bedrock",
          body,
          credentials: getAwsCredentials(),
          extraHeaders: {
            accept: "application/json",
            "content-type": "application/json"
          }
        });

  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body
  });
  const result = await readResponse(response);

  if (!response.ok) {
    throw new Error(`Bedrock converse failed (${response.status}): ${stringifyBody(result)}`);
  }

  return {
    provider: "bedrock",
    authMode,
    modelId: normalizedModelId,
    region,
    latencyMs: Math.round(performance.now() - started),
    text: extractConverseText(result),
    raw: result
  };
}

export function normalizeBedrockModelId(modelId) {
  const value = String(modelId || "").trim();
  if (!value) return DEFAULT_MODEL_ID;
  if (/^[a-z]{2}\./.test(value)) return value;
  return `us.${value}`;
}

function getAwsCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS credentials: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
  }

  return { accessKeyId, secretAccessKey, sessionToken };
}

function getAuthMode() {
  const explicit = (process.env.BEDROCK_AUTH_MODE || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.BEDROCK_BEARER_TOKEN || process.env.BEDROCK_API_KEY) return "bearer";
  return "aws";
}

function getBearerHeaders() {
  const token = process.env.BEDROCK_BEARER_TOKEN || process.env.BEDROCK_API_KEY;
  if (!token) {
    throw new Error("Missing Bedrock bearer token: BEDROCK_BEARER_TOKEN or BEDROCK_API_KEY");
  }

  return {
    authorization: `Bearer ${token}`,
    accept: "application/json",
    "content-type": "application/json"
  };
}

function signAwsRequest({
  method,
  host,
  path,
  region,
  service,
  body,
  credentials,
  extraHeaders
}) {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const headers = {
    ...extraHeaders,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };

  if (credentials.sessionToken) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const signedHeaders = Object.keys(headers)
    .map((key) => key.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaders
    .map((key) => `${key}:${String(headers[key]).trim()}\n`)
    .join("");
  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = getSignatureKey(credentials.secretAccessKey, dateStamp, region, service);
  const signature = hmacHex(signingKey, stringToSign);

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`
  };
}

function extractConverseText(result) {
  const blocks = result?.output?.message?.content || [];
  return blocks.map((block) => block.text || "").join("").trim();
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

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key, value) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function getSignatureKey(secretAccessKey, dateStamp, regionName, serviceName) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}
