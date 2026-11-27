# Drawings

A private, self-hosted Excalidraw workspace for `draw.hariharprasad.com`. The React client and API run on Cloudflare Pages Functions, board metadata and scenes live in D1, and embedded image data and the shared component library live in R2.

`mermaid` is pinned to 11.12.x on purpose: `@excalidraw/mermaid-to-excalidraw` 2.x looks up rendered SVG nodes by ID, and mermaid 11.13+ prefixes those IDs, which silently turns ER, class and state diagrams into flat images.

## Local development

```bash
npm install
npm run build
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npx wrangler dev
```

## First deployment

Authenticate and create the persistent resources:

```bash
wrangler login
wrangler d1 create harihar-excalidraw
wrangler r2 bucket create harihar-excalidraw-files
```

Copy the returned D1 database ID into `wrangler.jsonc`, then configure the two application secrets:

```bash
wrangler pages secret put APP_PASSWORD --project-name harihar-drawings
wrangler pages secret put SESSION_SECRET --project-name harihar-drawings
npm run db:migrate:remote
npm run deploy
```

Because the domain uses external Vercel DNS, associate `draw.hariharprasad.com` with the Pages project and add this DNS record:

```text
CNAME  draw  harihar-drawings.pages.dev
```

D1 point-in-time recovery and periodic exports should be used for backups.
