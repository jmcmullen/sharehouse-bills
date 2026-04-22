# Local Webhook Endpoint

This app listens for inbound email webhooks at:

`/api/email-webhook`

In local development the app runs on:

`http://127.0.0.1:4000`

So the local webhook URL is:

`http://127.0.0.1:4000/api/email-webhook`

## Quick Tunnel

For disposable local testing, start the app and expose it with Cloudflare Tunnel:

```bash
bun dev
bun tunnel:webhook
```

`cloudflared` will print a public `https://<random>.trycloudflare.com` URL. Use this webhook endpoint in Resend:

`https://<random>.trycloudflare.com/api/email-webhook`

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

- hostname: `webhook.bills.1f.io`
- local service: `http://localhost:4000`

4. Run the named tunnel:

```bash
bun tunnel:webhook:named
```

5. Point Resend at:

`https://webhook.bills.1f.io/api/email-webhook`

## Resend Notes

- Keep `bun dev` running while the tunnel is active.
- For Resend inbound webhooks, configure the webhook URL to the public tunnel URL plus `/api/email-webhook`.
- The route accepts both Resend webhooks and the existing manual multipart upload flow.
- If your local dev server binds only on IPv6 loopback, prefer `localhost` over `127.0.0.1` in the tunnel service URL.
