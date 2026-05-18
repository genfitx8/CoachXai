import { GoogleAuth } from 'google-auth-library';

export interface AgentRuntimeConfig {
  projectId: string;
  location: string;
  agentResourceName: string;
  runtimeApiBaseUrl: string;
}

export class AgentRuntimeError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AgentRuntimeError';
    this.statusCode = statusCode;
  }
}

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const getConfig = (): AgentRuntimeConfig | null => {
  const projectId = (process.env.GCP_PROJECT_ID ?? '').trim();
  const location = (process.env.GCP_LOCATION ?? '').trim();
  const agentResourceName = (process.env.GCP_AGENT_RESOURCE_NAME ?? '').trim();
  const runtimeApiBaseUrl = (
    process.env.GCP_AGENT_PLATFORM_API_BASE_URL ??
    (location ? `https://${location}-aiplatform.googleapis.com/v1` : '')
  ).replace(/\/$/, '');

  if (!projectId || !location || !agentResourceName || !runtimeApiBaseUrl) {
    return null;
  }

  return {
    projectId,
    location,
    agentResourceName,
    runtimeApiBaseUrl,
  };
};

const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });

const buildRequestBody = (feature: string, payload: unknown, config: AgentRuntimeConfig) => ({
  input: {
    app: 'CoachXai',
    feature,
    payload,
    projectId: config.projectId,
    location: config.location,
  },
});

const extractAgentResult = (responseBody: unknown): unknown => {
  if (!responseBody || typeof responseBody !== 'object') {
    return responseBody;
  }

  const body = responseBody as Record<string, unknown>;

  if (body.output !== undefined) return body.output;
  if (body.result !== undefined) return body.result;
  if (body.response !== undefined) return body.response;
  if (body.text !== undefined) return body.text;

  const candidates = body.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const firstCandidate = candidates[0] as Record<string, unknown>;
    const content = firstCandidate.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    const textPart = parts?.find((part) => typeof part?.text === 'string');
    if (textPart?.text) return textPart.text;
  }

  return responseBody;
};

export const getAgentRuntimeStatus = () => {
  const config = getConfig();
  return {
    configured: Boolean(config),
    projectId: config?.projectId ?? null,
    location: config?.location ?? null,
    agentResourceName: config?.agentResourceName ?? null,
  };
};

export const invokeAgentRuntime = async (
  feature: string,
  payload: unknown
): Promise<unknown> => {
  const config = getConfig();
  if (!config) {
    throw new AgentRuntimeError(
      'Agent Runtime is not configured. Set GCP_PROJECT_ID, GCP_LOCATION, and GCP_AGENT_RESOURCE_NAME.',
      503
    );
  }

  const endpoint = `${config.runtimeApiBaseUrl}/${config.agentResourceName}:query`;
  const client = await auth.getClient();
  const authHeaders = await client.getRequestHeaders();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildRequestBody(feature, payload, config)),
  });

  const text = await response.text();
  let parsedBody: Record<string, unknown> | null = null;
  if (text) {
    try {
      parsedBody = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsedBody = { text };
    }
  }

  if (!response.ok) {
    const errorObject =
      parsedBody && typeof parsedBody.error === 'object'
        ? (parsedBody.error as Record<string, unknown>)
        : null;
    const errorMessage =
      (typeof errorObject?.message === 'string' ? errorObject.message : undefined) ??
      `Agent Runtime request failed (HTTP ${response.status})`;
    throw new AgentRuntimeError(errorMessage, response.status);
  }

  return extractAgentResult(parsedBody);
};
