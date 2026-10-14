import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { buildHelpSystem, sanitizeCeoAnswer } from '@/lib/helpContext';

const HELP_MODEL = 'claude-haiku-4-5';
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

type Turn = { role: 'user' | 'assistant'; content: string };

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await refreshSessionMemberships(session);

  if (rateLimited(session.userId)) {
    return NextResponse.json(
      { error: 'Too many questions. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Help is not configured' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const question = String(body.message || '').trim();
  if (!question) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (question.length > 1000) return NextResponse.json({ error: 'Message is too long' }, { status: 400 });

  const history: Turn[] = Array.isArray(body.history)
    ? body.history
        .filter((t: Turn) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string')
        .slice(-6)
        .map((t: Turn) => ({ role: t.role, content: t.content.slice(0, 1500) }))
    : [];
  while (history.length && history[0].role !== 'user') history.shift();

  const isRmo = session.mode === 'RMO';
  const system = buildHelpSystem(isRmo ? 'RMO' : 'OPERATOR');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: HELP_MODEL,
        max_tokens: 400,
        temperature: 0.2,
        system,
        messages: [...history, { role: 'user', content: question }]
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Anthropic help error:', payload?.error?.type || res.status);
      return NextResponse.json({ error: 'Help is unavailable right now' }, { status: 502 });
    }
    let answer = Array.isArray(payload.content)
      ? payload.content
          .filter((b: { type?: string }) => b?.type === 'text')
          .map((b: { text?: string }) => b.text || '')
          .join('\n')
          .trim()
      : '';
    if (!answer) answer = 'Sorry, I could not answer that. Please contact your RMO.';
    if (!isRmo) answer = sanitizeCeoAnswer(answer);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error('help route error:', err);
    return NextResponse.json({ error: 'Help is unavailable right now' }, { status: 502 });
  }
}

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}
