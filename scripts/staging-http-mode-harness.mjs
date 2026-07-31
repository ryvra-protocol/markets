const required = ["STAGING_BASE_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const baseUrl = process.env.STAGING_BASE_URL;
const submitPath = process.env.STAGING_SUBMIT_PATH ?? "/v1/markets/intents";
const callbackPath = process.env.STAGING_CALLBACK_PATH ?? "/v1/markets/callbacks";
const statusPath = process.env.STAGING_STATUS_PATH ?? "/v1/markets/orders";
const reconPath = process.env.STAGING_RECON_PATH ?? "/v1/markets/reconciliation";
const timeoutMs = Number(process.env.STAGING_TIMEOUT_MS ?? "2000");
const retryCount = Number(process.env.STAGING_RETRY_COUNT ?? "2");
const token = process.env.STAGING_AUTH_TOKEN;

const referenceId = `rc-${Date.now()}`;
const idempotencyKey = `idem-${Date.now()}`;

function headers() {
  const value = { "content-type": "application/json" };
  if (token) value.authorization = "Token " + token;
  return value;
}

async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(label, fn) {
  let attempt = 0;
  while (attempt <= retryCount) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt === retryCount) throw error;
      console.log(`${label} retrying after failure (attempt ${attempt + 1}/${retryCount + 1})`);
      attempt += 1;
    }
  }
  throw new Error(`${label} retry loop exited unexpectedly`);
}

async function main() {
  console.log("Starting staging HTTP-mode verification harness");

  const submitPayload = {
    side: "buy",
    base_asset: "BTC",
    quote_asset: "USD",
    size: 0.01,
    max_slippage_bps: 50,
    ttl_ms: 30000,
    reference_id: referenceId,
    idempotency_key: idempotencyKey,
    correlation_id: referenceId
  };

  const submitResponse = await withRetry("submit", async () => {
    const response = await fetchWithTimeout(
      `${baseUrl}${submitPath}`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(submitPayload)
      },
      timeoutMs
    );
    if (!response.ok) throw new Error(`Submit failed with status ${response.status}`);
    return response;
  });
  console.log(`submit status=${submitResponse.status}`);

  const callbackPayload = {
    reference_id: referenceId,
    idempotency_key: idempotencyKey,
    state: "filled"
  };

  const firstCallback = await fetchWithTimeout(
    `${baseUrl}${callbackPath}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(callbackPayload)
    },
    timeoutMs
  );
  console.log(`first callback status=${firstCallback.status}`);

  const duplicateCallback = await fetchWithTimeout(
    `${baseUrl}${callbackPath}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(callbackPayload)
    },
    timeoutMs
  );
  console.log(`duplicate callback status=${duplicateCallback.status}`);

  const lateCallback = await fetchWithTimeout(
    `${baseUrl}${callbackPath}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...callbackPayload, state: "routed" })
    },
    timeoutMs
  );
  console.log(`late callback status=${lateCallback.status}`);

  const statusResponse = await fetchWithTimeout(
    `${baseUrl}${statusPath}/${encodeURIComponent(referenceId)}`,
    {
      method: "GET",
      headers: headers()
    },
    timeoutMs
  );
  console.log(`status check status=${statusResponse.status}`);

  const reconResponse = await fetchWithTimeout(
    `${baseUrl}${reconPath}?reference_id=${encodeURIComponent(referenceId)}`,
    {
      method: "GET",
      headers: headers()
    },
    timeoutMs
  );
  console.log(`reconciliation status=${reconResponse.status}`);

  console.log("Harness completed. Collect logs as evidence for checklist sign-off.");
}

main().catch((error) => {
  console.error("Harness failed:", error);
  process.exit(1);
});
