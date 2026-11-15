# Shipping Gather to the App Store and Google Play

Gather uses Expo's continuous native generation — there are no `ios/` or `android/` folders to maintain; native config lives in `app.json` and config plugins. Builds run in the cloud with **EAS**.

## 1. Accounts you'll need

- Apple Developer Program ($99/yr) and Google Play Console ($25 one-time)
- An Expo account (`npx eas-cli@latest login`)
- A production Supabase project (separate from development)
- Anthropic API key and (optionally) Google Maps Platform key with Places API (New), both with billing alerts and quotas

## 2. Configure the app

- `app.json`: confirm `name`, `slug`, `scheme` (`gather`), `ios.bundleIdentifier` and `android.package` (currently `app.gather.mobile` — change to a domain you own), version, icons and splash.
- Permission strings are already set for photos and location (used only on request).
- Set production env vars as EAS environment variables (only the two `EXPO_PUBLIC_SUPABASE_*` values belong in the app):

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_REF.supabase.co
```

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY
```

## 3. Backend for production

```bash
npx supabase link --project-ref YOUR_PROD_REF
```

```bash
npx supabase db push
```

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

```bash
npx supabase functions deploy ai-plan places delete-account
```

Then: custom SMTP for auth emails, redirect URLs (`gather://**`), `pg_cron` for plan reminders, database backups/PITR, and alerts on Edge Function errors and AI spend.

## 4. Build and test

```bash
npx eas-cli@latest build --profile development --platform all
```

Install the development build on devices for testing (Expo Go can't run custom native config in production form). Then a store build:

```bash
npx eas-cli@latest build --profile production --platform all
```

```bash
npx eas-cli@latest submit --profile production --platform all
```

Use TestFlight and Play internal testing tracks before a public release. Ship JS-only fixes with `npx eas-cli@latest update --channel production`.

## 5. Store requirements checklist

- **Privacy policy URL** and **terms of service**.
- **Account deletion in-app** — implemented (Profile → Account → Delete account). Apple and Google both require it.
- **App Privacy / Data Safety forms**: declare email, username, photos, user content (messages), approximate location (optional, not stored), preferences, and that chat content is sent to an AI processor (Anthropic) for the feature. Don't declare tracking unless you add it.
- **Age rating**: social apps with user-generated content and chat are typically 12+/Teen. Sign-up requires users to confirm they're 13+. If you target under-13s, COPPA and Apple's Kids category rules apply (not supported by this design).
- **User-generated content (Apple 1.2)**: requires a way to block users (done), report content and users (to build), and a moderation process with timely response (to build — add a `reports` table, admin review tool and contact email).
- **AI disclosure**: label AI-generated content (done: "Gather AI" badges) and keep demo data clearly marked.
- Encryption export compliance: `ITSAppUsesNonExemptEncryption` is set to `false` (standard HTTPS only).

## 6. Subscriptions

Payments are intentionally not implemented. When you're ready:

1. Create the subscription products in App Store Connect and Play Console (e.g. `gather_plus_monthly`).
2. Use a store-billing SDK (RevenueCat's `react-native-purchases` is the common choice with Expo) — digital subscriptions **must** use in-app purchase on iOS/Android.
3. Add a webhook Edge Function that verifies the provider's signature and updates `subscription_status` (`tier`, `status`, `current_period_end`, `provider`) using the service role. Clients can't write that table (tested).
4. Replace the waitlist button on `premium.tsx` with the purchase flow; add restore-purchases and manage-subscription links.
5. Gate features through `src/features/premium/features.ts` and keep server limits (`AI_DAILY_LIMIT_*`) as the source of truth.

## 7. Push notifications (next phase)

Add `expo-notifications`, request permission after the user has seen value (e.g. after joining a group), store the Expo push token in `notification_settings.push_token`, and send from a database webhook/Edge Function when rows are inserted into `notifications` (respecting the existing per-type settings and group mutes).
