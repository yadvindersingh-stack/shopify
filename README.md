# Actionable Analytics Shopify App

A production-ready Shopify embedded app that delivers daily actionable analytics to merchants.

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Shopify App Bridge
- Shopify Admin API
- Supabase (Postgres, direct client)
- Resend (email)
- Node runtime (no edge)

## Features
- OAuth install flow
- Shopify read-only scopes
- Supabase schema (shops, insights, digest_settings)
- Data fetchers for Shopify
- Rule-based insight engine
- Daily/weekly email digests
- Minimal embedded UI (/app/insights, /app/settings)
- Background jobs for daily/weekly digests

## Setup
1. Copy `.env.example` to `.env.local` and fill in your credentials.
2. Install dependencies: `npm install`
3. Run the dev server: `npm run dev`
4. Use Shopify CLI for local app tunnel and install.

## Database Schema
Create the following tables in Supabase (Postgres):

```sql
-- shops table
create table if not exists shops (
  id uuid primary key default gen_random_uuid(),
  shop_domain text unique not null,
  access_token text not null,
  email text not null,
  timezone text,
  created_at timestamptz default now()
);

-- insights table
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  severity text check (severity in ('low', 'medium', 'high')) not null,
  suggested_action text,
  data_snapshot jsonb,
  created_at timestamptz default now()
);

-- digest_settings table
create table if not exists digest_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  daily_enabled boolean default true,
  weekly_enabled boolean default true,
  email text not null
);
```

## Local Development
- Requires Node.js 18+
- Compatible with Shopify CLI
- Seed script for fake data: `npm run seed` (add this script as needed)

## TODOs for v2
- More advanced insights
- Multi-user support
- Improved scheduling

---

For more, see the code and comments.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
