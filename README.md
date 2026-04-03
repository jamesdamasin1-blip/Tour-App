# Aliqual

Aliqual is an Expo / React Native travel budget app backed by Supabase.

## Architecture

- Cloud-first collaboration: trips, members, activities, expenses, wallets, and funding events are written to Supabase first.
- Local persistence is used only for device cache state and minimal device-only metadata.
- Sharing and membership are invite-based. Raw trip import / QR payload flows are intentionally not part of the release build.

## Environment

Create a local `.env` from `.env.example` and provide:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID`

## Scripts

- `npm install`
- `npm run start`
- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run lint`
- `npx tsc --noEmit`

## Database

Supabase schema changes live in [supabase/migrations](/E:/Tour%20App/supabase/migrations).
Apply the latest migrations before testing invite, sync, or wallet flows.

## Release Notes

- Auth sessions are stored in secure device storage on native builds.
- Invite acceptance refreshes the authoritative cloud bundle after membership is granted.
- Development-only sync trace UI, QR import flows, and one-off test cleanup hooks are excluded from the release code path.
