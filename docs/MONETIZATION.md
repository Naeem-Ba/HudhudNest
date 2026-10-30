# Monetization and ads (HudhudNest)

Status: **technical layer built, every ad switched off.** Nothing in this repository requests a real ad, and nothing
here proves that Google will accept the website, the app or the owner's publisher account.

## 1. Eligibility and policy audit (read 2026-10-29)

What was checked, and how sure it is. Google's help pages change; re-read them before activation.

| Question | Finding | Confidence |
| --- | --- | --- |
| Is Syria a sanctioned place for Google ads products? | Google states that in August 2025 Syria was removed from the US OFAC list and that its Google Ads legal-requirements and country-restriction pages would be updated ([Google Ads policy notice](https://support.google.com/adspolicy/answer/16489352)). That notice covers **Google Ads only**. | Read directly. |
| Does AdSense / AdMob list Syria as unavailable? | The AdSense page ([6167308](https://support.google.com/adsense/answer/6167308)) and the AdMob page ([6163675](https://support.google.com/admob/answer/6163675)) did not list Syria as restricted when read (AdMob names Crimea, Cuba, the so-called DNR/LNR, Iran, North Korea). Both say Google must follow OFAC sanctions, and AdMob says sign-in is not possible while physically in an embargoed place. | The pages were read through a summariser, not screenshotted. **Unconfirmed in the console.** |
| Who must be eligible? | The **publisher account owner**: the person or company that signs the contract, the address and tax details on the account, and the bank that receives payments. Not the visitors, and not the country where a listing is. The owner told us earlier he lives in Germany; Germany is a mainstream AdSense/AdMob country, but this audit did **not** read Google's list of supported payment countries. | Needs the owner's own check in AdSense/AdMob sign-up. |
| Is the website approved by AdSense? | Unknown. Approval is Google's decision after review (original content, privacy policy, navigation, enough pages). A marketplace of user-written listings may be judged thin or duplicate. | Unknown until applied. |
| Is the app approved by AdMob? | Unknown. AdMob needs the app added to the account, normally with a store listing (Play / App Store), and `app-ads.txt` on the developer website is recommended. | Unknown until applied. |
| EEA / UK / Switzerland users | Google requires a **Google-certified CMP integrated with IAB TCF** for personalised ads there (since 16 Jan 2024 EEA/UK, 31 Jul 2024 Switzerland); traffic from a non-certified CMP may still get non-personalised ads ([Google](https://support.google.com/adsense/answer/13554116)). | Read directly. |
| Payments / tax | Requires real identity, address, tax form and bank details. Do not enter a different country or address to get around a restriction; Google can freeze the account and withhold earnings. | Policy principle. |

**Rule for everyone working on this:** never advise using a false country, address, payment detail or a
VPN to pass sign-up or to receive money. If the owner's account is not accepted, the platform simply keeps
running without ads.

### What can be done now / what needs whom

| Done in this repo | Needs a Google account or approval | Needs an owner decision | Stays off until then |
| --- | --- | --- | --- |
| Central ads layer, two placements, web consent choice, native UMP flow, tests, test-ids dev mode | AdSense site approval; AdMob app registered and approved; real ad units | Which entity receives the money; certified CMP (Google "Privacy & messaging") for the website; updated privacy text | `ADS_ENABLED` and the three platform flags, real publisher/unit ids, the production AdMob app ids |

## 2. How it is built

Everything lives in `src/app/core/ads/`. Page code only contains `<app-ad-slot placement="…">`.

| Piece | Role |
| --- | --- |
| `ads.model.ts` | Types, id patterns, Google's sample test ids, the route allow-list per placement. |
| `ads-policy.ts` | `evaluateAdEligibility()`: the single yes/no. Layers: master switch, platform switch, allowed page, ids, no earlier load failure, network, consent. |
| `ads-config.service.ts` | Reads `environment.ads`; validates id formats; test-unit fallback **only** in a local dev build; rejects Google test units in staging/production. |
| `ads-consent.service.ts` | Web: explicit opt-in kept on the device (unknown = no ad). Native: mirrors Google UMP `canRequestAds`. |
| `adsense-loader.service.ts` | Loads the AdSense script once per page lifetime; resolves `false` on error/timeout. |
| `admob.gateway.ts` | Dynamic import of `@capacitor-community/admob`; the only file that touches the plugin. |
| `ads.service.ts` | Facade: decisions, one-time start-up, banner show/hide, ad-choices entry. Never throws into the page. |
| `ad-slot.component.ts` | The labelled slot. Renders nothing unless allowed; reserves space; one `<ins>` per allowed state. |
| `ads-consent-banner.component.ts` | Web choice panel, present only when web ads are on and no choice exists. |
| `ads-metrics.service.ts` | In-memory counters, no persistence, no network. |

Separation of concerns requested in the brief:

1. Publisher eligibility is **not** code. It is the owner's account state; the code cannot know it, so the
   master switch stays off until the owner flips it.
2. Runtime enablement = `ADS_ENABLED` + one platform flag.
3. Consent = `AdsConsentService`.
4. Ad availability = AdSense `data-ad-status` (unfilled collapses the slot) / AdMob load events.
5. Per-platform settings = separate flags and ids.

### Placements (v1)

* `search-results`: one slot after the 10th card on `/properties`. Order of listings is untouched; the slot is not part of the list data or the view counter.
* `property-detail`: one slot at the end of the left column, after photos, price, details, amenities and reviews. Contact, message, favourite, share and report controls are in the page header/hero, not covered.
* Never rendered on: auth, listing create/edit, messages, checkout/pricing, services, account/settings, admin, short-stay, investments (enforced by the allow-list in `PLACEMENT_ROUTES`, tested).
* No interstitials, no video, no rewarded ads, no app-open ads.

### Native limitation (important)

`@capacitor-community/admob` draws **overlay** banners (a native view above the WebView), not banners inside
the page. The slot reserves a placeholder in the page and shows the overlay (bottom, adaptive) only while that
placeholder is on screen. This is acceptable for v1 but is **not device-tested** here; true in-page native ads
would need a different plugin or native code. AdSense code must not be used inside the app's WebView.

## 3. Configuration

Build-time variables (Netlify / Codemagic / local shell), read by `tools/generate-env.mjs`:

| Variable | Meaning | Default |
| --- | --- | --- |
| `ADS_ENABLED` | Master switch, exact string `true` | off |
| `WEB_ADS_ENABLED`, `ANDROID_ADS_ENABLED`, `IOS_ADS_ENABLED` | Per-platform switches | off |
| `ADSENSE_PUBLISHER_ID` | `ca-pub-…` (public id, not a secret) | empty |
| `ADSENSE_SLOT_SEARCH`, `ADSENSE_SLOT_DETAIL` | AdSense ad unit ids | empty |
| `ADMOB_BANNER_ANDROID`, `ADMOB_BANNER_IOS` | AdMob banner unit ids `ca-app-pub-…/…` | empty (local dev build uses Google test units) |

Test vs production:

* Local dev (`npm run start:local`): native uses Google's official sample banner units automatically; web
  adds `data-adtest="on"`. Dev specs never load the real script (the loader is faked).
* Staging and production never fall back to test units; a Google test unit configured there is rejected.
* The AdMob **app** ids are mandatory in the native files (the SDK crashes the app at launch without them) and
  currently hold Google's **sample** ids:
  `android/app/src/main/res/values/strings.xml` (`admob_app_id`) and `ios/App/App/Info.plist`
  (`GADApplicationIdentifier`). `tools/lib/ads-ids-guard.test.mjs` fails on any other committed id, so replacing
  them with the real ids is a deliberate step: update the guard's expectation in the same change.

## 4. Before enabling anything real (checklist)

1. Owner decides which person/entity receives payments and checks eligibility in AdSense and AdMob sign-up with real details.
2. Website: apply in AdSense, wait for approval, add `ads.txt`; create two ad units.
3. EEA/UK/CH traffic: set up Google's certified CMP ("Privacy & messaging") and replace the built-in choice panel, or accept that those visitors only get non-personalised ads, which the layer already requests.
4. App: add the app in AdMob after it is in a store, create the banner units, replace the two sample app ids, add `app-ads.txt`, configure the UMP message (and the ATT message for iOS) in AdMob.
5. Privacy policy (ar/en/de) and cookie text: currently they say "no advertising cookies or trackers", which is true **only while ads are off**. Update them in the same release that enables ads (draft wording: ads are shown by Google, may use cookies/device identifiers, non-personalised by default, how to change the choice, Google's own privacy policy link).
6. CSP is report-only. Before enforcing it, allow Google's ad hosts: script `pagead2.googlesyndication.com`, `partner.googleadservices.com`, `tpc.googlesyndication.com`; frame `googleads.g.doubleclick.net`, `tpc.googlesyndication.com`; connect `pagead2.googlesyndication.com`; images `https:`.
7. Ship a new Android build / iOS build (native plugin added: new AAB required, `native-changes` will run the iOS job).
8. Turn flags on one platform at a time in staging first; watch the console for `[ads]` codes.

## 5. Rollback

Set `ADS_ENABLED` to anything but `true` (or remove it) and redeploy: every slot disappears, no ad request or
script load happens, the consent panel disappears. Native: the same flag in the next build; the old build keeps
its flag until updated, so keep `ANDROID_ADS_ENABLED` off in the release that first contains the plugin.
Nothing else in the platform depends on ads.

## 6. Measurement

Revenue, impressions, RPM (web) and eCPM (app) come from AdSense/AdMob reports. Do not recompute them and do
not add them to subscription, promotion or service revenue. `AdsMetricsService` counts requests/fills/failures in
memory only; a page view of a listing is a different event from an ad impression. Page-speed and bounce impact
must be compared before/after in staging with real tools; no numbers are assumed here.
