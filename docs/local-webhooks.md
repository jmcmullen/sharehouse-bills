# Local Webhook Endpoint

This app listens for inbound email webhooks at:

`/api/hooks/email`

In local development the app runs on:

`http://127.0.0.1:4000`

So the local webhook URL is:

`http://127.0.0.1:4000/api/hooks/email`

## Quick Tunnel

For disposable local testing, start the app and expose it with Cloudflare Tunnel:

```bash
bun dev
bun tunnel
```

`cloudflared` will print a public `https://<random>.trycloudflare.com` URL. Use this webhook endpoint in Resend:

`https://<random>.trycloudflare.com/api/hooks/email`

Per current Cloudflare docs, quick tunnels are for development/testing only. They use a random `trycloudflare.com` hostname, have a 200 concurrent request limit, and do not support SSE.

## Named Tunnel

If you want a stable hostname for Resend webhooks, create a named tunnel instead of relying on a random quick-tunnel URL.

1. Authenticate once:

```bash
cloudflared tunnel login
```

2. Create the tunnel:

```bash
cloudflared tunnel create sharehouse-bills-dev
```

3. Copy the checked-in example config and fill in your tunnel ID, credentials path, and hostname:

```bash
cp cloudflared/webhook.example.yml cloudflared/webhook.yml
```

For this repo, the local checked-in config now targets:

- hostname: `local.1f.io`
- local service: `http://localhost:4000`

4. Run the named tunnel:

```bash
bun tunnel
```

5. Point Resend at:

`https://local.1f.io/api/hooks/email`

## Resend Notes

- Keep `bun dev` running while the tunnel is active.
- For Resend inbound webhooks, configure the webhook URL to the public tunnel URL plus `/api/hooks/email`.
- The route only accepts verified Resend webhooks.
- If your local dev server binds only on IPv6 loopback, prefer `localhost` over `127.0.0.1` in the tunnel service URL.
