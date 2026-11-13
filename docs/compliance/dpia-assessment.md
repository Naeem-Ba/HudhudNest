# DPIA screening and privacy-by-design review (2026-11-13)

This is a screening, not a full DPIA. A full DPIA (Art. 35) is likely **not** mandatory on current processing (no
special-category data at scale, no systematic monitoring of public areas, no automated decisions with legal effect), but
two factors push towards doing one before scale: a large public marketplace with location data, and transfers to many
third-country providers. **Requires Legal Review.**

## Risks and controls

| Risk | Likelihood / impact | Controls in place | Residual / to do |
|---|---|---|---|
| Exposure of exact property location | Medium / medium | "Hide exact location" per listing | Default is exact; consider defaulting to approximate for private sellers |
| Photos showing people, documents, plates | Medium / medium | Upload guidance in privacy §6, report button | No automated detection |
| Account takeover | Medium / high | Hashed passwords, HIBP k-anonymity check, OTP hashed, rate limits, sign-in alerts | MFA optional only |
| Scraping of contact data | Medium / medium | Contact shown only as advertisers choose; social posts carry no contact | No anti-scraping beyond rate limits |
| Marketing without consent | Low / high | Double opt-in, sender refuses unconfirmed, suppression hash | Any new sender must use `IMarketingEmailSender` |
| Retention creep | Medium / medium | Scheduled jobs for auth, audit, contact, leads, newsletter | Waitlist SQL not applied; backups 12 months |
| Third-country transfers | High / medium | Few data per provider | Mechanisms unverified (Blocking Launch) |
| Device storage without consent (EU) | Was high / low | Measurement consent gating | Ads module needs certified CMP before EU monetisation |
| Logs containing PII | Low / medium | Newsletter code logs no address/token; existing scrubbing in error reports | Provider logs keep IPs (provider retention) |

## Procedures (scoped, owner to adopt)

- **Data subject requests**: privacy@ inbox; verify via the account or the registered e-mail; answer within one month;
  log the request (date, type, outcome) in a private register. Self-service export and deletion cover most requests.
- **Breach response**: contain; assess risk within 24 h; if GDPR applies and risk is not unlikely, notify the competent
  authority within 72 h (Art. 33) and affected people without undue delay if high risk (Art. 34); record every breach.
  Contact point: security@. **Planned** (no written runbook beyond this paragraph).
- **Processor contracts (DPAs)**: see transfers register. **Blocking Launch.**
- **Legal holds**: admin endpoint; reasons minimal; release when the matter ends.
