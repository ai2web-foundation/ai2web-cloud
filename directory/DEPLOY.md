# Deploy the Discovery Network (Worker + D1)

## Create the database
```bash
cd ai2web-cloud/directory
npm install
npx wrangler d1 create ai2web-directory
```
Copy the printed `database_id` into `wrangler.jsonc` (replace `REPLACE_WITH_YOUR_D1_ID`).

## Initialise the schema (creates the table + seeds the demo store)
```bash
npm run db:init          # remote
# or: npm run db:init:local   # local dev DB
```

## Run / deploy
```bash
npx wrangler dev         # local
npx wrangler deploy      # -> https://ai2web-directory.<subdomain>.workers.dev
```

## API
```
GET  /sites?capability=commerce&type=ecommerce&q=store
GET  /sites/:id
POST /register   { "manifest": { … }, "id": "my-site" }
```

## Optional: protect registration
```bash
npx wrangler secret put REGISTER_TOKEN
```
When set, `/register` requires `Authorization: Bearer <token>`. Registration also refuses non-public URLs and never overwrites an existing id (anti-poisoning).

## Point the connector at it
Set `DIRECTORY_URL` in the connector Worker to this deployed URL (see `../connector/`).
