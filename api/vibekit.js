import { VibeKit } from '@vibe-kit/sdk';
import { createE2BProvider } from '@vibe-kit/e2b';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT_CHARS = 40_000;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      enabled: isConfigured(),
      provider: process.env.VIBEKIT_PROVIDER || 'openai',
      agentType: process.env.VIBEKIT_AGENT_TYPE || 'codex',
      model: process.env.VIBEKIT_MODEL || null,
      sandbox: 'e2b',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const missing = missingConfig();
  if (missing.length > 0) {
    return res.status(503).json({
      error: 'VibeKit is not configured',
      missing,
    });
  }

  const { command, timeoutMs, background, sessionId, keepAlive, port } = req.body || {};
  if (typeof command !== 'string' || command.trim().length === 0) {
    return res.status(400).json({ error: 'command is required' });
  }

  let vibeKit;
  try {
    vibeKit = createVibeKit(sessionId);
    const result = await vibeKit.executeCommand(command, {
      timeoutMs: clampTimeout(timeoutMs),
      background: Boolean(background),
    });
    const nextSessionId = await vibeKit.getSession();
    const host = Number.isInteger(port) ? await vibeKit.getHost(port) : null;

    if (!keepAlive && !background) {
      await vibeKit.kill();
    }

    return res.status(200).json({
      exitCode: result?.exitCode ?? 0,
      stdout: truncate(result?.stdout || ''),
      stderr: truncate(result?.stderr || ''),
      sandboxId: result?.sandboxId || nextSessionId,
      host,
    });
  } catch (err) {
    if (vibeKit && !keepAlive && !background) {
      try {
        await vibeKit.kill();
      } catch (cleanupErr) {
        console.warn('VibeKit cleanup failed:', cleanupErr);
      }
    }
    console.error('VibeKit error:', err);
    return res.status(500).json({
      error: 'VibeKit command failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function createVibeKit(sessionId) {
  const e2bProvider = createE2BProvider({
    apiKey: process.env.E2B_API_KEY,
    templateId: process.env.VIBEKIT_E2B_TEMPLATE_ID || undefined,
  });

  const vibeKit = new VibeKit()
    .withAgent({
      type: process.env.VIBEKIT_AGENT_TYPE || 'codex',
      provider: process.env.VIBEKIT_PROVIDER || 'openai',
      apiKey: resolveAgentApiKey(),
      model: process.env.VIBEKIT_MODEL,
    })
    .withSandbox(e2bProvider)
    .withWorkingDirectory(process.env.VIBEKIT_WORKING_DIRECTORY || '/var/vibe0');

  const secrets = parseSecrets(process.env.VIBEKIT_SECRETS_JSON);
  if (Object.keys(secrets).length > 0) {
    vibeKit.withSecrets(secrets);
  }
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    vibeKit.withSession(sessionId);
  }
  return vibeKit;
}

function isConfigured() {
  return missingConfig().length === 0;
}

function missingConfig() {
  const missing = [];
  if (!process.env.VIBEKIT_ADMIN_TOKEN) missing.push('VIBEKIT_ADMIN_TOKEN');
  if (!process.env.E2B_API_KEY) missing.push('E2B_API_KEY');
  if (!process.env.VIBEKIT_MODEL) missing.push('VIBEKIT_MODEL');
  if (!resolveAgentApiKey()) missing.push(agentApiKeyEnvName());
  return missing;
}

function isAuthorized(req) {
  const expected = process.env.VIBEKIT_ADMIN_TOKEN;
  if (!expected) return false;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token.length > 0 && token === expected;
}

function resolveAgentApiKey() {
  const provider = process.env.VIBEKIT_PROVIDER || 'openai';
  if (process.env.VIBEKIT_AGENT_API_KEY) return process.env.VIBEKIT_AGENT_API_KEY;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (provider === 'gemini' || provider === 'google') return process.env.GOOGLE_API_KEY;
  return process.env.OPENAI_API_KEY;
}

function agentApiKeyEnvName() {
  const provider = process.env.VIBEKIT_PROVIDER || 'openai';
  if (provider === 'anthropic') return 'VIBEKIT_AGENT_API_KEY or ANTHROPIC_API_KEY';
  if (provider === 'gemini' || provider === 'google') return 'VIBEKIT_AGENT_API_KEY or GOOGLE_API_KEY';
  return 'VIBEKIT_AGENT_API_KEY or OPENAI_API_KEY';
}

function parseSecrets(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function clampTimeout(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(MAX_TIMEOUT_MS, Math.floor(n)));
}

function truncate(value) {
  const text = String(value);
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n[truncated]`;
}
