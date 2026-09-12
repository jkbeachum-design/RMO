# Audit defense export

Priority **#8**: multi-page PDF + ZIP evidence package.

## Surfaces

- UI: `/dashboard/export`
- API: `GET /api/audit/export?license_number=&from=&to=` (RMO + membership)

## Package contents

**PDF pages**

1. Cover / company + duty snapshot  
2. Summary counts  
3. Supervision / site involvement  
4. Compliance reports & risk flags  
5. RMO acknowledgements / decisions  
6. Projects  

**ZIP**

- `audit-defense.pdf`
- `manifest.json` (full package)
- `supervision.json`, `acknowledgements.json`, `projects.json`, `compliance_logs.json`
- `transcripts/<logId>.txt` when raw transcript present
- `summary.txt`

## Verify

1. Sign in as RMO → Export  
2. Select company + date range → Build  
3. Download PDF (multiple pages) and ZIP  
4. Confirm only membership companies appear  
