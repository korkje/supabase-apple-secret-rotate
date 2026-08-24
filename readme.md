# supabase-apple-secret-rotate

Keeps [Sign in with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple) working on a Supabase project by minting a fresh Apple client secret and writing it to the project's auth config via the [Management API](https://supabase.com/docs/reference/api/introduction).

Apple's "client secret" is not a stored secret but an ES256 JWT you sign yourself with a long-lived `.p8` key, and Apple caps its lifetime at 6 months. Left unautomated, every Supabase project using Apple auth has a production outage on a timer.

Every run mints a fresh max-lifetime secret and writes it unconditionally — no expiry checking, no state. Run it on a monthly cron and the live secret is never older than a month, so even several consecutive failed runs leave months of runway. The cron schedule *is* the refresh interval; the action itself is idempotent and safe to run as often as you like.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `apple-team-id` | yes | | Apple Developer team ID |
| `apple-key-id` | yes | | Key ID of the `.p8` signing key |
| `apple-client-id` | yes | | Apple Services ID (e.g. `tv.example.signin`) |
| `apple-private-key` | yes | | Contents of the `.p8` private key |
| `supabase-project-ref` | yes | | Supabase project reference |
| `supabase-access-token` | yes | | Supabase Management API [personal access token](https://supabase.com/dashboard/account/tokens) |
| `expires-in` | no | `15777000` | Secret lifetime in seconds (Apple's max: `15777000` ≈ 6 months) |

## Outputs

| Name | Description |
| --- | --- |
| `expires-at` | ISO 8601 timestamp at which the new secret expires |

> [!NOTE]
> The minted secret is masked in logs and never exposed as an output.

## Usage

```yaml
on:
  schedule: [{cron: "17 4 3 * *"}] # monthly
  workflow_dispatch:

jobs:
  rotate:
    runs-on: ubuntu-latest
    steps:
      - uses: korkje/supabase-apple-secret-rotate@v1
        with:
          apple-team-id: ${{ vars.APPLE_TEAM_ID }}
          apple-key-id: ${{ vars.APPLE_KEY_ID }}
          apple-client-id: ${{ vars.APPLE_CLIENT_ID }}
          apple-private-key: ${{ secrets.APPLE_PRIVATE_KEY }}
          supabase-project-ref: ${{ vars.SUPABASE_PROJECT_REF }}
          supabase-access-token: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

The action does one thing: mint, write, verify. It does not enable the Apple provider or touch any other auth config — set up the provider once in the [dashboard](https://supabase.com/dashboard) first, then let this keep the secret fresh.
