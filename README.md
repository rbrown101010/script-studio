# Native Note

A video-script editor for creators: block-based scripts, line comments with files, share links, and tools around making the video (captions, briefs, brand deals, an idea board, a file library and X posting). Built with Next.js and Convex.

## Features

- **Scripts**: sortable, filterable list with Calendar and Feed views; edit title, status, format, sponsorship and live date in place.
- **Editor**: blocks (text, heading, lists, to-dos), `/` menu for types and colors, links, bold, drag to reorder. Tabs for editor instructions, details, captions, brief and updates. Versions with diff review and restore.
- **Comments**: on any line or the whole script, with photos, videos, files and link previews; comments follow their line through edits.
- **Share links**: unguessable `/s/…` links show one script; an optional passcode lets guests comment or suggest an edited version. `/s/…/agent` gives AI agents the script, comments and download links for every attached file.
- **Mymind**: idea board (tweets, videos, images, links, notes) with search and bookmarks.
- **Library**: every file pasted into comments, searchable by the line it was attached to.
- **Tweet**: write, post and schedule to connected X accounts through Composio.
- **Brand deals**: partners with logos and details, linked to their videos.
- **Agent API**: an MCP server at `/mcp` and HTTP routes under `/agent` (bearer key) for reading and editing scripts.
- Light and dark themes.

## Rectangle background gradients

Select a rectangle on a board, then choose **Background → Gradient** in its existing style panel (Style on phones). Edit the two color swatches or six-digit hex colors, and choose a direction. Direction follows the rectangle when rotated. **Solid**, a normal background color, or a fill pattern switches back to the usual fill; undo restores the gradient. Mixed selections apply gradients only to rectangles. Blur temporarily takes precedence and restores the gradient when turned off.

Gradients render inside the canvas in normal layer order, including rounded/rough edges and opacity. Board/frame SVG previews and Excalidraw's SVG/PNG exports use the same fill. Gradient metadata lives in element `customData`, so board saves, scene files, copies, duplicates and history retain it. Unmodified Excalidraw clients show the start color as a solid fallback. Only two-color linear rectangle backgrounds are supported; patterned gradient fills, radial gradients and other shape types are outside this feature.

Excalidraw 0.18.1 has no custom-fill renderer API. `npm ci` applies a small renderer/action patch from `scripts/patch-excalidraw-gradients.mjs` to its development and production bundles. The dependency is pinned and bundle hashes are checked before writing; upgrades require reviewing this patch. Run `npm run test:gradients` for focused regression tests. `npm run preview:gradients` opens a backend-free localhost fixture at `http://127.0.0.1:3211`, using localStorage only; add `-- --production` to verify production renderer bundles. Preview artifacts are ignored under `output/playwright/`.

## Setup

1. `npm install`
2. `npx convex dev` (creates a Convex deployment and writes `.env.local`)
3. Set the environment variables below on the Convex deployment (`npx convex env set NAME value`).
4. `npm run dev`

| Variable | What it's for |
| --- | --- |
| `TEAM_CODE` | Team password needed to create an account. Without it, sign-up is closed. |
| `SITE_URL` | Public URL of the site (used in links the agent API returns). |
| `AGENT_API_KEY`, `AGENT_API_KEYS` | Bearer key(s) for the agent API and MCP server (extra keys comma-separated). |
| `COMPOSIO_CONSUMER_KEY` | Composio key used to post to the connected X accounts (optional). |
| `X_ACCOUNTS` | The X accounts to post from, as JSON: `{"id":{"composio":"<connected account>","username":"<handle>"}}` (optional). |
| `JWT_PRIVATE_KEY`, `JWKS` | Auth keys, set up by `npx @convex-dev/auth`. |

Never commit `.env*` files; they are git-ignored.
