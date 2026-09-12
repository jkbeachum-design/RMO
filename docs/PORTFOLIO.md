# Firm portfolio & CSLB clocks

Backlog **#7**: multi-firm portfolio under California B&P **§7068.1** / **§7068.2**.

## Migration

Apply `supabase/migrations/004_firm_portfolio_clocks.sql`.

## Rules

| Rule | Behavior |
|------|----------|
| §7068.1 max 3 / one-year | Rolling 365-day count of association start dates |
| Eligibility | PRIMARY, OWNERSHIP_20, SUBSIDIARY_JV, SAME_OFFICERS, OTHER |
| §7068.2 clocks | Disassociate starts notify + replace deadlines at +90 days |

## UI / API

- `/dashboard/portfolio`
- `GET/POST /api/portfolio` (RMO + membership scoped)

## Verify

```bash
node --experimental-strip-types --test tests/portfolio.test.mjs
```

1. Apply migration 004  
2. RMO → Portfolio → see usage meters  
3. Disassociate → clocks appear  
4. 4th association in window → blocked  
