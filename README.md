# Reviews SPA — Week 6 HTTP retries

A small Vue and TypeScript SPA for the CIS3039 deployment, configuration and
CORS lab. It can use temporary in-browser data or the separately deployed
Reviews API without changing its application use cases. The browser executes the
SPA; Azure Storage hosts its built static files. This is manual deployment and
configuration practice before later CI/CD work; assessment requirements are unchanged.

In Week 6, use this example to explore how bounded HTTP retries can help a
browser application recover from brief failures. GET requests can be retried;
POST requests are sent once to avoid accidentally repeating a write.
See **HTTP retries: behaviour and local demonstration** below to observe this
behaviour without Azure.

A development environment may run the API locally with dedicated cloud persistence.
The test environment is a fully deployed system with its own configuration and data.
Use that deployed test API for both the local-browser and hosted-browser activities.

## Development environment

Install VS Code, a working container runtime and the Dev Containers extension.
Use Week 4's history-preserving private-copy procedure. In a separate VS Code
window, choose **Git: Clone** and paste
`https://github.com/tpdavison/cis3039-reviews-app.git`. On a University lab PC,
select your **Source** folder. Open the cloned folder and choose
**Dev Containers: Reopen in Container**; wait for it to finish before using its
terminal. Keep the API dev host running in its own container/window for comparison.

Select the supplied retry branch before continuing:

```bash
git switch feature/http-retry
git branch --show-current
```

Create an empty **private** GitHub repository for this example, leaving the README,
licence and `.gitignore` options unselected. Copy its HTTPS URL. In the container's
Bash terminal at the SPA repository root, replace the placeholder URL below with
your copied URL:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_PRIVATE_REPOSITORY.git
git remote -v
git branch --show-current
```

Check that both `origin` entries identify your private repository and the current
branch is `feature/http-retry`. Correct any mismatch before pushing the existing
history:

```bash
git push -u origin feature/http-retry
```

Refresh your GitHub repository and confirm the files are present. Preserve the
cloned history and keep this practice separate from assessment work. The example
already contains its project; do not scaffold another one over it.

Run the following commands from the repository root inside the Dev Container.
Use the supplied course Dev Container and Node.js 22. Check your Node/npm
versions before installing dependencies:

```sh
node --version
npm --version
npm ci
```

Continue to the three configuration modes below, starting Vite with `npm run dev`
after selecting empty fake. Vite reports the local URL, normally
`http://localhost:5173`. Stop it with Ctrl+C before changing settings and restarting.

Supplementary checks: run a standalone type-check, or build and preview the
production output locally. These are not extra required guided steps:

```bash
npm run type-check
npm run build
npm run preview
```

The build includes type-checking and writes static files to `dist/`. Open the
preview URL reported by Vite; preview serves the existing build and does not
rebuild it. Stop preview with Ctrl+C before resuming the local Vite activity.

These steps use the `feature/http-retry` branch. The tracked `.env` contains
public defaults; `*.local`, `node_modules/` and `dist/` are ignored.

## Architecture

Source dependencies point towards the application and domain:

```text
Vue components/views/composables ──> application use cases ──> domain rules
                  HTTP adapter ─────> application port ───────> domain types
                  fake adapter ─────> application port ───────> domain types
bootstrap/settings ──> concrete adapters and the provided dependency object
```

- `src/domain/` owns review values and the pure validation factories.
- `src/app/` owns the use cases and the minimal `ReviewService` port they need.
- `src/infra/` maps the HTTP contract or simulates it in memory.
- `src/config/` parses public settings and assembles one adapter.
- `src/composables/`, `src/views/` and `src/components/` own Vue state and UI.
- `src/main.ts` is the bootstrap boundary and provides dependencies to Vue.

The service contract does not promise list order. The presentation sorts reviews
newest first, preserving received order when timestamps tie.

## Choose a review service

`src/config/app-settings.ts` parses `import.meta.env` with `parseAppSettings()`.
`src/config/composition-root.ts` assembles the chosen adapter with
`createReviewDeps()`, which `src/main.ts` provides to Vue at bootstrap.

`.env` is a text configuration file in the repository root. Vite reads its public
`VITE_*` settings when starting the development server or building the SPA. These
values reach browser code through `import.meta.env` and are embedded in browser
assets at build time. No credentials belong in `.env` or browser assets.
Restart the development server after editing `.env`; rebuild and reupload `dist/`
to change a hosted site's target.

Vite gives existing shell environment variables priority over env files. Mode files
(such as `.env.production` for a production build) override generic files; also
inspect `.env.local` and `.env.<mode>.local` if the apparent target differs.
The API's custom script loader has its own file-over-shell rule; that is not
Vite's behaviour.

Use one active assignment per setting when switching modes. The app rejects a
non-empty base URL in fake mode and rejects seed data in HTTP mode. Invalid
settings prevent startup; they do not silently select another adapter.

| Mode | `VITE_REVIEWS_SERVICE` | `VITE_USE_SEED_DATA` | `VITE_REVIEWS_BASE_URL` |
| --- | --- | --- | --- |
| Empty fake | `fake` | `false` | Remove/comment out |
| Seeded fake | `fake` | `true` | Remove/comment out |
| Test API | `http` | `false` | `https://YOUR_ACTUAL_TEST_HOSTNAME/api` |

Worksheet E2 requires observing all three modes in this order. Replace
`YOUR_ACTUAL_TEST_HOSTNAME` with the actual test hostname recorded in D6 from
`defaultHostName`; do not construct it by adding `.azurewebsites.net` to an app
name. The complete `.env` examples below use the same three modes.

### Empty fake (default)

Edit the repository-root `.env`; remove or comment out any
`VITE_REVIEWS_BASE_URL` when selecting either fake mode.

```dotenv
VITE_REVIEWS_SERVICE=fake
VITE_USE_SEED_DATA=false
# VITE_REVIEWS_BASE_URL is absent in fake mode.
```

Run `npm run dev`, open Vite's reported URL and confirm the reviews list is empty.
Stop Vite with Ctrl+C before replacing the active settings with seeded fake.

### Seeded fake

```dotenv
VITE_REVIEWS_SERVICE=fake
VITE_USE_SEED_DATA=true
# VITE_REVIEWS_BASE_URL is absent in fake mode.
```

Restart `npm run dev` and confirm sample reviews appear. The fake stores its records
and additions in browser memory and resets on reload, so additions disappear on
refresh. Its seed and returned values are copied so mutable `Date` objects do not
alter stored records. Stop Vite again before selecting HTTP mode.

### Deployed HTTP API

```dotenv
VITE_REVIEWS_SERVICE=http
VITE_USE_SEED_DATA=false
VITE_REVIEWS_BASE_URL=https://YOUR_ACTUAL_TEST_HOSTNAME/api
```

Restart `npm run dev`. The page may load but fail to load reviews until the browser
origin is allowed by the test API's CORS settings. Continue to E3, covered below in
**Verify a deployed API and CORS**, to investigate this expected integration issue.
If configuration parsing itself fails, correct the mode settings above first;
CORS does not cause a parsing failure.

The base URL must be an absolute HTTP(S) URL ending at `/api`; the adapter appends
`/reviews`. Do not include `/reviews` twice. The current API contract is:

- `GET /api/reviews` → `{ reviews, totalCount }`
- `POST /api/reviews` → `{ review }`
- expected HTTP 400 validation → `{ issues: [{ field, message }] }`

Unexpected responses and network failures remain operational failures. The app
does not retry POSTs, reveal raw server diagnostics, or fall back to fake data.

## HTTP retries: behaviour and local demonstration

### How retries work

Retries are an infrastructure concern: they control how an HTTP request is
sent, rather than the rules for adding or listing reviews. The application
use cases depend on the `ReviewService` port, so they do not need to select
retries or change when the HTTP policy changes.

The composition root, `src/config/composition-root.ts`, constructs the HTTP
capability and injects it into the adapter:

```ts
const request = createRequestWithRetry();
const reviewService = new HttpReviewService({
  baseUrl: settings.reviewsBaseUrl,
  request,
});
```

`HttpReviewService` uses the generic `HttpRequestExecutor` contract from
`src/infra/http-request.ts`. It constructs URLs and request bodies, then
validates and maps responses into domain values. It does not know whether its
executor retries. The executor accepts a response-reading callback so that
the retry policy's timers remain active until the response body has been read.

To select standard HTTP instead, import `createHttpRequest` from
`../infra/http-request` in the composition root and use
`const request = createHttpRequest()`. The adapter and use cases stay the same.
The standard implementation makes a single fetch attempt and honours caller
cancellation; it adds no retry policy or deadlines. Fake adapters do not make
HTTP calls and do not retry.

The retry-enabled implementation uses this default policy:

| Concern | Behaviour |
| --- | --- |
| Method safety | Only GET can be retried. POST and every other method are attempted at most once. |
| Retry conditions | GET fetch network failures (`TypeError`), attempt timeouts, and HTTP 408, 429, 500, 502, 503 or 504. |
| Bound | Three retries means **up to four attempts**, including the first request. A deadline can stop earlier. |
| Backoff | Exponential delay starting at 200 ms, capped at 5000 ms, with random jitter between 50% and 100% of that delay. |
| Timeouts | 8 seconds per attempt and 30 seconds for the entire operation, including waits and response-body reading. Both GET and POST have these bounds. |
| Retry-After | A readable seconds value or HTTP date is a minimum wait before a retry. The total deadline still applies. |
| Cancellation | A caller's abort stops active work and backoff. Disposing the Vue scope cancels its active list load. An abort is never retried. |
| Exhaustion | When attempts run out, the caller receives an error with the final HTTP status or network failure. A timeout rejects with `TimeoutError`. The page displays an error message. |

Other HTTP statuses, invalid JSON and invalid review/envelope fields fail without
retrying. In a browser, a network `TypeError` can also mean CORS blocked a response;
retries cannot repair CORS. To use `Retry-After` across origins, the API must expose
that header with `Access-Control-Expose-Headers: Retry-After`. A hidden or invalid
header falls back to normal backoff.

To explore the policy in code, find the defaults in
`src/infra/request-with-retry.ts`. The composition root can pass a second
argument to `createRequestWithRetry(http, options)` to set `maxRetries`,
`initialDelayMs`, `maxDelayMs`, `attemptTimeoutMs` and `totalTimeoutMs`.
Pass `undefined` as the first argument to use browser fetch with custom options.
`listReviews(deps, { signal: controller.signal })` passes cancellation through
the application port; calling `controller.abort()` cancels it.

### Reuse the HTTP capability in another SPA

Copy these two modules into your own infrastructure folder, keeping them
together so their relative imports resolve:

- `src/infra/http-request.ts` defines `HttpClient`, `HttpRequestExecutor`, the
  browser fetch wrapper and the standard `createHttpRequest` implementation.
- `src/infra/request-with-retry.ts` imports only from `./http-request` and
  supplies `createRequestWithRetry` and its `RetryOptions` type.

Neither module depends on Reviews, Vue, Vite or application/domain models.
They assume a modern browser with `fetch`, `Request`, `Response`,
`AbortController`, `AbortSignal` (including `reason` and `throwIfAborted()`),
`DOMException` and browser timers. TypeScript needs the DOM library types.
Use the response-reading callback to consume the body before returning, so
the retry executor can apply its timeouts during that work.

For example, a weather HTTP adapter can accept the same executor in
`src/infra/weather-service.ts`:

```ts
import type { HttpRequestExecutor } from './http-request';

export class WeatherService {
  constructor(private readonly request: HttpRequestExecutor) {}

  async getForecast(signal?: AbortSignal): Promise<unknown> {
    return this.request(
      '/api/weather',
      { method: 'GET', signal },
      async (response) => {
        if (!response.ok) throw new Error(`Weather API status ${response.status}`);
        return response.json();
      },
    );
  }
}
```

In that SPA's composition root, select the executor and inject it:

```ts
import { createRequestWithRetry } from '../infra/request-with-retry';
import { WeatherService } from '../infra/weather-service';

const request = createRequestWithRetry();
const weatherService = new WeatherService(request);
```

The weather URL is illustrative: use your own API endpoint and validate its
JSON in the adapter before creating domain values. You do not need to copy
the Reviews application or change the retry algorithm. To use standard HTTP,
select `createHttpRequest()` in this composition root instead.

### Prepare the local demonstration

From the repository root inside the Node 22 Dev Container:

```bash
npm ci
npm run build
```

The build includes TypeScript checking. Use the browser activity below to
observe the retry behaviour.

### Observe recovery in the browser without Azure

Install dependencies as above. Stop any existing Vite server. In one terminal,
start the temporary demonstration API:

```bash
npm run demo:retry
```

It listens at `http://127.0.0.1:7072/api`, returns 503 for its first two GETs, and
returns a sample review thereafter. Every POST returns 503 and saves nothing.
The process keeps only a GET counter and prints each request/status. It is a
deliberately failing demonstration, not the real Reviews API or persistence.
If port 7072 is occupied, stop the conflicting local process first.

In a second terminal, run Vite with temporary shell overrides. This keeps your
existing `.env` choices intact:

```bash
VITE_REVIEWS_SERVICE=http VITE_USE_SEED_DATA=false \
  VITE_REVIEWS_BASE_URL=http://127.0.0.1:7072/api npm run dev
```

If using a Dev Container, forward port **7072** in VS Code's Ports panel as well
as Vite's reported port. Keep its local forwarded port at 7072 so the browser
can reach the URL above. Open Vite's reported URL, open browser DevTools Network,
and reload once if necessary to capture requests. The first page load consumes
the initial failures: restart the demo API and reload the SPA to repeat them.

1. Observe GET statuses **503 → 503 → 200**, with short varying gaps before the
   retries. The page stays loading until success and displays the sample review
   titled **GET recovered after two failures**. The demo terminal provides the
   same request sequence. Further reloads succeed immediately until restart.
2. Open **+ Add Review**, enter valid review details and submit once. Observe
   **one POST with status 503**, no automatic repeated POST, and the page's message
   that it could not confirm the save. The demo logs one POST and saves nothing.
   A browser CORS OPTIONS preflight may also appear; it is not a repeated POST.
   This simulated failure saves nothing: it demonstrates the absence of an
   automatic POST retry. It does not demonstrate a successful write whose
   response is lost, where a repeated submission could create a duplicate.
3. To demonstrate network exhaustion, stop the demo API and reload the SPA.
   Observe up to **four failed GETs**, followed by **Reviews could not be loaded**.
   Restart the API and reload to recover.
4. Stop both processes with Ctrl+C. Restart Vite using `npm run dev` to return to
   your existing `.env` selection. No Azure resources were created by this demo.

### Predict, change and observe the attempt limit

Try this short variation after observing the starter demonstration:

1. Predict what the page will show if the API fails four GET requests before
   succeeding. Count the initial attempt as well as the three allowed retries.
2. Stop the demo API. In `scripts/retry-demo-api.mjs`, find
   `const status = getAttempts <= 2 ? 503 : 200;` and change `2` to `4`.
   Keep the SPA's retry policy unchanged.
3. Restart `npm run demo:retry`, then reload the SPA with DevTools Network open.
   Restarting the API resets its GET counter.
4. Compare your prediction with the terminal, Network panel and page. Expect
   four GET responses with status 503, then the page's load-error message.
   The client stops before a fifth attempt, even though that request would
   succeed. Reloading the page starts a new operation with its own attempt limit.
5. Restore the threshold to `2`, restart the demo API and reload the SPA.
   Confirm that the starter sequence is again **503 → 503 → 200**, then stop
   both local processes when finished.

This activity illustrates a bounded recovery policy and its limits. It does
not establish durable delivery, safe write retries or recovery from a prolonged
outage.

### What HTTP retries do not solve

Retries can mask brief failures; they cannot fix an outage, bad configuration,
CORS, invalid data or unavailable infrastructure. Waiting and repeating requests
also adds latency and load. GET must remain a read-only operation in the API.
This example adds no durable queue, offline delivery, circuit breaker or ordering
guarantee, and is not evidence of exactly-once processing.

A failed or timed-out POST can have saved data before its response was lost.
The client therefore does not repeat it automatically. With the real API,
refresh and check the list before deciding whether to submit again; a manual
repeat can still create duplicates. Safe automatic write retries need a separate
server-side idempotency design.

## No-cloud demonstrations

Use these supplementary scripts to explore domain validation and the fake
adapter without Azure:

```sh
npm run demo:domain
npm run demo:reviews
```

The domain demo prints a successful value that retains surrounding whitespace,
then issues for a fractional rating and blank text. The reviews demo prints a
successful review with ID `demo-review-1` and timestamp
`2026-01-15T12:00:00.000Z`, followed by a one-item list from the same fake.

## Verify a deployed API and CORS

Use a working **test** Reviews API backed by the test database. Its deployment
prerequisites are in the [API README](https://github.com/tpdavison/cis3039-reviews-api/blob/main/readme.md).
The API's GET and POST endpoints are anonymous. Confirm that this Function App
uses test data rather than the development database before submitting reviews.

All CLI examples below use the **Bash terminal inside the course Dev Container**.
Replace `YOUR_UID`, `YOUR_REGION`, `YOUR_STORAGE_ACCOUNT`,
`YOUR_TEST_FUNCTION_APP`, `YOUR_ACTUAL_TEST_HOSTNAME` and `YOUR_SUBSCRIPTION_ID`
with your actual values.
Use `<project>-<environment>-<uid>-<type>` names where Azure permits hyphens:
for example, `reviews-test-YOUR_UID-rg` and `reviews-test-YOUR_UID-func`.
Use a short lowercase-letter-and-digit UID. `YOUR_TEST_FUNCTION_APP` is the actual
Function App name; if it lives in another group, use that group's name for CORS.
Use the actual hostname recorded in D6, returned by
`az functionapp show --query defaultHostName`. Copy it into each URL below; do not
substitute a resource name or append a guessed suffix.
Run commands one block at a time and resolve failures before continuing.

1. Check login, explicitly select your subscription and verify the existing API
   directly before involving the browser:

   ```bash
   az account show --output table
   # Only if not signed in:
   az login --use-device-code
   az account list --output table
   az account set --subscription 'YOUR_SUBSCRIPTION_ID'
   az account show --query '{subscriptionName:name,subscriptionId:id}' --output table
   az functionapp show \
     --name 'YOUR_TEST_FUNCTION_APP' \
     --resource-group 'reviews-test-YOUR_UID-rg' \
     --query defaultHostName --output tsv
   ```

   Stop if hostname retrieval fails or returns empty. Copy the returned hostname
   into this URL, replacing `YOUR_ACTUAL_TEST_HOSTNAME`:

   ```bash
   curl --include --fail-with-body --show-error \
     'https://YOUR_ACTUAL_TEST_HOSTNAME/api/reviews'
   ```

   Expect HTTP 200 with `{ "reviews": [...], "totalCount": ... }`; an empty
   array and zero count are valid at the protocol level, but do not satisfy this
   lab after test seeding. Require recognisable seeded test records and D6's
   test-only title. Compare local dev GET data with the recorded baseline: it
   must be unchanged. Stop and resolve API or target mismatches first; do not
   reseed away the test-only edit.

2. Select the empty fake settings above in `.env`, run `npm run dev`, and open
   Vite's reported URL. Check the reviews page and **+ Add Review** form. The
   list should be empty. Stop Vite, switch to the complete seeded-fake settings
   above and restart `npm run dev`. Confirm sample reviews appear; fake additions
   disappear after a page reload. Both fake modes are required observations in E2.

3. Stop Vite with Ctrl+C and replace the active settings in `.env` with:

   ```dotenv
   VITE_REVIEWS_SERVICE=http
   VITE_USE_SEED_DATA=false
   VITE_REVIEWS_BASE_URL=https://YOUR_ACTUAL_TEST_HOSTNAME/api
   ```

   Restart `npm run dev`. Check the actual browser origin: normally
   `http://localhost:5173`, but Vite may select another port.
   An origin includes scheme, hostname and port, without a path or trailing
   slash. `localhost` and `127.0.0.1` are different origins. The page may load
   while reviews fail to load until CORS is configured; continue to E3's checks
   below. Invalid configuration parsing is a separate issue: check the settings
   rather than changing CORS to fix it.

4. If that origin is not allowed by the Function App, the browser blocks access
   to the response even though the direct GET succeeds. Inspect the browser
   Console and Network panels. If access already works, continue without
   deliberately removing permissions to cause a failure.

5. In another SPA container Bash terminal, select/check the subscription, inspect
   existing CORS settings, then add the exact local origin if needed:

   ```bash
   az account set --subscription 'YOUR_SUBSCRIPTION_ID'
   az account show \
     --query '{subscriptionName:name,subscriptionId:id}' --output table
   az functionapp cors show \
     --name 'YOUR_TEST_FUNCTION_APP' \
     --resource-group 'reviews-test-YOUR_UID-rg'
   LOCAL_ORIGIN='http://localhost:5173' # Replace with the actual browser origin.
   az functionapp cors add \
     --name 'YOUR_TEST_FUNCTION_APP' \
     --resource-group 'reviews-test-YOUR_UID-rg' \
     --allowed-origins "$LOCAL_ORIGIN"
   ```

6. Reload the SPA. In Network, check a successful GET to the **test** Function
   App's `/api/reviews` and compare its response with the displayed reviews.
   Require recognisable seeded test records and D6's test-only title in both the
   response and UI. An empty list does not complete E3. Confirm dev data remains
   unchanged against the recorded baseline.

**Checkpoint — local HTTP integration and CORS:** continue when the browser can
read the seeded test API response and test-only title without a CORS error, after
observing all three modes. Do not infer the adapter from appearance alone; verify
the request URL and response in Network. Repeating hosting step 4's POST-and-refresh
check locally is supplementary; it is not a prerequisite for E3 completion or
publication. The hosted-browser persistence check in F4 remains required.

CORS is a browser access rule, not authentication or endpoint security. It does
not prevent a non-browser client from calling these anonymous endpoints.

## Publish manually to Azure Storage

This procedure publishes the SPA to an Azure Storage static website and connects
it to the existing test API. Use a separate SPA Storage account from the Function
App's hosting storage. Storage may incur charges; keep only resources you need.

### 1. Select the subscription, region and account name

In the repository root, check login and explicitly select the intended
subscription, even if you completed the local CORS procedure earlier:

```bash
az account show --output table
# Only if not signed in:
az login --use-device-code
az account list --output table
az account set --subscription 'YOUR_SUBSCRIPTION_ID'
az account show --query '{subscriptionName:name,subscriptionId:id}' --output table
az account list-locations --query '[].{name:name,displayName:displayName}' --output table

TEST_RESOURCE_GROUP='reviews-test-YOUR_UID-rg'
SPA_REGION='YOUR_REGION'
SPA_STORAGE_ACCOUNT='YOUR_STORAGE_ACCOUNT'
TEST_FUNCTION_APP='YOUR_TEST_FUNCTION_APP'
API_RESOURCE_GROUP='reviews-test-YOUR_UID-rg' # Actual group containing the API.
```

Use a region permitted by your student subscription and course policy; the
location list alone does not prove that your subscription permits provisioning
there. Confirm the region before creating resources. For F1, inspect the dedicated
test group created in D1 before checking the separate SPA account name:

```bash
az group show --name "$TEST_RESOURCE_GROUP" --output json
az resource list --resource-group "$TEST_RESOURCE_GROUP" --output table
```

Stop if the group is unrelated or shared. For standalone use outside the worksheet,
check `az group exists --name "$TEST_RESOURCE_GROUP"` first. If absent, create it
with `az group create --name "$TEST_RESOURCE_GROUP" --location "$SPA_REGION"`,
then inspect it as above. This is recovery guidance, not an extra F1 activity.

Use the separate SPA name pattern `reviewstestYOUR_UIDspa`, replacing `YOUR_UID`
with your actual identifier and checking the resulting length. The Function App's
hosting Storage account must have a different name.

Choose a **globally unique** Storage account name of 3–24 lower-case letters and
digits only, without hyphens or underscores. The placeholder itself is not a
valid account name. Check it before creation:

```bash
az storage account check-name --name "$SPA_STORAGE_ACCOUNT" --output json
```

Continue only when `nameAvailable` is `true`; otherwise choose another valid
name, update `SPA_STORAGE_ACCOUNT`, and repeat the check.

Then create and inspect the separate SPA account:

```bash
az storage account create \
  --name "$SPA_STORAGE_ACCOUNT" \
  --resource-group "$TEST_RESOURCE_GROUP" \
  --location "$SPA_REGION" \
  --sku Standard_LRS \
  --kind StorageV2
az storage account show \
  --name "$SPA_STORAGE_ACCOUNT" \
  --resource-group "$TEST_RESOURCE_GROUP" \
  --query '{resourceName:name,resourceId:id,location:location,kind:kind}' --output json
```

### 2. Enable static website hosting

These Storage commands use the CLI's default key-based behaviour: the CLI uses
your signed-in Azure identity to obtain the necessary account key, assuming your
permissions permit it. Keep Storage keys and all backend credentials out of the
SPA and its `VITE_*` settings.

```bash
az storage blob service-properties update \
  --account-name "$SPA_STORAGE_ACCOUNT" \
  --static-website true \
  --index-document index.html
```

Enabling this feature creates the `$web` container. The main path for this lab is
`/`; this simple setup does not promise direct deep links to nested SPA routes.

### 3. Verify the build target, build and publish

Recheck the repository-root `.env` before building:

```dotenv
VITE_REVIEWS_SERVICE=http
VITE_USE_SEED_DATA=false
VITE_REVIEWS_BASE_URL=https://YOUR_ACTUAL_TEST_HOSTNAME/api
```

Use D6's actual **test** hostname in the URL ending in `/api`. Vite incorporates
these public values into the build; editing `.env` after upload cannot reconfigure
the hosted files. Never put Cosmos keys, Storage keys or other secrets in `VITE_*` values.
If returning from fake mode, ensure there is only one active value for each
setting. Check that no `.env.local`, `.env.production` or shell override selects
a different target.

With dependencies installed using `npm ci`, run:

```bash
npm run build
```

Continue only after the build succeeds. Upload the **contents** of `./dist`
so that `index.html` sits at the root of `$web`:

```bash
az storage blob upload-batch \
  --account-name "$SPA_STORAGE_ACCOUNT" \
  --source ./dist \
  --destination '$web' \
  --overwrite true

SITE_URL=$(az storage account show \
  --name "$SPA_STORAGE_ACCOUNT" \
  --resource-group "$TEST_RESOURCE_GROUP" \
  --query primaryEndpoints.web --output tsv)
printf '%s\n' "$SITE_URL"
```

Single quotes around `'$web'` prevent Bash variable expansion. Use the returned
**static website endpoint**, rather than a blob endpoint or an assumed regional
hostname. Stop if the endpoint is empty or the upload fails.

**Checkpoint — publication:** open `SITE_URL` in the browser and confirm the SPA
page and assets load. API access may still be blocked until the next CORS step.

### 4. Allow the website origin and verify persisted test data

The returned endpoint has a trailing slash; remove it for the exact origin
(scheme and hostname, no path or trailing slash):

```bash
SITE_ORIGIN="${SITE_URL%/}"
az functionapp cors show \
  --name "$TEST_FUNCTION_APP" \
  --resource-group "$API_RESOURCE_GROUP"
az functionapp cors add \
  --name "$TEST_FUNCTION_APP" \
  --resource-group "$API_RESOURCE_GROUP" \
  --allowed-origins "$SITE_ORIGIN"
```

**Checkpoint — hosted CORS:** reload the site and inspect Network. Continue only
when GET `/api/reviews` succeeds against the intended test API and its reviews
appear in the UI. Require recognisable seeded test records and D6's test-only
title in the response and UI; an empty list does not complete F3. Network identifies
the adapter and target. Confirm dev data is unchanged against the recorded baseline.
A successful upload alone does not verify API integration.

Click **+ Add Review**, choose an integer rating from 1 to 5, enter a nonblank
title (at most 200 characters) and a nonblank comment (at most 5000 characters),
then click **Submit Review**. Use a recognisable test title. Network should show POST
`/api/reviews` returning HTTP 201 with `{ review }`; its JSON request contains
`rating`, `title` and `comment`. The server supplies `id` and `createdAt`.

**Checkpoint — persistence:** after the success message, refresh the page and
confirm a fresh GET returns the new review and the UI still displays it. Verify
that both requests use the test Function App and that its backend configuration
uses the test database, not development data. This checks the deployed browser
→ API → database path; fake data would disappear on refresh. Compare development
records with the earlier recorded IDs/data and confirm they are unchanged and the
new hosted review is absent from dev. Do not reseed away the test-only edit.
This is a lightweight checkpoint, not an extra feature or assessed deliverable.

### 5. Redeploy a change

For worksheet F5, make a visible configuration change. Replace the active `.env`
settings with seeded fake, removing/commenting the base URL:

```dotenv
VITE_REVIEWS_SERVICE=fake
VITE_USE_SEED_DATA=true
# VITE_REVIEWS_BASE_URL is absent in fake mode.
```

Check Vite overrides, then rebuild:

```bash
npm run build
```

Only after a successful build, upload again:

```bash
az storage blob upload-batch \
  --account-name "$SPA_STORAGE_ACCOUNT" \
  --source ./dist \
  --destination '$web' \
  --overwrite true
```

Refresh the hosted site. Confirm fake records appear and Network sends no Reviews
API requests. Restore the HTTP/test settings, with seed false and D6's actual test
hostname:

```dotenv
VITE_REVIEWS_SERVICE=http
VITE_USE_SEED_DATA=false
VITE_REVIEWS_BASE_URL=https://YOUR_ACTUAL_TEST_HOSTNAME/api
```

Check overrides and rebuild again:

```bash
npm run build
```

Only after this build succeeds, upload again:

```bash
az storage blob upload-batch \
  --account-name "$SPA_STORAGE_ACCOUNT" \
  --source ./dist \
  --destination '$web' \
  --overwrite true
```

Refresh and verify a successful GET to the intended test `/api/reviews`, D6's
test-only title and the persisted review posted in F4. Update CORS if the website
origin changes. Configuration changes require rebuilds; try a hard refresh or
disable browser caching in DevTools if the old build appears.
`--overwrite true` replaces matching uploaded blobs; it does **not** delete stale
blobs or provide a production release/synchronisation system.

### 6. Clean up safely

For worksheet H1, save API and SPA work in their separate private repositories.
Inspect Git status and diff for credentials and working settings before committing
and pushing only intended changes. Record non-secret resource names, actual URLs,
target IDs, observed checks, failure/recovery notes and your next assessment action.
Stop local API and Vite servers with Ctrl+C; this does not remove cloud resources
or retained-data charges.

H2 removes the separately verified disposable dev and test groups after checks are
complete. Group deletion removes every resource and its data, including Cosmos,
the Function App, both Storage accounts and monitoring resources. Keep assessment,
shared, unrelated and unfinished resources. If a group is mixed or its contents
are unexpected, stop and discuss removing only disposable items with your tutor.
No Week 5 example resource must be retained for later weeks.

In a new Bash terminal, check login and set the actual identifiers again. Replace
every placeholder; do not rely on variables left over from another session.
Select/check the subscription in the Azure Portal too and inspect both groups:

```bash
az account show --output table
# Only if not signed in:
az login --use-device-code
az account list --output table
az account set --subscription 'YOUR_SUBSCRIPTION_ID'
az account show --query '{subscriptionName:name,subscriptionId:id}' --output table
DEV_RESOURCE_GROUP='reviews-dev-YOUR_UID-rg'
TEST_RESOURCE_GROUP='reviews-test-YOUR_UID-rg'
SPA_STORAGE_ACCOUNT='YOUR_STORAGE_ACCOUNT'
az group show --name "$DEV_RESOURCE_GROUP" \
  --query '{resourceGroupName:name,resourceGroupId:id,location:location}' --output table
az resource list --resource-group "$DEV_RESOURCE_GROUP" \
  --query '[].{resourceName:name,resourceType:type,resourceId:id}' --output table
az group show --name "$TEST_RESOURCE_GROUP" \
  --query '{resourceGroupName:name,resourceGroupId:id,location:location}' --output table
az resource list --resource-group "$TEST_RESOURCE_GROUP" \
  --query '[].{resourceName:name,resourceType:type,resourceId:id}' --output table
```

Stop on any error or unexpected subscription, identity or contents. The aliased
query names keep IDs/types visible in Azure CLI table output. Inspect retained
Cosmos data as well as the resource list before deciding what is disposable.

**Lab completion — disposable dev and test groups:** only after confirming that
all checks are complete and the exact dev group and every item in it are
disposable, run without `--yes`. Read the CLI confirmation and accept only if it
matches that decision:

```bash
az group delete --name "$DEV_RESOURCE_GROUP"
```

Wait for the command to finish. Separately confirm that the exact test group and
all its contents are disposable; inspect its identity and contents again before
its deletion:

```bash
az group show --name "$TEST_RESOURCE_GROUP" \
  --query '{resourceGroupName:name,resourceGroupId:id,location:location}' --output table
az resource list --resource-group "$TEST_RESOURCE_GROUP" \
  --query '[].{resourceName:name,resourceType:type,resourceId:id}' --output table
```

Only after confirming that this exact group and every item in it are disposable,
run without `--yes` and read the CLI confirmation before accepting:

```bash
az group delete --name "$TEST_RESOURCE_GROUP"
```

Wait for deletion to finish, then verify removal of both groups:

```bash
az group exists --name "$DEV_RESOURCE_GROUP"
az group exists --name "$TEST_RESOURCE_GROUP"
```

Expect `false` from each check. Resolve errors rather than interpreting them as
successful cleanup. If individual disposable items were removed from a mixed
group with tutor help, verify those are gone and required resources remain.
Record what you retain and why, monitor costs and return to cleanup once checks
are complete. Recreate and configure resources before repeating cloud checks
after deletion.

**Standalone alternative — SPA account only:** if the test API/data are still
needed, inspect the account identity and contents first. This alternative does not
complete the lab's H2 group cleanup; return to it once checks finish. Confirm
this is the separate SPA account, never the Function App's hosting account:

```bash
az storage account show \
  --name "$SPA_STORAGE_ACCOUNT" --resource-group "$TEST_RESOURCE_GROUP" \
  --query '{resourceName:name,resourceId:id,web:primaryEndpoints.web}' --output json
az storage container list --account-name "$SPA_STORAGE_ACCOUNT" \
  --query '[].name' --output table
az storage blob list --account-name "$SPA_STORAGE_ACCOUNT" \
  --container-name '$web' --query '[].{blobName:name}' --output table
```

If other containers exist, inspect their contents before deciding. Account deletion
removes all of its data. Once you have confirmed that everything in this account
is disposable, run the following without `--yes` and read the CLI confirmation
prompt before accepting:

```bash
az storage account delete \
  --name "$SPA_STORAGE_ACCOUNT" --resource-group "$TEST_RESOURCE_GROUP"
```

Verify removal after the command succeeds:

```bash
az storage account list --resource-group "$TEST_RESOURCE_GROUP" \
  --query "[?name=='$SPA_STORAGE_ACCOUNT'].{resourceName:name,resourceId:id}" --output json
az group exists --name "$TEST_RESOURCE_GROUP"
```

Expect `[]` for the account query and `true` for the retained group. A failed
query or permission error is not evidence of removal.

The
[API README's safe cleanup](https://github.com/tpdavison/cis3039-reviews-api/blob/main/readme.md#safe-cleanup)
provides further context. Keep the repository and notes; cleanup here concerns
cloud resources.

## Troubleshooting manual deployment

| Symptom | Check and recovery |
| --- | --- |
| Direct API GET works; browser is blocked | Compare the browser's exact origin with the test Function App CORS allow-list. Allow that origin, then reload. |
| SPA still shows fake data | Check `.env` mode and remove the base URL in fake mode. For HTTP, set the test base URL and seed false; restart Vite locally or rebuild and upload the hosted site. Inspect Network requests. |
| Site hosts an old version | Rebuild successfully, upload with `--overwrite true`, and refresh. Try a hard refresh or disable browser caching in DevTools. |
| SPA calls the wrong API | Inspect `VITE_REVIEWS_BASE_URL` and environment overrides before rebuilding and republishing. |
| Storage creation or upload fails | Check subscription, valid/available name, permitted region, permissions to list Storage keys, and the quoted `'$web'` destination. Report permission failures separately before continuing. |
| A nested route returns 404 on direct navigation | Use `/` for this lab. Nested deep links need separately verified hosting configuration. |

CLI references: [Storage account](https://learn.microsoft.com/en-us/cli/azure/storage/account),
[static website properties](https://learn.microsoft.com/en-us/cli/azure/storage/blob/service-properties#az-storage-blob-service-properties-update),
[upload-batch](https://learn.microsoft.com/en-us/cli/azure/storage/blob#az-storage-blob-upload-batch),
[resource groups and cleanup](https://learn.microsoft.com/en-us/cli/azure/group)
and [Function App CORS](https://learn.microsoft.com/en-us/cli/azure/functionapp/cors#az-functionapp-cors-add).
