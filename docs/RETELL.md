# Retell AI integration

## What the RMO app uses today

Inbound voice check-ins only:

| Direction | Path | Purpose |
|-----------|------|---------|
| Retell → us | `POST /api/webhooks/retell` on the Express backend | `call_ended` → Claude extract → compliance log |
| Us → Retell | none in production code | We do **not** create/publish agents via API from this repo |

Auth for the webhook: `Authorization: Bearer <RETELL_WEBHOOK_SECRET>` or `x-retell-signature` (see [AUTH.md](./AUTH.md)).

Operator dial-in (pilot): `+1 (916) 848-5224`

## Deprecation: legacy publish endpoints (Retell notice 2026-07-20)

Retell deprecated:

- `POST /publish-agent/{agent_id}`
- `POST /publish-chat-agent/{agent_id}`

Replacement (unified):

- `POST /publish-agent-version/{agent_id}`

Guide: https://docs.retellai.com/deprecation-notice/2026/07-20_agent_version_endpoints  
API: https://docs.retellai.com/api-references/publish-agent

If you publish an agent draft with **curl** or a script, update the path. Example:

```bash
curl -X POST "https://api.retellai.com/publish-agent-version/AGENT_ID" \
  -H "Authorization: Bearer $RETELL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"version": 15, "version_title": "Prod", "version_description": "optional note"}'
```

Or use the dashboard **Publish** control / current Retell SDK (`client.agent.publish(agentId, { version })`), which targets the new endpoint.

A Retell email that cites `Client(curl): POST /publish-agent/...` means something outside this app (a local curl, Postman, or old script) hit the legacy path — not the Vercel webhook integration.
