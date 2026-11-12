# Refinement Poker: channel chat + tab

The existing tab stays available at `https://annemiekdehaan.github.io/refinement-poker/`. This directory adds a deterministic Microsoft Teams bot. It does not use an AI model or require an OpenAI key.

**Current state:** code and local tests are ready. This bot has not been registered or deployed to the user's Microsoft 365 tenant. The tab-only ZIP remains usable. A combined bot ZIP is generated only after a real bot ID exists; no fake-ID ZIP is presented as installable.

## Chat experience

1. Install the combined app in the intended team or group chat.
2. Choose `/poker` and enter a title, e.g. `/poker FEE-42 Checkout flow`. The command is explicitly for posting a public round to this conversation. On clients without slash support use `@Refinement Poker poker FEE-42 Checkout flow`.
3. A shared Adaptive Card displays clickable estimates and the two-minute deadline. Teams supplies the voter's identity; there is no name or room code to enter.
4. A click records or changes a private vote and gives a personal acknowledgement. The shared card shows only the count until reveal.
5. The starter can reveal early or restart. On timeout the bot automatically reveals the results, normally within three seconds while the service is running.
6. **Next round** posts a fresh card, preserving the previous results in the chat. **End session** closes the round. Old card controls cannot affect the new round.

Chat and tab rounds are independent in this version. The tab has a live second-by-second countdown; chat cards show the local end time, not an animated timer. The chat bot supports up to 50 voters per round and retains server state for seven days. The tab retains its existing twelve-person peer-to-peer behavior.

## Architecture and authentication

Node.js 24, official Teams SDK 2.2.1, Express and SQLite. `POST /api/messages` accepts only signed Microsoft service tokens, for the configured tenant, via the SDK's validation. Unauthenticated traffic returns 401; wrong tenants return 403. Round control uses the authenticated actor ID, not form data. The starter is the facilitator; this does not imply Teams administrator privileges.

The bot requests no Graph roster or channel-history access. Slash and card interactions are sufficient. Bot identity credentials stay on the server. The ZIP contains the manifest and two icons only, never a secret.

SQLite stores deadlines, voters, hidden votes, message IDs and history. Run **one** bot process with a persistent volume, e.g. `/data`. Stored sessions are pruned after seven days. Failed PUT updates are retried by the scheduler. A failed initial POST with an ambiguous outcome is not retried automatically, to avoid duplicate posts; check the channel before issuing another command. This is a single-instance small-team service, not a multi-replica deployment.

## Register and host

Microsoft's current Teams Developer CLI can provision a Teams-managed bot without an Azure subscription. Registration still requires an authorized Microsoft 365 sign-in, consent and a tenant that permits custom apps. Hosting the server is a separate step; GitHub Pages cannot run this backend.

```sh
npm ci --prefix bot
bot/node_modules/.bin/teams login --device-code
```

After choosing a persistent Node/container host and its public HTTPS endpoint, provision the bot with the official CLI. Use `--env bot/.env` to write its secret to an ignored local file. Capture/redact CLI output; the CLI can print credential values. Do not paste a secret into chat or commit it. Configure `CLIENT_ID`, `TENANT_ID` and `CLIENT_SECRET` as server secrets, or use the SDK's managed-identity option on Azure. The messaging endpoint is `https://<chosen-host>/api/messages`.

The app manifest retains the existing app ID so a package can update the same installed app. The bot ID is the separate Microsoft client ID of the provisioned bot. Generate the combined package files:

```sh
node bot/package-teams.mjs --bot-id <registered-client-id>
cd bot/package
zip ../RefinementPoker-tab-en-chat.zip manifest.json color.png outline.png
```

Upload that combined ZIP in Teams. Bot registration must also permit the declared scopes and endpoint. Validate slash visibility, public posting, per-user card actions, threading and the target tenant's policy with a live installation before calling the integration complete.

## Run

```sh
cd bot
npm ci --omit=dev
# Populate ignored .env via the registration flow
npm start
```

For a container, build from the **repository root** with `docker build -f bot/Dockerfile -t refinement-poker-bot .`, mount a persistent `/data` volume, supply the server secrets and expose port 3978 behind HTTPS. Do not deploy an anonymous development endpoint. `GET /health` reveals no session data.

## Verification

```sh
npm test                    # existing tab: 23 tests
npm test --prefix bot       # bot, auth boundary and combined manifest: 8 tests
postman simulation run postman/simulations/poker-bot.sim.yaml --port 4518 --no-history
TEAMS_SIM_URL=http://127.0.0.1:4518/teams node bot/tests/connector-simulation.mjs
```

The Postman run exercises the real Teams SDK's outbound HTTP POST/PUT against a synthetic stateful connector, including a 503 failure, persisted retry and automatic result publication. It does not prove Microsoft tenant authentication, client rendering, public slash threading, live bot registration or cloud hosting. Microsoft manifest 1.29 is checked against the official JSON schema. SDK incoming authentication is never disabled in the shipped server.

Provider discovery used Orbit for the update route and Microsoft's official SDK/docs for authentication and behavior. Orbit omitted authentication from its example; that omission is not followed. Postman is signed out here, so owner's mocks, cloud workspace search and authenticated webhook capture were skipped; the simulation runs locally without an account.

References: [Teams registration](https://microsoft.github.io/teams-sdk/cli/getting-started/quickstart/), [slash commands](https://microsoft.github.io/teams-sdk/typescript/essentials/on-activity/), [Adaptive Card actions](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-actions).
