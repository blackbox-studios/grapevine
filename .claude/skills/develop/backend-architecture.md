# Backend Architecture

The API contract and the server layer that implements it. Every endpoint under
`src/app/api/**` follows this document, and `src/lib/api.js` is written against it. If
something here is ambiguous, that is a bug in this document — fix it here first, then in
code.

Read `native-architecture.md` alongside this: the API's shape is constrained by the fact
that the same codebase also ships as a static export with no server at all.

---

## 0. Where the API lives, and the one trick that makes it possible

The API is a tree of **Next route handlers** under `src/app/api/**`, served by the Node
build — the same process that serves the app. No separate Express server, no second
deployment, no CORS.

That works for the web target and cannot work for the native one. A Capacitor WebView has
no Node process, so `output: "export"` emits no route handlers. Worse, it does not simply
skip them: the export **fails the build** with `export const dynamic = "force-static"/
export const revalidate not configured on route "/api/..."`, and `force-static` is
incompatible with reading a query param or serving a `POST` — i.e. with the API working at
all.

The seam is one line of `next.config.mjs`:

```js
pageExtensions: native ? ["jsx", "js"] : ["api.js", "jsx", "js"],
```

Handlers are named **`route.api.js`**, not `route.js`. `api.js` is only a recognized page
extension in the Node build, so the entire `src/app/api/**` tree is *invisible* to the
export — not stubbed, not empty, simply not a route. Verified: the Node build lists five
`ƒ /api/...` routes; the native export lists none and `out/` contains no `api/`.

**Consequences you must respect:**

- **A new handler must be `route.api.js`.** Name it `route.js` and the native build breaks
  the moment someone runs it — which may be days later, in CI, on a release.
- **The native app cannot use same-origin `/api`.** It must be pointed at a deployed
  instance by absolute URL: `NEXT_PUBLIC_API_BASE_URL=https://synaxis.chat/api`. `API_BASE`
  in `lib/constants.js` falls back to same-origin `/api` for the web.
- **Nothing in `src/app/api/**` may be imported by app code.** The client talks HTTP
  through `lib/api.js`, always. Import a service directly from a component and it works in
  dev, works in `npm run build`, and disappears in the native bundle.

---

## 1. Principles

1. **HTTP is the envelope.** The status code carries success or failure. There is no
   `{ success: true }` field in the body, ever.
2. **Success bodies are the resource.** No wrapper key on a single resource.
3. **Failure bodies have exactly one shape.** See §4.
4. **Error `code` values are part of the public API.** The client branches on them.
   Renaming one is a breaking change; `message` is free to change at any time.
5. **`Content-Type: application/json` on every response with a body.**

---

## 2. Success responses

| Situation | Status | Body |
|---|---|---|
| Fetched one resource | `200` | the resource object |
| Created a resource | `201` | the created resource, plus a `Location` header |
| Updated a resource | `200` | the updated resource |
| Deleted a resource | `204` | *(empty)* |
| Fetched a collection | `200` | `{ "items": [...], "nextCursor": string \| null }` |

Use the helpers in `lib/server/respond.js` — `sendResource`, `sendCreated`,
`sendCollection`, `sendNoContent` — never a hand-rolled `Response.json`. That is what keeps
the shapes uniform.

### Collections

A collection is **always an object, never a bare array**, even where pagination looks
unnecessary today. Adding a key to an object is non-breaking; turning an array into an
object is not.

```http
GET /api/feed?limit=5
```

```json
200 OK

{
  "items": [ { "id": "post-001", "…": "…" } ],
  "nextCursor": "eyJvZmZzZXQiOjV9"
}
```

`nextCursor` is `null` at the end of the collection, and that is the **only**
end-of-collection signal. There is no total count, no `hasMore`, no page number. The
client derives `hasMore` from it (`nextCursor !== null`) and must treat the cursor as an
opaque string — never parse it.

### Conventions

- **Timestamps** — ISO 8601, UTC, `Z` suffix.
- **IDs** — strings.
- **Absent vs. null** — `null` means "known to be empty"; an omitted key means "not
  applicable to this representation". Not interchangeable.
- **Casing** — the seed corpus uses `snake_case` for `created_at` and camelCase elsewhere
  (`likedBy`, `nextCursor`). That inconsistency is inherited from the original mock data,
  and it is the one place this contract is not clean. **New fields are camelCase.** When a
  real database lands, rename `created_at` → `createdAt` in one pass across the seed, the
  services, and the components that read it.

---

## 3. Status codes in use

| Code | Meaning | Error `code` |
|---|---|---|
| `400` | Malformed or invalid input | `VALIDATION_FAILED` |
| `401` | No or invalid credentials | `UNAUTHENTICATED` |
| `403` | Authenticated, not permitted | `PERMISSION_DENIED` |
| `404` | Resource does not exist | `NOT_FOUND` |
| `409` | Conflicts with current state | `CONFLICT` |
| `429` | Rate limited | `RATE_LIMITED` |
| `500` | Unhandled server fault | `INTERNAL` |
| `503` | Dependency unavailable | `UNAVAILABLE` |

Prefer `404` over `403` where revealing existence would itself leak information.

---

## 4. Error responses

Every non-2xx response has this body and no other:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Comment text is required.",
    "fields": { "text": "Required" },
    "requestId": "req_r4zdbd9p"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `code` | yes | `SCREAMING_SNAKE_CASE`. Stable. Machine-readable. |
| `message` | yes | Human-readable, safe to show, single sentence. |
| `fields` | no | `VALIDATION_FAILED` only. Field path → message. |
| `requestId` | yes | Echoes `X-Request-Id`. Carried on the thrown `ApiError`; currently only logged server-side, so surface it on a 5xx screen if you build one. |
| `retryAfter` | no | Seconds. On `429`/`503`. Mirrors the `Retry-After` header. |

Rules:

- `error` is a **single object**, not an array. Multiple field problems go in `fields`.
- On `500`, `message` is always generic. `handler.js` guarantees this: anything that isn't
  an `AppError` is logged in full server-side and reduced to `INTERNAL` on the wire, so an
  exception message, stack, or database error can never reach a client.
- No `error` key on a 2xx; no resource fields on a 4xx/5xx.

### The registry

Codes are hardcoded in exactly **two** places, and they are two halves of one contract:

- `ERROR_CODES` + `ERROR_STATUS` in `lib/server/errors.js` (server)
- `ERROR_CODES` in `lib/constants.js` (client)

Add, rename, or remove a code in **both**, plus §3 above, in the same change — otherwise
the client branches on a string the server never sends. The client copy additionally
carries `NETWORK`, which no server sends: `lib/api.js` throws it when the request never
completed (offline, DNS, CORS, aborted connection).

---

## 5. Endpoints

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/feed?limit=&cursor=` | `{ items, nextCursor }` — the dashboard feed, newest first |
| `GET` | `/api/posts/:postId` | the post resource |
| `GET` | `/api/posts/:postId/comments?limit=&cursor=` | `{ items, nextCursor }` |
| `POST` | `/api/posts/:postId/comments` | `201` + the created comment, `Location` set |
| `POST` | `/api/posts/:postId/likes` | `{ liked, likes }` — toggles the viewer's like |
| `POST` | `/api/comments/:commentId/likes` | `{ liked, likes }` |

Two things about these are load-bearing rather than incidental:

**`GET /api/posts/:postId` is what frees post ids from build time.** It is the reason there
is no `app/(protected)/p/[postId]/` route and no `generateStaticParams` anywhere near
posts. Detail is fetched at runtime, on open, by id (`lib/store/post/store.js` → `load`) — so
the corpus can be millions of UUIDs minted a second ago. See **Dynamic routes at scale** in
`native-architecture.md`.

**The like endpoints return `{ liked, likes }` rather than `204`.** An optimistic client
needs the authoritative result to reconcile against; returning nothing would force it to
re-fetch the post to find out what actually happened. Toggle endpoints should always return
the resulting state.

---

## 6. Server layout

```
src/lib/server/            # all server-only, all behind `import "server-only"`
  errors.js                # ERROR_CODES + ERROR_STATUS registry, AppError, notFound(), invalid()
  handler.js               # route() wrapper (request id, error serialization, headers), pageParams()
  respond.js               # success responders (§2)
  cursor.js                # encodeCursor / decodeCursor / paginate
  posts.service.js         # business logic — the seam Prisma replaces
  seed.js                  # the mock "database": FEED + COMMENTS, mutated in place

src/app/api/
  feed/route.api.js
  posts/[postId]/route.api.js
  posts/[postId]/comments/route.api.js
  posts/[postId]/likes/route.api.js
  comments/[commentId]/likes/route.api.js
```

Every file in `lib/server/` starts with `import "server-only"`. That turns "this leaked
into the client bundle" from a silent regression into a build error — which matters most
for `seed.js`, since shipping the whole corpus to the browser would defeat the entire
exercise.

### Layering

```
route.api.js   →  wrapped in route(); read the request, call a service, hand the result
                  to a respond.js helper. No logic, no error handling.
service        →  all business logic and data access. Throws AppError. Never sees a
                  Request or a Response.
```

A handler is three lines because everything else is in the wrapper or the service:

```js
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const { postId } = await params
    const { items, nextCursor } = await listComments(
        postId,
        pageParams(request, { fallback: PAGE_SIZE.COMMENTS }),
    )
    return sendCollection(items, nextCursor)
})
```

Rules:

- **Every handler is wrapped in `route()`.** An unwrapped one leaks stack traces on a 500
  and skips the `X-Request-Id` and `Cache-Control` headers. A route handler has no
  middleware chain, so `route()` *is* the chain: it is `catchAsync` + `requestId` +
  `errorHandler` in one function.
- **Every handler exports `dynamic = "force-dynamic"`.** Everything here is per-viewer and
  mutable; nothing may be cached or pre-rendered.
- **Never hand-roll a failure response.** Throw `notFound(...)` / `invalid(...)` / a raw
  `AppError` and let `route()` serialize it.
- **`params` is a promise** in Next 15 — `await params` before reading it.
- **Read pagination through `pageParams`**, which clamps `limit` so a client can't ask for
  the whole table in one call.

### Mocked latency

Reads await `mockDelay(MOCK_LATENCY_MS)` (1000ms) inside the service; writes use
`MOCK_WRITE_LATENCY_MS` (300ms) so an optimistic mutation reconciles promptly.

The latency lives **on the server** because that is where a real backend's latency lives.
It doubles as the guaranteed minimum skeleton duration: no read resolves faster than a
second, so a loading state is always on screen long enough to read and there is no
sub-perceptual flash to debounce away.

> **Stores must not add a floor of their own.** The old
> `Promise.all([api.get(...), mockDelay(MOCK_LATENCY_MS)])` pattern is obsolete — the floor
> is in the response now, and racing it again just doubles every load.

---

## 7. Client expectations

The app talks to the API through `src/lib/api.js`, and only from a store (see
**Layered Architecture** in `frontend-architecture.md`). Nothing inspects `res.ok` or
`res.status`.

- Any non-2xx is thrown as an `ApiError` carrying `code`, `message`, `fields`, `requestId`,
  `status`.
- A network-level failure is thrown as an `ApiError` with `code: "NETWORK"`.
- `204` resolves to `null`.
- Branch on `error.code`, never on `error.message`.

A store parks the failure in its `error` state via `toErrorList(error, fallback)`
(`lib/utils.js`), which normalizes it into the string list `useErrorListener` toasts.

```js
try {
    const { items, nextCursor } = await api.get(API_ENDPOINTS.FEED, {
        params: { limit: PAGE_SIZE.FEED },
    })
    // …
} catch (error) {
    set(state => { state.error.list = toErrorList(error, 'Could not load the feed.') })
}
```

**Don't toast what the UI already says.** The `post` store's `load` swallows a `NOT_FOUND`
because the surface renders a "Post not found" state, and swallows every error when a cached
copy is already on screen — a failed background refresh of something readable is not worth
interrupting the reader for.

### Optimistic writes

Likes and new comments apply on the current frame, then reconcile. The shape, every time:

1. **Snapshot** what is there now (`wasLiked`, `wasLikes`) — don't assume the inverse.
2. **Apply** the guess to *every* copy of the entity. A post can be on screen twice, since
   the open overlay sits on the live feed, so a write that moves one copy makes the two
   visibly disagree.
3. **Reconcile** with the server's authoritative `{ liked, likes }` (or, for a comment, swap
   the temporary id for the created resource).
4. **On failure, restore the snapshot** and park the error.

Reference: `toggleLike` in `lib/store/post/store.js`, `add`/`toggleLike` in
`lib/store/comments/store.js`.

---

## 8. Checklist for a new endpoint

- [ ] File is named `route.api.js` (not `route.js`)
- [ ] `export const dynamic = "force-dynamic"`
- [ ] Handler wrapped in `route()`; body is read-request → call-service → `respond.js`
- [ ] Logic lives in a service that throws `AppError` and never touches a `Response`
- [ ] Success status is the most specific correct one (`201`, `204` — not `200` for everything)
- [ ] Collection responses are `{ items, nextCursor }` via `sendCollection`
- [ ] A toggle/mutation returns the resulting state, so a client can reconcile
- [ ] Any new error code added to §3 **and** both `ERROR_CODES` objects
- [ ] Endpoint added to `API_ENDPOINTS` in `lib/constants.js` — no URL built by hand
- [ ] No 500 path can leak an internal message
- [ ] `npm run build:native` still succeeds and emits no `api/` in `out/`

---

## 9. Implementation map

| Concern | File |
|---|---|
| Error codes → status registry, `AppError` | `src/lib/server/errors.js` |
| Error serialization, request id, response headers | `src/lib/server/handler.js` → `route()` |
| Success responders | `src/lib/server/respond.js` |
| Pagination cursors | `src/lib/server/cursor.js` |
| Business logic (the Prisma seam) | `src/lib/server/posts.service.js` |
| Mock data / "database" | `src/lib/server/seed.js` |
| Mocked latency constants | `MOCK_LATENCY_MS`, `MOCK_WRITE_LATENCY_MS` in `src/lib/constants.js` |
| Client wrapper + `ApiError` | `src/lib/api.js` |
| Endpoint + page-size registry | `API_ENDPOINTS`, `PAGE_SIZE` in `src/lib/constants.js` |
| Native/Node route split | `pageExtensions` in `next.config.mjs` |
| Toast/logging listener | `src/lib/hooks/useErrorListener.hook.jsx` |

---

## 10. Wiring in a real database

Nothing above `posts.service.js` should change. The migration, in order:

1. **Model the domain** in `prisma/schema.prisma`; `npm run prisma:migrate`.
2. **Replace the service bodies** with `prisma` queries (`src/lib/db.js` is the client
   singleton, already wired and idle). Keep the signatures and the thrown `AppError`s.
3. **Replace `paginate`** with a real query. Keyset beats offset: encode
   `{ createdAt, id }` in the cursor and use `take` + `cursor`. The cursor is opaque by
   contract, so this is a server-only change — no client edit, no version bump.
4. **Delete the latency awaits** from the service, and with them the two `MOCK_*` constants.
   Check the skeleton behaviour afterwards: a fast local database resolves in single-digit
   milliseconds, and every loading state in the app was tuned against a 1000ms floor.
5. **Delete `seed.js`** (or move it to `prisma/seed.js` as real seed data).
6. **Add validation.** Bodies are currently checked by hand (`addComment` trims and
   rejects empty text). Once there is more than one write worth guarding, put Zod schemas
   in front of them and map failures onto `invalid(...)` — the same Zod the forms use.
7. **Then, and only then**, revisit auth. `DATABASE_URL` is the only env var this needs;
   read `auth-architecture.md` and the "Adding a library" section of
   `native-architecture.md` first, because the static export is what makes an auth SDK
   hard here.

---

## Appendix: lineage

This contract is a trimmed-down version of the one used by a sibling Node/Express project,
which in turn simplifies established public guidance:

- **Google AIP-193 (Errors)** — `https://google.aip.dev/193`. Source of the
  stable-machine-readable-reason idea; our `code` is a flattened `ErrorInfo.reason`.
- **Google AIP-158 (Pagination)** — `https://google.aip.dev/158`. Source of the
  opaque-cursor and null-cursor-means-end rules.
- **RFC 9457, Problem Details for HTTP APIs** — worth adopting verbatim if this API ever
  gains third-party consumers.
- **Zalando RESTful API Guidelines** — the most readable full ruleset if this document
  needs to grow.
