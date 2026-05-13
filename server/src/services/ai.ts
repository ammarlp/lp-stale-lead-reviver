import OpenAI from 'openai';
import type { DraftContext } from '../types';

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function hasAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function draftMessage(
  ctx: DraftContext
): Promise<{ message: string; source: 'ai' | 'template' }> {
  if (!hasAIKey()) {
    return { message: buildTemplateMessage(ctx), source: 'template' };
  }
  try {
    const msg = await callOpenAI(ctx);
    return { message: msg, source: 'ai' };
  } catch (err) {
    console.warn('[AI] falling back to template:', (err as Error).message);
    return { message: buildTemplateMessage(ctx), source: 'template' };
  }
}

export function buildTemplateMessage(ctx: DraftContext): string {
  const first = ctx.contact.firstName || 'there';
  const stage = ctx.pipelineStageName ? ` in ${ctx.pipelineStageName}` : '';
  if (ctx.channel === 'sms') {
    return `Hey ${first}, just circling back${stage}. Would you like to pick up where we left off? Reply YES and I'll send a link. [AI key not set — template message]`;
  }
  return `Hi ${first},\n\nI wanted to reach out${stage}. It's been a while since we last connected and I'd love to catch up. Let me know if you'd like to schedule a quick chat.\n\n— Team\n\n[AI key not set — template message]`;
}

async function callOpenAI(ctx: DraftContext): Promise<string> {
  const system = `You draft re-engagement messages for ${ctx.businessName}. Brand voice samples:
---
${ctx.brandVoice || '(no samples provided — use a warm, professional tone)'}
---
Rules:
- Reference one specific detail from the contact's history.
- Max 320 chars for SMS, 140 words for email.
- One clear CTA.
- No emojis unless the brand voice uses them.
- Never use "Just checking in" or "Hope you're well."`;

  const user = `Draft a ${ctx.channel} to ${[ctx.contact.firstName, ctx.contact.lastName].filter(Boolean).join(' ') || 'this contact'}. Context:
${ctx.contextSummary}
Last interaction: ${ctx.lastActivityRelative}
Pipeline stage: ${ctx.pipelineStageName || 'n/a'}
Tags: ${ctx.tags.join(', ') || 'none'}`;

  const completion = await openai().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
    max_tokens: 400,
  });
  return completion.choices[0]?.message?.content?.trim() || buildTemplateMessage(ctx);
}

export type ReplySentiment = 'positive' | 'negative' | 'neutral' | 'unsubscribe';

export async function classifyReply(text: string): Promise<ReplySentiment> {
  if (!hasAIKey()) return keywordClassify(text);
  try {
    const completion = await openai().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Classify the reply as exactly one of: positive, negative, neutral, unsubscribe. Reply with only the single word.',
        },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 5,
    });
    const label = (completion.choices[0]?.message?.content || '').trim().toLowerCase();
    if (['positive', 'negative', 'neutral', 'unsubscribe'].includes(label)) return label as ReplySentiment;
    return keywordClassify(text);
  } catch {
    return keywordClassify(text);
  }
}

export function keywordClassify(text: string): ReplySentiment {
  const t = text.toLowerCase();
  if (/(stop|unsubscribe|opt[ -]?out|remove me|do not (contact|text|email))/i.test(t)) return 'unsubscribe';
  if (/(yes|sure|yeah|yep|book|schedule|interested|send (me )?the|let'?s chat|call me)/i.test(t)) return 'positive';
  if (/(no thanks|not interested|not right now|later|already|bought elsewhere)/i.test(t)) return 'negative';
  return 'neutral';
}

export async function summarizeHistory(ctx: {
  contact: any;
  conversations: any[];
  pipelineStageName?: string;
  tags: string[];
  lastActivityRelative: string;
}): Promise<string> {
  // Template summary — used when no AI key, or as input for the AI drafter.
  const recent = ctx.conversations
    ?.slice(0, 2)
    .map((c: any) => c.lastMessageBody || c.body || '')
    .filter(Boolean)
    .map((s: string) => s.slice(0, 80))
    .join(' | ');
  const parts = [
    ctx.pipelineStageName ? `Stage: ${ctx.pipelineStageName}` : null,
    `Last activity: ${ctx.lastActivityRelative}`,
    ctx.tags?.length ? `Tags: ${ctx.tags.slice(0, 3).join(', ')}` : null,
    recent ? `Recent messages: ${recent}` : null,
  ].filter(Boolean);
  return parts.join('. ') + '.';
}
