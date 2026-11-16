# Record of processing activities (Art. 30 GDPR style), 2026-11-13

Controller: the operator trading as HudhudNest (legal identity pending, see `impressum-requirements.md`), contact
privacy@hudhudnest.com. No DPO or EU representative appointed. Recipients and transfers: see
`international-data-transfers.md`. Retention: see `data-retention-policy.md`. Security measures: privacy policy §16 and
`dpia-assessment.md`. Bases are given where the GDPR applies (Requires Legal Review per market).

| # | Activity | Data subjects | Data | Purpose | Basis | Recipients | Retention |
|---|---|---|---|---|---|---|---|
| 1 | Accounts and sign-in | Users | Name, e-mail/phone, password hash, social ids, sessions, IP | Provide the account | 6(1)(b); IP: 6(1)(f) | Supabase, Render, Resend, SMS/OTP providers, Google/Apple | Account life; tokens 30 d; IP 90 d |
| 2 | Listings | Advertisers, public | Property data, photos, location, contact chosen | Publish listings | 6(1)(b) | Public, Cloudinary, search engines | Lifecycle + 30 d |
| 3 | Republishing on own social channels | Advertisers | Public listing content | Promotion | 6(1)(f) | Telegram, Meta | Per platform |
| 4 | Messages, bookings, viewings, reviews | Users | Content, dates | Marketplace features | 6(1)(b) | Other party | Account life; anonymised after deletion |
| 5 | Valuation requests | Users, offices | Contact, property data | Valuation | 6(1)(a) for sharing | Chosen office | Account life |
| 6 | Security and abuse prevention | Users, visitors | IP, sign-in events, rate-limit data | Security | 6(1)(f) | Render | 90/365 d |
| 7 | Consent evidence | Users | Policy version, time, source, language, method | Prove acceptance | 6(1)(c)/(f) | None | Account life + limitation |
| 8 | Newsletter | Subscribers | E-mail, language, consent events | Marketing e-mail | 6(1)(a) | Resend | While subscribed; evidence 3 y; hash |
| 9 | Waitlist | Prospects | E-mail or WhatsApp, interest, language, consent time | Launch notice | 6(1)(a) | Supabase | ≤ 12 months (SQL pending) |
| 10 | Contact form, old interest form | Anyone | Name, e-mail, message; legacy phone/city | Answer requests | 6(1)(b)/(f) | Render/Supabase | 12/24 months; leads 12 months |
| 11 | First-party measurement | Visitors | Random visitor id (hashed server-side), UTM tags, invitation code | Count views, attribute links | 6(1)(f); storage: consent where required | None | View events 90 d |
| 12 | App error reports | Users | Error type, page, scrubbed message | Fix faults | 6(1)(f) | Own server | Short (aggregate) |
| 13 | Push notifications | Users who enable | Push token | Notifications | 6(1)(a) | FCM, APNs | Until disabled |
| 14 | Account deletion and export | Users | Account data | Rights handling | 6(1)(c) | None | Audit of the action 365 d |
| 15 | Legal holds | Users in a dispute | Account id, reason | Preserve evidence | 6(1)(c)/(f) | None | Until released |
| 16 | Backups | All | Full encrypted dump | Recovery | 6(1)(f) | Backup storage (unnamed) | 12 months rotation |
