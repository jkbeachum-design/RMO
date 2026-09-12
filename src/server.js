/**
 * Vanguard RMO Compliance Copilot — Node.js Backend
 *
 * Handles:
 * - Retell webhook ingestion (call_ended events) — authenticated via shared secret
 * - LLM-based extraction refinement (Claude)
 * - Rule engine (compliance flag evaluation)
 * - Supabase storage (service_role — trusted server job only)
 *
 * Deploy to Vercel with environment variables:
 * - SUPABASE_URL
 * - SUPABASE_KEY (service_role)
 * - ANTHROPIC_API_KEY
 * - RETELL_WEBHOOK_SECRET (required in production; RETELL_API_KEY accepted as fallback)
 */

require('dotenv').config();

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const {
  filterAlertEmails,
  filterAlertPhones,
  filterAlertRecipients
} = require('./alertRecipients');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_KEY', 'ANTHROPIC_API_KEY'];

function isConfigured(value) {
  return Boolean(value) && !String(value).includes('your_') && !String(value).includes('placeholder');
}

const missingEnv = REQUIRED_ENV.filter((key) => !isConfigured(process.env[key]));

if (missingEnv.length > 0) {
  console.warn(
    `WARNING: Missing or placeholder env vars: ${missingEnv.join(', ')}. ` +
      'Health checks will work; webhook processing will fail until they are set.'
  );
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 20 }
});

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'compliance-documents';

const supabase =
  isConfigured(process.env.SUPABASE_URL) && isConfigured(process.env.SUPABASE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
        auth: { persistSession: false }
      })
    : null;

const anthropic = isConfigured(process.env.ANTHROPIC_API_KEY)
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/**
 * Authenticate Retell (and trusted Next.js proxy) webhooks.
 * Accepts:
 *   - Authorization: Bearer <RETELL_WEBHOOK_SECRET|RETELL_API_KEY>
 *   - x-retell-signature: <secret>  (shared-secret mode)
 *   - x-webhook-secret: <secret>
 *
 * In production, a secret MUST be configured or requests are rejected.
 */
function getWebhookSecret() {
  if (isConfigured(process.env.RETELL_WEBHOOK_SECRET)) return process.env.RETELL_WEBHOOK_SECRET;
  if (isConfigured(process.env.RETELL_API_KEY)) return process.env.RETELL_API_KEY;
  return null;
}

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyRetellWebhook(req) {
  const secret = getWebhookSecret();
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  if (!secret) {
    if (isProd) {
      console.error('RETELL_WEBHOOK_SECRET (or RETELL_API_KEY) is required in production');
      return false;
    }
    console.warn('WARNING: Retell webhook auth disabled (no RETELL_WEBHOOK_SECRET in non-production)');
    return true;
  }

  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const signature =
    req.headers['x-retell-signature'] ||
    req.headers['x-webhook-secret'] ||
    '';

  if (bearer && timingSafeEqualString(bearer, secret)) return true;
  if (signature && timingSafeEqualString(String(signature), secret)) return true;
  return false;
}

// ============================================================================
// WEBHOOK: Retell AI Call Ended
// ============================================================================

app.post('/api/webhooks/retell', async (req, res) => {
  try {
    if (!verifyRetellWebhook(req)) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    if (!supabase || !anthropic) {
      return res.status(503).json({
        error: 'Server misconfigured',
        missing: missingEnv
      });
    }

    const payload = normalizeRetellPayload(req.body);
    console.log('Retell webhook received:', payload.event, payload.call_id || '(no call_id)');

    // Acknowledge non-target events quickly so Retell does not retry
    if (payload.event && payload.event !== 'call_ended') {
      return res.status(204).send();
    }

    if (!payload.event) {
      return res.status(400).json({ error: 'Missing event type' });
    }

    if (!payload.transcript || !String(payload.transcript).trim()) {
      console.warn('call_ended with empty transcript; storing minimal log skipped');
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'empty_transcript',
        call_id: payload.call_id
      });
    }

    // Step 1: Extract structured data from transcript via Claude
    const extractedData = await extractDataFromTranscript(payload.transcript);
    console.log('Extracted data:', JSON.stringify(extractedData));

    if (!extractedData.license_number) {
      return res.status(422).json({
        error: 'Could not determine license_number from transcript',
        call_id: payload.call_id
      });
    }

    // Step 2: Look up license from extracted license_number
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_number', String(extractedData.license_number))
      .single();

    if (licenseError || !license) {
      console.error('License not found:', extractedData.license_number, licenseError);
      return res.status(404).json({
        error: 'License not found',
        license_number: extractedData.license_number
      });
    }

    // Step 3: Resolve operator if named
    let operator = null;
    if (extractedData.operator_name) {
      const { data: existingOp } = await supabase
        .from('users')
        .select('*')
        .eq('license_id', license.id)
        .eq('user_name', extractedData.operator_name)
        .eq('role', 'OPERATOR')
        .maybeSingle();

      operator =
        existingOp ||
        {
          license_id: license.id,
          user_name: extractedData.operator_name,
          user_email: `operator_${Date.now()}@vanguard.local`,
          phone_number: payload.from_number || payload.user_id || null,
          role: 'OPERATOR'
        };
    }

    // Step 4: Run rule engine
    const ruleSettings = await loadRuleSettings(license.id);
    const riskFlags = evaluateComplianceRules(extractedData, license, ruleSettings);

    // Step 5: Store compliance log in Supabase
    const callTimestamp = payload.end_timestamp
      ? new Date(payload.end_timestamp).toISOString()
      : new Date().toISOString();

    const complianceLog = {
      license_id: license.id,
      source_type: 'VOICE_CALL',
      source_channel: 'RETELL',
      raw_payload: payload.transcript,
      call_recording_url: payload.recording_url || null,
      call_duration_seconds: payload.duration_seconds || null,
      call_timestamp: callTimestamp,
      extracted_data: {
        ...extractedData,
        retell_call_id: payload.call_id || null,
        from_number: payload.from_number || null
      },
      risk_flags: riskFlags,
      compliance_month: getComplianceMonth(new Date(callTimestamp)),
      created_at: new Date().toISOString()
    };

    const { data: log, error: logError } = await supabase
      .from('compliance_logs')
      .insert([complianceLog])
      .select();

    if (logError) {
      console.error('Failed to store compliance log:', logError);
      return res.status(500).json({ error: 'Failed to store log', details: logError.message });
    }

    // Step 6: Create/update projects if mentioned
    if (Array.isArray(extractedData.projects)) {
      for (const project of extractedData.projects) {
        await upsertProject(license.id, project);
      }
    }

    // Step 7: Create/update subcontractors if mentioned
    if (Array.isArray(extractedData.subcontractors)) {
      for (const sub of extractedData.subcontractors) {
        await upsertSubcontractor(license.id, sub);
      }
    }

    // Step 8: Notify RMO if critical flags
    if (riskFlags.critical_flags && riskFlags.critical_flags.length > 0) {
      await notifyRMO(license, riskFlags, { logId: log[0].id });
    }

    return res.status(200).json({
      success: true,
      call_id: payload.call_id,
      log_id: log[0].id,
      license_number: license.license_number,
      risk_count: riskFlags.raw_flags ? riskFlags.raw_flags.length : 0,
      flagged: riskFlags.flagged
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Retell posts { event, call: { call_id, transcript, ... } }.
 * Also accept the flattened shape used in local/manual tests.
 */
function normalizeRetellPayload(body) {
  const event = body?.event;
  const call = body?.call && typeof body.call === 'object' ? body.call : null;

  const call_id = call?.call_id || body?.call_id || null;
  const transcript = call?.transcript || body?.transcript || '';
  const recording_url =
    call?.recording_url || call?.public_log_url || body?.recording_url || null;

  let duration_seconds =
    body?.duration_seconds ??
    call?.duration_seconds ??
    null;

  if (duration_seconds == null && call?.start_timestamp && call?.end_timestamp) {
    duration_seconds = Math.round((call.end_timestamp - call.start_timestamp) / 1000);
  } else if (duration_seconds == null && call?.duration_ms != null) {
    duration_seconds = Math.round(Number(call.duration_ms) / 1000);
  }

  return {
    event,
    call_id,
    transcript,
    recording_url,
    duration_seconds,
    from_number: call?.from_number || body?.from_number || null,
    user_id: body?.user_id || call?.from_number || null,
    end_timestamp: call?.end_timestamp || body?.end_timestamp || null,
    raw: body
  };
}

// ============================================================================
// EXTRACTION: Claude API Refines Retell Transcript → Structured JSON
// ============================================================================

async function extractDataFromTranscript(transcript) {
  const extractionPrompt = `
You are a compliance data extraction assistant. Extract structured compliance information from this
construction field operator call transcript.

Output ONLY valid JSON (no markdown, no preamble).

REQUIRED Fields:
- license_number: The CSLB license number mentioned or inferred (e.g., "836089" or "1160775")
- operator_name: Name of the operator reporting
- projects: Array of {address, contract_value (number or null), trades, subcontractors_mentioned}
- subcontractors: Array of {company_name, cslb_license_number, trade, coi_expiration_date, cslb_verified}
- crew_status: {has_direct_employees (boolean), employee_count, raw_statement}
- permits: Array of {project_address, permit_number, permit_status}

RULES:
1. If license_number is not explicitly stated, leave it null — do not guess a default license
2. If a company name is clearly stated, map known entities when present in the transcript (e.g. "Beachum" → "836089", "Vanguard" → "1160775") only when unambiguous
3. If a contract value is mentioned with "K" (e.g., "15K"), convert to number (15000)
4. If COI date is mentioned (e.g., "expires June 2027"), format as ISO date YYYY-MM-DD
5. If operator says they hired crew or employees, set has_direct_employees to true
6. Mark trades as an array of strings (e.g., ["Framing", "Electrical"])
7. Set cslb_verified to false unless the transcript clearly confirms CSLB verification
8. Never invent a license_number that was not stated or clearly implied by company name

Transcript:
"""
${transcript}
"""

Return only the JSON object.
`;

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: extractionPrompt }]
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  let jsonStr = responseText.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/```$/, '');
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/```$/, '');
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (parseError) {
    console.error('Claude JSON parse failed. Raw response:', responseText);
    throw new Error(`Failed to parse extraction JSON: ${parseError.message}`);
  }
}


function defaultRuleSettings() {
  return {
    contract_value_threshold: 10000,
    permit_required_above: 10000,
    min_trades_for_b_general: 3,
    flag_unverified_subs: true,
    flag_expired_coi: true,
    flag_workers_comp_exempt_crew: true,
    flag_scope_mismatch: true,
    flag_missing_permit: true,
    low_involvement_days: 14,
    digest_enabled: true,
    digest_hour_pt: 7,
    alert_email: null,
    alert_phone: null
  };
}

async function loadRuleSettings(licenseId) {
  const defaults = defaultRuleSettings();
  if (!licenseId) return defaults;
  try {
    const { data } = await supabase
      .from('compliance_settings')
      .select('*')
      .eq('license_id', licenseId)
      .maybeSingle();
    if (!data) return defaults;
    return {
      contract_value_threshold: Number(data.contract_value_threshold ?? defaults.contract_value_threshold),
      permit_required_above: Number(data.permit_required_above ?? defaults.permit_required_above),
      min_trades_for_b_general: Number(data.min_trades_for_b_general ?? defaults.min_trades_for_b_general),
      flag_unverified_subs: data.flag_unverified_subs !== false,
      flag_expired_coi: data.flag_expired_coi !== false,
      flag_workers_comp_exempt_crew: data.flag_workers_comp_exempt_crew !== false,
      flag_scope_mismatch: data.flag_scope_mismatch !== false,
      flag_missing_permit: data.flag_missing_permit !== false,
      low_involvement_days: Number(data.low_involvement_days ?? defaults.low_involvement_days),
      digest_enabled: data.digest_enabled !== false,
      digest_hour_pt: Number(data.digest_hour_pt ?? defaults.digest_hour_pt),
      alert_email: data.alert_email || null,
      alert_phone: data.alert_phone || null
    };
  } catch (err) {
    console.warn('loadRuleSettings failed; using defaults', err?.message || err);
    return defaults;
  }
}

// ============================================================================
// RULE ENGINE: Evaluate Compliance Flags
// ============================================================================

function evaluateComplianceRules(extractedData, license, settings = defaultRuleSettings()) {
  const flags = {
    critical_flags: [],
    warning_flags: [],
    raw_flags: []
  };

  const contractThreshold = Number(settings.contract_value_threshold ?? 10000);
  const permitThreshold = Number(settings.permit_required_above ?? 10000);
  const minTrades = Number(settings.min_trades_for_b_general ?? 3);

  // FLAG 1: Workers' Comp Violation
  if (
    settings.flag_workers_comp_exempt_crew !== false &&
    extractedData.crew_status?.has_direct_employees === true &&
    license.workers_comp_status === 'EXEMPT'
  ) {
    flags.critical_flags.push('WORKERS_COMP_VIOLATION');
    flags.raw_flags.push({
      flag: 'WORKERS_COMP_VIOLATION',
      reason: `Operator reported direct crew hiring, but license is exempt from workers' comp`,
      severity: 'CRITICAL',
      statement: extractedData.crew_status.raw_statement
    });
  }

  // FLAG 2: Contract Threshold Exceeded
  if (Array.isArray(extractedData.projects)) {
    for (const project of extractedData.projects) {
      if (project.contract_value && Number(project.contract_value) > contractThreshold) {
        flags.warning_flags.push('THRESHOLD_EXCEEDED');
        flags.raw_flags.push({
          flag: 'THRESHOLD_EXCEEDED',
          reason: `Contract value $${project.contract_value} exceeds $${contractThreshold} threshold`,
          severity: 'HIGH',
          address: project.address
        });
      }
    }
  }

  // FLAG 3: Unverified Subcontractors
  if (settings.flag_unverified_subs !== false && Array.isArray(extractedData.subcontractors)) {
    for (const sub of extractedData.subcontractors) {
      if (!sub.cslb_verified) {
        flags.warning_flags.push('UNVERIFIED_SUBCONTRACTOR');
        flags.raw_flags.push({
          flag: 'UNVERIFIED_SUBCONTRACTOR',
          reason: `Subcontractor "${sub.company_name}" (${sub.cslb_license_number || 'no license #'}) not yet verified`,
          severity: 'MEDIUM',
          subcontractor: sub.company_name
        });
      }
    }
  }

  // FLAG 4: Expired COI
  if (settings.flag_expired_coi !== false && Array.isArray(extractedData.subcontractors)) {
    const today = new Date().toISOString().split('T')[0];
    for (const sub of extractedData.subcontractors) {
      if (sub.coi_expiration_date && sub.coi_expiration_date < today) {
        flags.warning_flags.push('EXPIRED_COI');
        flags.raw_flags.push({
          flag: 'EXPIRED_COI',
          reason: `Certificate of Insurance expired on ${sub.coi_expiration_date}`,
          severity: 'HIGH',
          subcontractor: sub.company_name
        });
      }
    }
  }

  // FLAG 5: Scope Mismatch (B-General requires framing or N+ unrelated trades)
  if (
    settings.flag_scope_mismatch !== false &&
    license.classification === 'B - GENERAL BUILDING' &&
    Array.isArray(extractedData.projects)
  ) {
    for (const project of extractedData.projects) {
      const trades = project.trades || [];
      const hasFraming = trades.some(
        (t) =>
          String(t).toLowerCase().includes('frame') ||
          String(t).toLowerCase().includes('structural')
      );
      const uniqueTrades = new Set(trades).size;

      if (trades.length > 0 && !hasFraming && uniqueTrades < minTrades) {
        flags.warning_flags.push('SCOPE_MISMATCH');
        flags.raw_flags.push({
          flag: 'SCOPE_MISMATCH',
          reason: `B-General requires framing OR ${minTrades}+ unrelated trades. Found: ${trades.join(', ')}`,
          severity: 'MEDIUM',
          address: project.address,
          trades
        });
      }
    }
  }

  // FLAG 6: Missing permit above threshold
  if (settings.flag_missing_permit !== false && Array.isArray(extractedData.projects)) {
    const permits = Array.isArray(extractedData.permits) ? extractedData.permits : [];
    for (const project of extractedData.projects) {
      if (project.contract_value && Number(project.contract_value) > permitThreshold) {
        const hasPermit = permits.some(
          (p) =>
            p.permit_number &&
            (!p.project_address ||
              String(p.project_address).toLowerCase().includes(
                String(project.address || '').toLowerCase().slice(0, 12)
              ) ||
              String(project.address || '')
                .toLowerCase()
                .includes(String(p.project_address).toLowerCase().slice(0, 12)))
        );
        if (!hasPermit) {
          flags.warning_flags.push('MISSING_PERMIT');
          flags.raw_flags.push({
            flag: 'MISSING_PERMIT',
            reason: `Contract value $${project.contract_value} exceeds $${permitThreshold} but no permit number was reported`,
            severity: 'MEDIUM',
            address: project.address
          });
        }
      }
    }
  }

  return {
    critical_flags: [...new Set(flags.critical_flags)],
    warning_flags: [...new Set(flags.warning_flags)],
    raw_flags: flags.raw_flags,
    flagged: flags.critical_flags.length > 0 || flags.warning_flags.length > 0
  };
}

// ============================================================================
// HELPERS: Project/Subcontractor Upsert
// ============================================================================

async function upsertProject(licenseId, projectData) {
  if (!projectData?.address) {
    console.warn('Skipping project upsert: missing address');
    return null;
  }

  const hasEndDate = Boolean(projectData.end_date);
  const status =
    projectData.status === 'COMPLETED' || projectData.closed || hasEndDate
      ? 'COMPLETED'
      : projectData.status || 'ACTIVE';

  const row = {
    license_id: licenseId,
    project_address: projectData.address,
    contract_value: projectData.contract_value ?? null,
    permit_number: projectData.permit_number || null,
    trades_involved: projectData.trades || [],
    scope_description: projectData.trades ? projectData.trades.join(', ') : null,
    start_date: projectData.start_date || null,
    end_date: projectData.end_date || null,
    status,
    updated_at: new Date().toISOString()
  };

  // Schema has no UNIQUE(license_id, project_address) — select then insert/update
  const { data: existing, error: findError } = await supabase
    .from('projects')
    .select('id')
    .eq('license_id', licenseId)
    .eq('project_address', projectData.address)
    .maybeSingle();

  if (findError) {
    console.error('Project lookup error:', findError);
    return null;
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('projects')
      .update(row)
      .eq('id', existing.id)
      .select();
    if (error) console.error('Project update error:', error);
    return data;
  }

  const { data, error } = await supabase
    .from('projects')
    .insert([{ ...row, created_at: new Date().toISOString() }])
    .select();
  if (error) console.error('Project insert error:', error);
  return data;
}

async function upsertSubcontractor(licenseId, subData) {
  if (!subData?.company_name) {
    console.warn('Skipping subcontractor upsert: missing company_name');
    return null;
  }

  const today = new Date().toISOString().split('T')[0];
  const coiDate = subData.coi_expiration_date || null;
  const coiUrl = subData.coi_document_url || null;
  const coiCurrent = Boolean(coiUrl && coiDate && coiDate >= today);

  const row = {
    license_id: licenseId,
    company_name: subData.company_name,
    cslb_license_number: subData.cslb_license_number || null,
    trade: subData.trade || null,
    coi_expiration_date: coiDate,
    coi_verified: coiCurrent,
    // Persist COI file URL in notes until a dedicated column exists
    notes: coiUrl || subData.notes || null,
    cslb_verified: false,
    updated_at: new Date().toISOString()
  };

  if (row.cslb_license_number) {
    const { data, error } = await supabase
      .from('subcontractors')
      .upsert(
        { ...row, created_at: new Date().toISOString() },
        { onConflict: 'license_id,cslb_license_number' }
      )
      .select();
    if (error) console.error('Subcontractor upsert error:', error);
    return data;
  }

  // No CSLB number: match by company name within license
  const { data: existing, error: findError } = await supabase
    .from('subcontractors')
    .select('id')
    .eq('license_id', licenseId)
    .eq('company_name', subData.company_name)
    .maybeSingle();

  if (findError) {
    console.error('Subcontractor lookup error:', findError);
    return null;
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('subcontractors')
      .update(row)
      .eq('id', existing.id)
      .select();
    if (error) console.error('Subcontractor update error:', error);
    return data;
  }

  const { data, error } = await supabase
    .from('subcontractors')
    .insert([{ ...row, created_at: new Date().toISOString() }])
    .select();
  if (error) console.error('Subcontractor insert error:', error);
  return data;
}

// ============================================================================
// NOTIFICATION: Alert RMO to Critical Flags (email + SMS when configured)
// ============================================================================

async function resolveRmoContacts(license) {
  const contacts = { emails: new Set(), phones: new Set() };

  if (license.alert_email) contacts.emails.add(String(license.alert_email).trim());
  if (license.alert_phone) contacts.phones.add(String(license.alert_phone).trim());

  if (process.env.RMO_ALERT_EMAIL) {
    String(process.env.RMO_ALERT_EMAIL)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((e) => contacts.emails.add(e));
  }
  if (process.env.RMO_ALERT_PHONE) {
    String(process.env.RMO_ALERT_PHONE)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p) => contacts.phones.add(p));
  }

  try {
    const { data: members } = await supabase
      .from('user_licenses')
      .select('role, users(user_email, phone_number, role)')
      .eq('license_id', license.id)
      .in('role', ['RMO', 'ADMIN']);

    for (const row of members || []) {
      const u = Array.isArray(row.users) ? row.users[0] : row.users;
      if (u?.user_email) contacts.emails.add(u.user_email);
      if (u?.phone_number) contacts.phones.add(u.phone_number);
    }
  } catch (err) {
    console.warn('Could not resolve RMO membership contacts:', err.message || err);
  }

  // Permanent guard: allowlist/blocklist before any notify or digest picks a recipient
  return filterAlertRecipients({
    emails: [...contacts.emails],
    phones: [...contacts.phones]
  });
}

async function sendEmailAlert({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL || 'RMO Compliance <onboarding@resend.dev>';
  // Last-line filter so every Resend path honors allowlist/blocklist
  const recipients = filterAlertEmails(to);
  if (!recipients.length) {
    return { skipped: true, reason: 'no_allowed_recipients' };
  }
  if (!apiKey) return { skipped: true, reason: 'email_not_configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      text
    })
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Resend email failed:', res.status, body);
    return { ok: false, status: res.status, body };
  }
  return { ok: true, to: recipients };
}

async function sendSmsAlert({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  // Last-line filter so every Twilio path honors allowlist/blocklist
  const recipients = filterAlertPhones(to);
  if (!recipients.length) {
    return { skipped: true, reason: 'no_allowed_recipients' };
  }
  if (!sid || !token || !from) {
    return { skipped: true, reason: 'sms_not_configured' };
  }

  const results = [];
  for (const phone of recipients) {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({
      To: phone,
      From: from,
      Body: body.slice(0, 1500)
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      }
    );
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Twilio SMS failed:', res.status, errBody);
      results.push({ phone, ok: false });
    } else {
      results.push({ phone, ok: true });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}

async function notifyRMO(license, riskFlags, logMeta = {}) {
  const flags = riskFlags.critical_flags || [];
  const subject = `[RMO Compliance] Critical flags — ${license.entity_name} (#${license.license_number})`;
  const text = [
    `Critical compliance flags for ${license.entity_name} (CSLB #${license.license_number}).`,
    '',
    `Flags: ${flags.join(', ') || 'none'}`,
    logMeta.logId ? `Log ID: ${logMeta.logId}` : null,
    logMeta.dashboardUrl ? `Review: ${logMeta.dashboardUrl}` : null,
    '',
    'Open the RMO Compliance inbox to review and acknowledge.'
  ]
    .filter(Boolean)
    .join('\n');

  console.log(`ALERT: Critical flags for ${license.entity_name} (${license.license_number})`);
  console.log('Flags:', flags);

  const contacts = await resolveRmoContacts(license);
  const dashboardBase = process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  const enrichedText = logMeta.logId && dashboardBase
    ? `${text}\n\n${dashboardBase.replace(/\/$/, '')}/dashboard/${logMeta.logId}`
    : text;

  const emailResult = await sendEmailAlert({
    to: contacts.emails,
    subject,
    text: enrichedText
  });
  const smsResult = await sendSmsAlert({
    to: contacts.phones,
    body: `RMO Compliance: critical flags on ${license.entity_name} (#${license.license_number}): ${flags.join(', ')}`
  });

  return { contacts, emailResult, smsResult };
}

// ============================================================================
// HELPER: Compliance Month (America/Los_Angeles)
// ============================================================================

function getComplianceMonth(date) {
  // California CSLB context — bucket by Pacific calendar month
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}-01`;
}

// ============================================================================
// ENDPOINT: Structured PWA form submission (trusted Next.js proxy only)
// ============================================================================

app.post('/api/submit-report', upload.any(), async (req, res) => {
  try {
    if (!verifyRetellWebhook(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!supabase) {
      return res.status(503).json({
        error: 'Server misconfigured',
        missing: missingEnv
      });
    }

    const { operatorName, licenseId, projects, subcontractors, crewStatus, notes } = req.body;

    if (!operatorName || !licenseId) {
      return res.status(400).json({ error: 'operatorName and licenseId are required' });
    }

    let projectsRaw = [];
    let subcontractorsRaw = [];
    let crewStatusData = {};

    try {
      projectsRaw = JSON.parse(projects || '[]');
      subcontractorsRaw = JSON.parse(subcontractors || '[]');
      crewStatusData = JSON.parse(crewStatus || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON in form fields' });
    }

    const files = req.files || [];

    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_number', String(licenseId))
      .single();

    if (licenseError || !license) {
      return res.status(404).json({ error: 'License not found', licenseId });
    }

    const fileUrls = { cois: [], permits: [], photos: [] };
    const coiBySubIndex = {};

    for (const file of files) {
      const safeName = String(file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${license.license_number}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file.buffer, {
          contentType: file.mimetype || 'application/octet-stream',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        continue;
      }

      const { data: publicUrl } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const url = publicUrl?.publicUrl;
      if (!url) continue;

      if (file.fieldname === 'permits') {
        fileUrls.permits.push(url);
      } else if (file.fieldname === 'photos') {
        fileUrls.photos.push(url);
      } else if (file.fieldname === 'cois') {
        fileUrls.cois.push({ company_name: null, url });
      } else if (/^coi_\d+$/.test(file.fieldname)) {
        const idx = Number(file.fieldname.split('_')[1]);
        coiBySubIndex[idx] = url;
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const projectsData = projectsRaw
      .filter((p) => p && (p.address || p.contractValue || p.contract_value))
      .map((p) => {
        const closed = Boolean(p.closed || p.status === 'COMPLETED');
        const endDate = p.end_date || p.endDate || (closed ? today : null) || null;
        const startDate = p.start_date || p.startDate || null;
        return {
          address: p.address || null,
          contract_value:
            p.contract_value != null && p.contract_value !== ''
              ? Number(p.contract_value)
              : p.contractValue != null && p.contractValue !== ''
                ? Number(p.contractValue)
                : null,
          trades: Array.isArray(p.trades)
            ? p.trades.filter(Boolean)
            : String(p.trades || '')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
          permit_number: p.permit_number || p.permitNumber || null,
          start_date: startDate,
          end_date: endDate,
          status: closed || endDate ? 'COMPLETED' : 'ACTIVE',
          closed: closed || Boolean(endDate),
          subcontractors_mentioned: p.subcontractors_mentioned || []
        };
      });

    const namedSubs = subcontractorsRaw.filter((s) => s && (s.company || s.company_name));
    const subcontractorsData = namedSubs.map((s, idx) => {
      const company = s.company_name || s.company;
      const coiUrl = coiBySubIndex[idx] || s.coi_document_url || s.coiDocumentUrl || null;
      const coiDate = s.coi_expiration_date || s.coiExpiration || null;
      if (coiUrl) {
        fileUrls.cois.push({ company_name: company, url: coiUrl });
      }
      return {
        company_name: company,
        cslb_license_number: s.cslb_license_number || s.cslbLicense || null,
        trade: s.trade || null,
        coi_expiration_date: coiDate,
        coi_document_url: coiUrl,
        coi_current: Boolean(coiUrl && coiDate && coiDate >= today),
        cslb_verified: false
      };
    });

    const extractedData = {
      operator_name: operatorName,
      license_number: String(licenseId),
      projects: projectsData,
      subcontractors: subcontractorsData,
      crew_status: {
        has_direct_employees: Boolean(crewStatusData.hasEmployees),
        employee_count: crewStatusData.employee_count ?? null,
        raw_statement:
          crewStatusData.explanation ||
          (crewStatusData.hasEmployees
            ? 'Operator reported direct employees/hired crew'
            : 'No direct employees — everything subcontractors')
      },
      permits: projectsData.map((p) => ({
        project_address: p.address,
        permit_number: p.permit_number,
        permit_status: p.permit_number ? 'Submitted' : 'Not filed'
      })),
      file_urls: fileUrls,
      notes: notes || null,
      audit_summary: {
        total_projects: projectsData.length,
        total_subcontractors: subcontractorsData.length,
        total_contract_value: projectsData.reduce(
          (sum, p) => sum + (Number(p.contract_value) || 0),
          0
        ),
        risk_count: 0
      }
    };

    const ruleSettings = await loadRuleSettings(license.id);
    const riskFlags = evaluateComplianceRules(extractedData, license, ruleSettings);
    extractedData.audit_summary.risk_count = riskFlags.raw_flags?.length || 0;

    const complianceLog = {
      license_id: license.id,
      source_type: 'PWA_FORM',
      source_channel: 'PWA',
      raw_payload: notes || '[PWA form submission]',
      call_timestamp: new Date().toISOString(),
      extracted_data: extractedData,
      risk_flags: riskFlags,
      compliance_month: getComplianceMonth(new Date()),
      created_at: new Date().toISOString()
    };

    const { data: log, error: logError } = await supabase
      .from('compliance_logs')
      .insert([complianceLog])
      .select();

    if (logError) {
      console.error('Failed to store compliance log:', logError);
      return res.status(500).json({ error: 'Failed to store log', details: logError.message });
    }

    for (const project of projectsData) {
      await upsertProject(license.id, project);
    }
    for (const sub of subcontractorsData) {
      await upsertSubcontractor(license.id, sub);
    }

    if (riskFlags.critical_flags?.length > 0) {
      await notifyRMO(license, riskFlags, { logId: log[0].id });
    }

    return res.status(200).json({
      success: true,
      logId: log[0].id,
      risk_count: riskFlags.raw_flags ? riskFlags.raw_flags.length : 0,
      flagged: riskFlags.flagged,
      file_urls: fileUrls,
      message: 'Report submitted successfully'
    });
  } catch (error) {
    console.error('Form submission error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ============================================================================
// ENDPOINT: Edit compliance log (operator corrections) — trusted proxy only
// ============================================================================

app.patch('/api/compliance-logs/:id', async (req, res) => {
  try {
    if (!verifyRetellWebhook(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Server misconfigured', missing: missingEnv });
    }

    const logId = req.params.id;
    const { extracted_data: incomingExtracted, notes } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('compliance_logs')
      .select('*, licenses(*)')
      .eq('id', logId)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const license = existing.licenses;
    if (!license) {
      return res.status(404).json({ error: 'License not found for log' });
    }

    const prev = existing.extracted_data || {};
    const nextExtracted = {
      ...prev,
      ...(incomingExtracted && typeof incomingExtracted === 'object' ? incomingExtracted : {})
    };

    if (typeof notes === 'string') {
      nextExtracted.notes = notes;
    }

    if (Array.isArray(nextExtracted.projects)) {
      nextExtracted.projects = nextExtracted.projects.map((p) => ({
        ...p,
        contract_value:
          p.contract_value === '' || p.contract_value == null ? null : Number(p.contract_value),
        trades: Array.isArray(p.trades)
          ? p.trades
          : String(p.trades || '')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
      }));
    }

    if (Array.isArray(nextExtracted.subcontractors)) {
      nextExtracted.subcontractors = nextExtracted.subcontractors.map((s) => ({
        ...s,
        company_name: s.company_name || s.company,
        cslb_license_number: s.cslb_license_number || s.cslbLicense || null,
        coi_expiration_date: s.coi_expiration_date || s.coiExpiration || null,
        cslb_verified: s.cslb_verified === true
      }));
    }

    if (nextExtracted.crew_status) {
      nextExtracted.crew_status = {
        has_direct_employees: Boolean(nextExtracted.crew_status.has_direct_employees),
        employee_count: nextExtracted.crew_status.employee_count ?? null,
        raw_statement:
          nextExtracted.crew_status.raw_statement ||
          (nextExtracted.crew_status.has_direct_employees
            ? 'Operator reported direct employees/hired crew'
            : 'No direct employees — everything subcontractors')
      };
    }

    if (Array.isArray(nextExtracted.projects)) {
      nextExtracted.permits = nextExtracted.projects.map((p) => ({
        project_address: p.address,
        permit_number: p.permit_number || null,
        permit_status: p.permit_number ? 'Submitted' : 'Not filed'
      }));
    }

    const ruleSettings = await loadRuleSettings(license.id);
    const riskFlags = evaluateComplianceRules(nextExtracted, license, ruleSettings);
    if (!nextExtracted.audit_summary) nextExtracted.audit_summary = {};
    nextExtracted.audit_summary.risk_count = riskFlags.raw_flags?.length || 0;
    nextExtracted.audit_summary.edited_at = new Date().toISOString();

    const updates = {
      extracted_data: nextExtracted,
      risk_flags: riskFlags,
      updated_at: new Date().toISOString(),
      raw_payload:
        typeof notes === 'string' && notes.trim() ? notes : existing.raw_payload
    };

    const { data: log, error: updateError } = await supabase
      .from('compliance_logs')
      .update(updates)
      .eq('id', logId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update compliance log:', updateError);
      return res.status(500).json({ error: 'Failed to update log', details: updateError.message });
    }

    if (Array.isArray(nextExtracted.projects)) {
      for (const project of nextExtracted.projects) {
        await upsertProject(license.id, project);
      }
    }
    if (Array.isArray(nextExtracted.subcontractors)) {
      for (const sub of nextExtracted.subcontractors) {
        await upsertSubcontractor(license.id, sub);
      }
    }

    return res.status(200).json({
      success: true,
      log,
      risk_count: riskFlags.raw_flags?.length || 0,
      flagged: riskFlags.flagged,
      message: 'Report updated'
    });
  } catch (error) {
    console.error('Compliance log edit error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configured: {
      supabase: Boolean(supabase),
      anthropic: Boolean(anthropic),
      retell_webhook_auth: Boolean(getWebhookSecret()),
      storage_bucket: STORAGE_BUCKET
    },
    missing_env: missingEnv
  });
});

// ============================================================================
// START SERVER (Local/dev) or Export (Vercel serverless)
// ============================================================================

const PORT = process.env.PORT || 3001;
const isVercel = Boolean(process.env.VERCEL);

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`Vanguard backend listening on port ${PORT}`);
  });
}


// ============================================================================
// DIGEST: Morning summary + low-involvement alerts
// ============================================================================
app.post('/api/jobs/digests', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET || process.env.DIGEST_SECRET;
    if (secret && req.headers['x-cron-secret'] !== secret && req.query.secret !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const { data: licenses, error } = await supabase.from('licenses').select('*');
    if (error) throw error;

    const results = [];
    for (const license of licenses || []) {
      const settings = await loadRuleSettings(license.id);
      const contacts = await resolveRmoContacts(license);
      // Prefer settings, then membership contacts — each hop is allowlist/blocklist filtered
      const alertEmail =
        filterAlertEmails(settings.alert_email || null)[0] || contacts.emails[0] || null;
      const alertPhone =
        filterAlertPhones(settings.alert_phone || null)[0] || contacts.phones[0] || null;
      if (!alertEmail && !alertPhone) continue;

      const sinceIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: logs }, { data: activities }] = await Promise.all([
        supabase
          .from('compliance_logs')
          .select('id, flagged, created_at, risk_flags, rmo_reviewed')
          .eq('license_id', license.id)
          .gte('created_at', sinceIso),
        supabase
          .from('supervision_activities')
          .select('id, activity_type, occurred_at')
          .eq('license_id', license.id)
          .gte('occurred_at', sinceIso)
      ]);

      const openFlags = (logs || []).filter((l) => l.flagged && !l.rmo_reviewed).length;
      const visits = (activities || []).filter((a) =>
        String(a.activity_type || '').toUpperCase().includes('VISIT')
      ).length;
      const decisions = (activities || []).filter((a) =>
        String(a.activity_type || '').toUpperCase().includes('DECISION')
      ).length;
      const reviews = (logs || []).filter((l) => l.rmo_reviewed).length;
      const lastActivity = (activities || [])
        .map((a) => a.occurred_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;
      const lastLog = (logs || [])
        .map((l) => l.created_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;
      const lastTouch = [lastActivity, lastLog].filter(Boolean).sort().reverse()[0] || null;
      const daysSince = lastTouch
        ? Math.floor((now.getTime() - new Date(lastTouch).getTime()) / 86400000)
        : 999;
      const lowInvolvement = daysSince >= Number(settings.low_involvement_days || 14);

      const lines = [
        `License ${license.license_number} — ${license.entity_name || 'company'}`,
        `Open flagged logs (30d): ${openFlags}`,
        `Site visits (30d): ${visits}`,
        `Decisions (30d): ${decisions}`,
        `Reviews (30d): ${reviews}`,
        `Last involvement: ${lastTouch || 'none on record'} (${daysSince} days)`,
        lowInvolvement
          ? `LOW INVOLVEMENT: no visits/decisions/reviews for ${settings.low_involvement_days} days`
          : 'Involvement within threshold'
      ];
      const body = lines.join('\n');

      let deliveredEmail = false;
      let deliveredSms = false;

      if (settings.digest_enabled !== false) {
        if (alertEmail) {
          const emailResult = await sendEmailAlert({
            to: [alertEmail],
            subject: `[RMO Digest] ${license.license_number}`,
            text: body
          });
          deliveredEmail = Boolean(emailResult?.ok);
          if (emailResult?.skipped) console.log('DIGEST email skipped:', emailResult.reason, body);
        }
        if (alertPhone) {
          const smsResult = await sendSmsAlert({ to: [alertPhone], body: body.slice(0, 300) });
          deliveredSms = Boolean(smsResult?.ok);
          if (smsResult?.skipped) console.log('DIGEST SMS skipped:', smsResult.reason);
        }
        await supabase.from('digest_runs').insert([
          {
            license_id: license.id,
            kind: 'MORNING',
            payload: { openFlags, visits, decisions, reviews, daysSince, lowInvolvement },
            delivered_email: deliveredEmail,
            delivered_sms: deliveredSms
          }
        ]);
      }

      if (settings.digest_enabled !== false && lowInvolvement) {
        const alertBody = `LOW INVOLVEMENT alert for ${license.license_number}: ${daysSince} days since last visit/decision/review (threshold ${settings.low_involvement_days}).`;
        if (alertEmail) {
          await sendEmailAlert({
            to: [alertEmail],
            subject: `[RMO] Low involvement — ${license.license_number}`,
            text: alertBody
          });
        }
        if (alertPhone) {
          await sendSmsAlert({ to: [alertPhone], body: alertBody });
        }
        await supabase.from('digest_runs').insert([
          {
            license_id: license.id,
            kind: 'LOW_INVOLVEMENT',
            payload: { daysSince, threshold: settings.low_involvement_days },
            delivered_email: Boolean(alertEmail),
            delivered_sms: Boolean(alertPhone)
          }
        ]);
      }

      results.push({
        license_id: license.id,
        license_number: license.license_number,
        openFlags,
        visits,
        decisions,
        daysSince,
        lowInvolvement
      });
    }

    return res.json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error('digest job failed', err);
    return res.status(500).json({ error: err.message || 'Digest failed' });
  }
});


module.exports = app;
