import { GoogleAuth } from 'google-auth-library';

type RuntimePart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

export interface AgentRuntimeInvokeRequest {
  operation: string;
  prompt?: string;
  parts?: RuntimePart[];
  responseMimeType?: string;
  temperature?: number;
}

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

const getLocation = () =>
  process.env.AGENT_PLATFORM_LOCATION ||
  process.env.GOOGLE_CLOUD_LOCATION ||
  process.env.GCLOUD_LOCATION ||
  'us-central1';

const getAgentResource = () =>
  (process.env.AGENT_PLATFORM_AGENT_RESOURCE || '').replace(/^\/+/, '');

const getRuntimeEndpoint = () => {
  if (process.env.AGENT_PLATFORM_RUNTIME_ENDPOINT) {
    return process.env.AGENT_PLATFORM_RUNTIME_ENDPOINT.trim();
  }

  const resource = getAgentResource();
  if (!resource) return '';
  return `https://${getLocation()}-aiplatform.googleapis.com/v1/${resource}:query`;
};

const extractText = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractText(item);
      if (text) return text;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const source = value as Record<string, unknown>;
  const directKeys = [
    'text',
    'outputText',
    'responseText',
    'answer',
    'reply',
    'output',
    'response',
    'result',
  ];

  for (const key of directKeys) {
    const text = extractText(source[key]);
    if (text) return text;
  }

  const parts = source.parts;
  if (Array.isArray(parts)) {
    const combined = parts
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        return typeof (part as Record<string, unknown>).text === 'string'
          ? ((part as Record<string, unknown>).text as string)
          : '';
      })
      .filter(Boolean)
      .join('\n');
    if (combined) return combined;
  }

  const nestedKeys = ['content', 'message', 'messages', 'candidates', 'predictions', 'data'];
  for (const key of nestedKeys) {
    const text = extractText(source[key]);
    if (text) return text;
  }

  return null;
};

const getAuthHeader = async () => {
  if (process.env.AGENT_PLATFORM_ACCESS_TOKEN) {
    return `Bearer ${process.env.AGENT_PLATFORM_ACCESS_TOKEN}`;
  }

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token?.token) {
    throw new Error('Failed to acquire Google Cloud access token (ADC).');
  }
  return `Bearer ${token.token}`;
};

export const isAgentRuntimeConfigured = () => Boolean(getRuntimeEndpoint());

export const invokeAgentRuntime = async (
  request: AgentRuntimeInvokeRequest
): Promise<{ text: string }> => {
  const endpoint = getRuntimeEndpoint();
  if (!endpoint) {
    throw new Error(
      'Agent runtime is not configured. Set AGENT_PLATFORM_RUNTIME_ENDPOINT or AGENT_PLATFORM_AGENT_RESOURCE.'
    );
  }

  const contentParts: RuntimePart[] =
    request.parts && request.parts.length > 0
      ? request.parts
      : request.prompt
      ? [{ text: request.prompt }]
      : [];

  const body = {
    // snake_case is required by the external Agent Platform runtime API contract.
    class_method: 'query',
    input: {
      messages: [
        {
          role: 'user',
          parts: contentParts,
        },
      ],
      operation: request.operation,
    },
    generationConfig: {
      responseMimeType: request.responseMimeType,
      temperature: request.temperature,
    },
  };

  const authHeader = await getAuthHeader();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = extractText(payload) || JSON.stringify(payload).slice(0, 400);
    throw new Error(`Agent runtime request failed (${response.status}): ${detail}`);
  }

  const text = extractText(payload);
  if (!text || !text.trim()) {
    throw new Error('Agent runtime returned an empty response payload.');
  }

  return { text };
};
