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
    const riskFlags = evaluateComplianceRules(extractedData, license, operator);

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
      await notifyRMO(license, riskFlags);
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

// ============================================================================
// RULE ENGINE: Evaluate Compliance Flags
// ============================================================================

function evaluateComplianceRules(extractedData, license) {
  const flags = {
    critical_flags: [],
    warning_flags: [],
    raw_flags: []
  };

  // FLAG 1: Workers' Comp Violation
  if (
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

  // FLAG 2: Contract Threshold Exceeded ($10k+)
  if (Array.isArray(extractedData.projects)) {
    for (const project of extractedData.projects) {
      if (project.contract_value && Number(project.contract_value) > 10000) {
        flags.warning_flags.push('THRESHOLD_EXCEEDED');
        flags.raw_flags.push({
          flag: 'THRESHOLD_EXCEEDED',
          reason: `Contract value $${project.contract_value} exceeds $10,000 threshold`,
          severity: 'HIGH',
          address: project.address
        });
      }
    }
  }

  // FLAG 3: Unverified Subcontractors
  if (Array.isArray(extractedData.subcontractors)) {
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
  if (Array.isArray(extractedData.subcontractors)) {
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

  // FLAG 5: Scope Mismatch (B-General requires framing or 3+ unrelated trades)
  if (license.classification === 'B - GENERAL BUILDING' && Array.isArray(extractedData.projects)) {
    for (const project of extractedData.projects) {
      const trades = project.trades || [];
      const hasFraming = trades.some(
        (t) =>
          String(t).toLowerCase().includes('frame') ||
          String(t).toLowerCase().includes('structural')
      );
      const uniqueTrades = new Set(trades).size;

      if (trades.length > 0 && !hasFraming && uniqueTrades < 3) {
        flags.warning_flags.push('SCOPE_MISMATCH');
        flags.raw_flags.push({
          flag: 'SCOPE_MISMATCH',
          reason: `B-General requires framing OR 3+ unrelated trades. Found: ${trades.join(', ')}`,
          severity: 'MEDIUM',
          address: project.address,
          trades
        });
      }
    }
  }

  // FLAG 6: Missing permit on $10k+ jobs
  if (Array.isArray(extractedData.projects)) {
    const permits = Array.isArray(extractedData.permits) ? extractedData.permits : [];
    for (const project of extractedData.projects) {
      if (project.contract_value && Number(project.contract_value) > 10000) {
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
            reason: `Contract value $${project.contract_value} exceeds $10,000 but no permit number was reported`,
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
// NOTIFICATION: Alert RMO to Critical Flags
// ============================================================================

async function notifyRMO(license, riskFlags) {
  // TODO: Implement via email (SendGrid) or Twilio SMS
  console.log(`ALERT: Critical flags for ${license.entity_name} (${license.license_number})`);
  console.log('Flags:', riskFlags.critical_flags);
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

    const riskFlags = evaluateComplianceRules(extractedData, license);
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
      await notifyRMO(license, riskFlags);
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

    const riskFlags = evaluateComplianceRules(nextExtracted, license);
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

module.exports = app;
