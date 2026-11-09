# Fix pack B

- [ ] 1. Demo passcode gate (DEMO_PASSCODE cookie, 401 on server fns + agent route), per-IP rate limit (20 agent runs/10 min, friendly 429), body/description caps, README note
- [ ] 2. Cron routes /api/public/cron/proactive-scan + /api/public/cron/check-followups (authenticateCronRequest), schedules 6h/1h, dashboard Last/Next scan, retain alerts as kind:risk_alert + "Was this alert useful?" feedback
- [ ] 3. Vitest tests: parseJson, agent repair/fallback, do_not_repeat from failed memory, recall fallback on 500 + 429 retry, retain local mirror when Hindsight down, memoryLab upTo filter
- [ ] 4. eslint --fix + prettier; replace `any` in src/lib/foreman/** with zod-typed schemas; remove dead code
- [ ] 5. Seed check: (a) ≥3 vibration-after-lubricant incidents, (b) fix failed twice then held, (c) sibling-machine pattern — add migration if missing
