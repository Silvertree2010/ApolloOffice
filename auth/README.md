# auth.apollonet.dev

The login service for ApolloOffice. A Cloudflare Worker without storage: it runs the OAuth login with GitHub, Google, GitLab or Discord and sends the user back to their own installation with a short signed token (Ed25519, 2 minutes). The installation checks the signature with the public key built into the binary.

## Deploy

1. Create OAuth apps. Callback URL for each: `https://auth.apollonet.dev/cb/<provider>` (`github`, `google`, `gitlab`, `discord`).
2. Set the secrets:

```sh
openssl pkey -in auth-ed25519.pem -outform DER | base64 | npx wrangler secret put SIGN_KEY
openssl rand -base64 48 | npx wrangler secret put STATE_KEY
npx wrangler secret put GITHUB_ID      # and GITHUB_SECRET, GOOGLE_*, GITLAB_*, DISCORD_*
```

3. `npx wrangler deploy`

The public key in `src/auth.rs` (`PUB`) must belong to `SIGN_KEY`. A provider without its `*_ID` secret is simply not offered.
