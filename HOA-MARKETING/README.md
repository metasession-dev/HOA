# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

This is a static Vite SPA (`vite build` → `dist/`, no server-side code). It is hosted on
**Cloudflare Pages** — a static CDN — rather than an always-on Railway container, because a
static bundle needs no running server and the container's reserved RAM was the dominant cost.

### Cloudflare Pages settings

Create the project once via **Workers & Pages → Create → Pages → Connect to Git**, select this
repo, and use:

| Setting | Value |
| --- | --- |
| Root directory | `HOA-MARKETING` |
| Build command | `npm install --legacy-peer-deps --no-audit && npm run build` |
| Output directory | `dist` |
| Node version | pinned to `20` via `.node-version` |

`--legacy-peer-deps` is required because `lovable-tagger` declares React-18 peer deps that
otherwise fail install. SPA deep-link fallback is automatic: `vite build` copies
`public/_redirects` into `dist/_redirects`, which Cloudflare Pages honors (`/*  /index.html  200`).

After the first successful build, point the marketing custom domain at the Pages project, verify a
hard refresh of a client-side route (e.g. `/pricing`) returns 200, then delete the old
`hoa-marketing` service in the Railway dashboard to stop its idle RAM charge.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
