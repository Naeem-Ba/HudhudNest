# International data transfer register (2026-11-13)

Nothing in this register has been verified against a signed contract, a provider dashboard or an account setting. No DPA,
SCC or TIA is claimed. "Unknown" means it was not found in the repositories; it does not mean absent. Exporter is the
operator trading as HudhudNest (legal entity not yet identified, see `impressum-requirements.md`), established in Syria.

Why this matters: where the GDPR applies (EU/EEA users if the service targets them, Art. 3(2)), a transfer to a third
country needs an adequacy decision or Art. 46 safeguards (SCCs + TIA). Syria has no adequacy decision; the exporter
itself sits outside the EU, so the SCC module (3 or 4, or controller-to-processor where the importer is the processor)
must be chosen by a lawyer. KVKK Art. 9 applies the same way for Türkiye if targeted.

| Provider | Data | Purpose | Exporting | Importing | Region | Sub-processors | Mechanism | DPA | SCC | TIA | Safeguards | Verification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Supabase | Whole application database (accounts, listings, messages, consents, newsletter), waitlist | Database hosting | Operator | Supabase Inc. (US) | Unknown (project region not in repo) | AWS (per Supabase docs; unverified) | Unknown | Unknown | Unknown | None | TLS; at-rest encryption (provider default, unverified); phone numbers encrypted by the app | **Blocking Launch**: confirm project region and accept Supabase DPA |
| Render | All API traffic, logs with IP addresses | API hosting | Operator | Render Services Inc. (US) | Unknown (`render.yaml` has no region) | Cloud providers (unverified) | Unknown | Unknown | Unknown | None | TLS | **Blocking Launch** |
| Netlify | Web requests, edge function `/geo` (country only), access logs | Web hosting, CDN | Operator | Netlify Inc. (US) | Global CDN | Unknown | Unknown | Unknown | Unknown | None | TLS | **Blocking Launch** |
| Cloudinary | Profile and listing photos (may show people) | Image storage/delivery | Operator | Cloudinary Ltd. (US/IL) | Unknown | Unknown | Unknown | Unknown | Unknown | None | Public URLs by design | **Blocking Launch** |
| Resend | E-mail address, name, mail content (service mail, newsletter) | E-mail delivery | Operator | Resend (US) | Unknown | AWS SES (unverified) | Unknown | Unknown | Unknown | None | TLS | **Blocking Launch** |
| Twilio / D7 Networks / Unimatrix | Phone number, OTP text | SMS OTP | Operator | Each provider | Unknown | Carriers | Unknown | Unknown | Unknown | None | OTP hashed server-side | **Blocking Launch** for each one enabled in production |
| Meta (WhatsApp) | Phone number, OTP text | OTP delivery | Operator | Meta Platforms | Unknown | Unknown | Unknown | Unknown | Unknown | None | | Requires verification if enabled |
| Telegram | Phone/chat id, OTP; public listing posts | OTP delivery, channel posts | Operator | Telegram FZ-LLC (UAE) | Unknown | Unknown | Unknown | Unknown | Unknown | None | Posts carry no contact data | Requires verification |
| Meta (Facebook, Instagram) | Public listing content | Channel posts | Operator | Meta Platforms | n/a (public content) | | Public data | n/a | n/a | n/a | No contact data in posts | Requires Legal Review (licence to republish is in the terms) |
| Google (Sign-In, Identity Services script) | Name, e-mail, picture; browser data on sign-in pages | Social sign-in | Operator / user | Google LLC (US) | Global | | Unknown | Google terms | Unknown | None | Only if the user chooses it | Requires verification |
| Apple (Sign in with Apple, APNs) | Name/relay e-mail; push token | Sign-in, push | Operator | Apple Inc. (US) | Global | | Unknown | Apple terms | Unknown | None | Only if the user chooses it | Requires verification |
| Google Firebase Cloud Messaging | Push token, notification payload | Push | Operator | Google LLC (US) | Global | | Unknown | Firebase terms | Unknown | None | Only if enabled | Requires verification |
| OpenStreetMap Foundation (tiles) | IP address, viewed tile area | Map tiles (browser direct) | User's browser | OSMF (UK) | UK (adequacy for UK exists from the EU side) | Fastly CDN | Browser request | n/a | n/a | n/a | No account data | Requires Legal Review (consider self-hosted tiles) |
| Have I Been Pwned | First 5 hex chars of a SHA-1 hash | Breached-password check | Operator | HIBP / Cloudflare | Global | Cloudflare | k-anonymity, no personal data | n/a | n/a | n/a | No password or e-mail leaves | Implemented (low risk) |
| DeepL (off by default) | Public listing text | Translation | Operator | DeepL SE (DE) | EU | | Would need DPA | Unknown | n/a | n/a | Public text only | Planned (off) |
| Nominatim (off by default) | Address strings | Geocoding | Operator | OSMF | UK | | | | | | | Planned (off) |
| Backup storage (S3-compatible) | Full encrypted database dumps | Backups | Operator | Unknown provider | Unknown | Unknown | Unknown | Unknown | Unknown | None | Encrypted before upload | **Blocking Launch**: name the provider and region |

## What the owner must do

1. In each provider dashboard, note the project/data region and the plan (several are likely free plans).
2. Accept or download each provider's DPA where offered (Supabase, Render, Netlify, Cloudinary, Resend, Twilio).
3. With a lawyer: decide which SCC module applies with a non-EU exporter, and whether a TIA is needed for each US provider
   (the EU–US Data Privacy Framework only covers certified US companies and only transfers from the EU).
4. Record the result in this table and only then change the privacy policy §14 wording from "being verified".
