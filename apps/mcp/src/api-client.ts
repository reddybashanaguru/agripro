import { randomUUID } from "crypto";

const BASE_URL = process.env.FINAGRA_API_URL ?? "http://localhost:8888";

export class FinagraAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FinagraAPIError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const code = (json.code as string) ?? "UNKNOWN_ERROR";
    const msg = (json.message as string) ?? res.statusText;
    throw new FinagraAPIError(res.status, code, msg);
  }

  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown, idempotencyKey?: string) =>
    request<T>("POST", path, body, idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : undefined),
  postWithAutoKey: <T>(path: string, body: unknown) =>
    request<T>("POST", path, body, { "X-Idempotency-Key": `mcp-${randomUUID()}` }),
};
