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
export — not stubbed, not empty, simply not a route. Verified: the Node build lists nine
`ƒ /api/...` routes; the native export lists none and `out/` contains no `api/`.

**Consequences you must respect:**

- **A new handler must be `route.api.js`.** Name it `route.js` and the native build breaks
  the moment someone runs it — which may be days later, in CI, on a release.
- **The native app cannot use same-origin `/api`.** It must be pointed at a deployed
  instance by absolute URL: `NEXT_PUBLIC_API_BASE_URL=https://throughgrapevine.com/api`. `API_BASE`
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
- **Casing** — camelCase, everywhere, no exceptions. The old `created_at` holdover from
  the mock corpus was renamed to `createdAt` across the wire, the services, and the
  components when Postgres landed. The only remaining snake_case is inside
  `prisma/seed-data.js`, which is a frozen fixture the seed script translates — it is not
  on the wire.

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

| Method | Path | Auth | Returns |
|---|---|---|---|
| `GET` | `/api/me` | viewer | the viewer: profile, vocation, role, groups |
| `POST` | `/api/me/onboarding` | viewer | the updated viewer — first-run orientation, all fields at once |
| `GET` | `/api/me/onboarding/handle?value=` | viewer | `{ handle, available, reason }` — advisory @handle check |
| `GET` | `/api/orgs` | viewer | `{ items, nextCursor }` — the viewer's groups |
| `GET` | `/api/orgs/:orgId/members` | **group admin** | `{ items, nextCursor }` — the roster |
| `GET` | `/api/feed?limit=&cursor=&orgId=` | viewer | `{ items, nextCursor }` — the viewer's feed, newest first. `orgId` narrows it to one group and is checked with `requireMembership`, so it can only subtract from the viewer's own scope; omitted, the feed is the union of every approved membership |
| `POST` | `/api/uploads` | viewer (per purpose) | `{ bucket, path, token, url }` — permission to upload one file |
| `POST` | `/api/posts` | **group admin** | `201` + the created post, `Location` set |
| `GET` | `/api/posts/:postId` | member of its group | the post resource |
| `DELETE` | `/api/posts/:postId` | **admin of its group** | `204` |
| `GET` | `/api/posts/:postId/comments?limit=&cursor=` | member of its group | `{ items, nextCursor }` — the viewer's own comments first, then the thread oldest-first |
| `POST` | `/api/posts/:postId/comments` | member of its group | `201` + the created comment, `Location` set |
| `POST` | `/api/posts/:postId/likes` | member of its group | `{ liked, likes }` — toggles the viewer's like |
| `DELETE` | `/api/comments/:commentId` | its author, **or** an admin of the post's group | `204` |
| `POST` | `/api/comments/:commentId/likes` | member of its group | `{ liked, likes }` |
| `GET` | `/api/notifications?limit=&cursor=` | viewer | `{ items, nextCursor }` — the viewer's notifications, newest first |
| `GET` | `/api/notifications/unread` | viewer | `{ unread }` — the number the bell's dot stands for |
| `POST` | `/api/notifications/read` | viewer | `{ unread }` — marks them all read, so this is always `0` |

**Every endpoint is authenticated.** There is no anonymous read anywhere, and there must
not be one — the app is invite-only and its content is a parish's private life. See
`auth-architecture.md`.

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

**Deleting a comment is authorized on two rules that are deliberately not merged** — a
person owns what they wrote, and an admin moderates the group they administer. The second
is per-group, resolved from the membership that authorized reading the parent post, so
administering a diocese grants nothing over a parish's threads. The comment projection
ships the composed answer as `canDelete` so a row does not have to re-derive a rule the
server would enforce differently. It is a **soft** delete: `deletedAt` is stamped, which is
what every read already filters on.

**Deleting a post is one rule, not two, and authorship is not it.** A comment is a person
speaking; a post is the group speaking, so the answer is the same as "may you publish here"
— ADMIN of the post's organization. Any admin may remove any other admin's post (a parish
with two priests needs that), and an admin whose role is revoked can no longer remove even
their own. `projectPost` ships it as `canDelete`, which is also what decides whether the
options menu is offered at all. Soft, like a comment's, and it deliberately leaves the media
in storage — the row still points at it, and a restore that has lost its photos is not one.

**Notifications are addressed to a person, not scoped to a group, and that is the one place
this app's scoping rule does not apply.** Every other read narrows to the viewer's
memberships or to the selected group; `listNotifications` filters on `recipientId` and
nothing else, because a like on something you wrote in a parish you are not currently
reading still happened to you. There is no `orgId` parameter and there should not be one.
The viewer is also the only scope a caller could not widen — a notification names exactly
one recipient — so no `requireMembership` is involved.

**The tally and the list are two endpoints on purpose.** They are asked at completely
different rates: the bell needs `unread` on every boot for every viewer, while the list is
wanted only when somebody opens the panel. Folding the count into the collection response
would load and project a page of rows on every sign-in to decide whether to draw a dot.

**Writing a notification is a builder, not a write.** `notifyLike` / `unnotifyLike` in
`notifications.service.js` *return* a Prisma operation, which the like toggles splice into
the `$transaction([...])` they were already running — so the notification commits with the
like that justifies it and costs no additional round trip. `notifyNewPost` is the exception
and takes a transaction client instead, because its rows need the id of the post created
alongside them; that is the same dependency that earns `deleteComment` its interactive
transaction. A post's notification is also a **fan-out**: one row per approved member of the
group. See that file's header, which also carries the game plan for grouping ("Mat. Carly and
9 others") as a read-side change.

**`POST /api/uploads` grants permission; it does not receive a file.** It answers a signed
upload URL and the client sends the bytes straight to Supabase Storage, so a parish photo
never passes through the Node process. The client states a *purpose* (`POST_MEDIA`,
`AVATAR`) and never a path — that is what makes it impossible to write into another group's
folder or over an existing object — and the permission checked is the same one the write the
file is destined for would check, applied *before* the upload so a refusal cannot leave an
orphan. It answers `200`, not `201`: nothing has been created yet, and may never be. See
`lib/server/storage.js` for why the bucket is public-read and what would have to change to
put photos back inside the membership gate.

---

## 6. Server layout

```
src/lib/server/            # all server-only, all behind `import "server-only"`
  errors.js                # ERROR_CODES + ERROR_STATUS registry, AppError, notFound(), invalid()
  handler.js               # route() wrapper (request id, CORS, error serialization), pageParams()
  respond.js               # success responders (§2)
  cursor.js                # opaque cursors + the keyset helpers (§6.1)
  auth.js                  # requireViewer / requireMembership / readableOrgIds
  supabase.js              # server Supabase clients (anon for verification, service role)
  storage.js               # the bucket, object paths, and signed upload URLs
  projections.js           # database rows → wire shapes
  posts.service.js         # posts, comments, likes
  profile.service.js       # the viewer, their groups, a group's roster
  notifications.service.js # the panel behind the bell, and the writes that fill it
  uploads.service.js       # purpose → permission + destination

src/app/api/
  me/route.api.js
  uploads/route.api.js
  orgs/route.api.js
  orgs/[orgId]/members/route.api.js
  feed/route.api.js
  posts/route.api.js                       # POST — publish
  posts/[postId]/route.api.js
  posts/[postId]/comments/route.api.js
  posts/[postId]/likes/route.api.js
  comments/[commentId]/route.api.js         # DELETE
  comments/[commentId]/likes/route.api.js
  notifications/route.api.js                # GET — the panel's page
  notifications/unread/route.api.js         # GET — the bell's tally
  notifications/read/route.api.js           # POST — mark them all read
```

`projections.js` is the boundary between the schema and the contract. A Prisma model handed
straight to `Response.json` publishes every column ever added to it, including ones added
later by someone who never read this document — so every field the client receives is
listed there by hand. It also absorbs the naming differences (`likeCount` → `likes`,
`Comment.body` → `text`, normalized `PostMedia` rows → `image`/`images`/`document`), which
is what lets a column be renamed without touching a component.

Every file in `lib/server/` starts with `import "server-only"`. That turns "this leaked
into the client bundle" from a silent regression into a build error — which matters most
for `db.js` and `supabase.js`: pulling Prisma or the service role key into the client
bundle would be a serious leak, and `server-only` makes it a build error instead of a
silent one.

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
    const viewer = await requireViewer(request)
    const { postId } = await params
    const { items, nextCursor } = await listComments(
        viewer,
        postId,
        pageParams(request, { fallback: PAGE_SIZE.COMMENTS }),
    )
    return sendCollection(items, nextCursor)
})
```

Rules:

- **Every handler starts with `requireViewer(request)`** and passes the resulting viewer
  into the service. Services take a viewer as their first argument and scope their queries
  by it — there is no "list all posts" function, and adding one would defeat the whole
  access model. Group-scoped writes additionally call
  `requireMembership(viewer.id, orgId, { role })`.
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

### Latency

There is none to fake in the API. The service layer's `mockDelay(MOCK_LATENCY_MS)` awaits
went away with the mock corpus; every read is now a real query over a real connection, and
after the round-trip cuts above a warm feed page answers in about a third of a second.

`MOCK_LATENCY_MS` still exists in `lib/constants.js` for exactly one consumer — the `app`
store, whose dashboard surface has no endpoint yet and would otherwise resolve in zero
milliseconds and flash its skeleton. When that domain gets one, the constant and
`lib/mock.js`'s `mockDelay` go with it.

**A store with an endpoint must not add a floor.** That was true when a read took a second
and it is more true now that one takes 0.3s: a floor would be the slowest thing in the
request, and it would be spending the round trips this layer was just rewritten to save.

> **Stores must still not add a floor of their own.** If a skeleton flashes because a query
> is genuinely fast, that is a UI timing problem to solve in the transition, not a reason to
> slow the API down.

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
- [ ] Starts with `await requireViewer(request)`; the viewer is the service's first argument
- [ ] The service scopes its query by that viewer, or calls `requireMembership` for a
      group-scoped read/write — an unauthorized row must never be loaded, not merely
      filtered out afterwards
- [ ] Anything new the client can see is listed in `lib/server/projections.js`
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
| Opaque cursors + keyset helpers | `src/lib/server/cursor.js` |
| Authentication + authorization | `src/lib/server/auth.js` |
| Server Supabase clients | `src/lib/server/supabase.js` |
| Storage bucket, object paths, signed uploads | `src/lib/server/storage.js` |
| Upload permission by purpose | `src/lib/server/uploads.service.js` |
| Bucket provisioning (`npm run storage:setup`) | `scripts/setup-storage.mjs` |
| Rows → wire shapes | `src/lib/server/projections.js` |
| Posts, comments, likes | `src/lib/server/posts.service.js` |
| Viewer, groups, roster | `src/lib/server/profile.service.js` |
| Notifications, and the builders that write them | `src/lib/server/notifications.service.js` |
| Prisma client singleton | `src/lib/db.js` |
| Schema / domain model | `prisma/schema.prisma` |
| Seed script + frozen fixture | `prisma/seed.js`, `prisma/seed-data.js` |
| Remaining mock latency (the `app` store only) | `MOCK_LATENCY_MS` in `src/lib/constants.js` |
| Client wrapper + `ApiError` | `src/lib/api.js` |
| Endpoint + page-size registry | `API_ENDPOINTS`, `PAGE_SIZE` in `src/lib/constants.js` |
| Native/Node route split | `pageExtensions` in `next.config.mjs` |
| Toast/logging listener | `src/lib/hooks/useErrorListener.hook.jsx` |

---

## 10. The database

Postgres, on Supabase, through Prisma. `prisma/schema.prisma` is the domain; read its
header before changing anything, because two decisions there carry most of the design
(permission vs vocation as separate axes, and access as a membership row rather than a
flag).

### Connections

Two URLs, and the split is required rather than an optimization:

| Var | Port | Used by | Why |
|---|---|---|---|
| `DATABASE_URL` | 5432 | the app at runtime | Supabase's **session** pooler. One long-lived Node server with a bounded Prisma pool, so it gets prepared statements and one round trip per query. |
| `DIRECT_URL` | 5432 | `prisma migrate` only | Migrate takes advisory locks and issues DDL, neither of which survives a transaction pooler. Point migrations at 6543 and they hang or fail with prepared-statement errors. |

**Why not the transaction pooler (6543).** It hands out a connection per statement, so
Prisma must disable named prepared statements (`?pgbouncer=true`) and wrap *every single
query* in its own transaction: `BEGIN`, `DEALLOCATE ALL`, the `SELECT`, `COMMIT` — four
round trips to run one. Measured on one page of comments: 23 statements / 1.28s through
6543 against 8 statements / 0.59s through 5432, identical SQL. Session mode is correct
here **because of how this deploys** — `next start`, one process. If this app ever moves
to serverless functions or the edge, where each invocation opens its own connection, it
must go back to 6543 with `?pgbouncer=true`; that is what transaction mode is for.

### Round trips are the cost, not the SQL

Every statement pays a full network round trip, and against a pooler in another region
that is tens of milliseconds against a query that runs in under one. The rule that follows:
**count statements, not query complexity.** Three things enforce it —

- **`relationLoadStrategy: "join"`** (the `JOIN` constant in `posts.service.js`, enabled by
  `previewFeatures = ["relationJoins"]`). Prisma's default issues one `SELECT` per
  `include` and stitches the rows in the client — a feed page was six statements. `join`
  compiles the same shape into one statement with lateral joins. Use it on any read that
  fans out; a write's `include` is one row's relations and not worth the thought.
- **The viewer snapshot.** `requireViewer` loads the Profile *and* its memberships in one
  statement, and `requireMembership` / `membershipIn` / `readableOrgIds` / `getViewer` /
  `listOrgs` all read it in memory. Nothing may re-query the viewer's own memberships.
- **Local token verification** (`jose` against the project JWKS), so an authenticated read
  makes no HTTP call to Supabase at all. See auth-architecture.md.

Together those took a warm `/api/posts/:id/comments` from 1.9s to 0.44s, and `/api/feed`
from 1.5s to 0.34s, on the same machine and the same data.

### Pagination is keyset, not offset

`lib/server/cursor.js`. The cursor encodes `{ createdAt, id }`; `keysetWhere` resumes past
it, `keysetOrder` matches, `keysetPage` turns an over-fetched row set into
`{ items, nextCursor }`.

Three things about it are load-bearing:

- **The key is the pair, never `createdAt` alone.** Two posts can share a timestamp, and a
  non-unique key silently drops or repeats rows at a page boundary. `id` is the tiebreaker
  that makes the ordering total.
- **`direction` must match the query's `orderBy`** — `"desc"` for the feed, `"asc"` for a
  comment thread. Mismatch them and the second page silently repeats the first rather than
  failing.
- **End-of-collection is detected by over-fetching one row** (`take: limit + 1`), never by
  `COUNT(*)`. A count makes the database touch every matching row on every request to
  produce a number the contract does not even carry.

The models carry indexes in exactly the sort order the cursor compares, so a page is an
index range scan.

**A comment thread pins the viewer's own comments above the paged body**, newest first, so
the reply someone just left is still at the top when they reopen the sheet — matching what
the optimistic client already showed them. That block is not part of the keyset: it is
fetched whole (capped, see `PINNED_OWN_COMMENTS`), returned only on the cursorless first
page, and `nextCursor` still comes off the body's last row. What it *does* touch every page
is the body's `where`, which excludes the pinned ids — resolve them on every call, not just
the first, or page two serves the same comment a second time in its chronological place.

### Denormalized tallies

`Post.likeCount`, `Post.commentCount`, `Comment.likeCount` are maintained inside the same
transaction as the write that changes them, so they cannot drift from the rows that justify
them. They exist because every feed card renders both, and counting per card would be two
extra queries per post per page.

Likes are still **rows** (`PostLike`, `CommentLike`) — the feed has to answer "did *this
viewer* like it" per card, which a counter cannot. The composite primary key makes a
double-tap idempotent at the database level; a racing duplicate surfaces as Prisma `P2002`
and is treated as "already liked", not as an error.

### Sequential transactions, not interactive ones

Writes here default to the **array** form, `prisma.$transaction([...])`, and that is a
deliberate choice rather than a style preference. An interactive transaction
(`$transaction(async tx => ...)`) holds a pooled connection open across several
client-server round trips; through Supabase's transaction pooler, on serverless, that is
a connection held for the whole exchange rather than for one dispatch.

Almost none of these writes need it. A like toggle branches on state read *before* the
transaction opens, and a new comment's tally bump does not read anything the insert
returns — so no statement depends on a previous one's result, which is the only thing the
interactive form buys.

`deleteComment` is the one exception, and it is what the rule looks like when it genuinely
stops holding: the tally may only be decremented if *this* request is the one that claimed
the row. Two people can delete the same comment at once — its author and an admin — and the
array form would run both decrements, permanently under-counting the thread. The claim is
`updateMany` with `deletedAt: null` in its `where`, and the decrement depends on its
`count`. Reach for the interactive form on that basis and no other.

### Locking out the Data API — `prisma/policies.sql`

Supabase auto-generates a REST API over the `public` schema, authenticated with the
publishable key that is **compiled into our own client bundle**. It answers independently
of `/api`, so it bypasses `requireViewer`, `requireMembership`, and the APPROVED-membership
feed scoping completely.

`prisma/policies.sql` closes it: RLS enabled with **no policies** (deny-all) plus explicit
`REVOKE` of the `anon` / `authenticated` grants and an `ALTER DEFAULT PRIVILEGES` so future
tables are not granted either. The app is unaffected because Prisma connects as the table
owner, and an owner is exempt from RLS — which is also why there are no policies to write.

> **Re-run `npm run db:secure` after every migration.** A migration that adds a table adds
> it unprotected. The file installs an event trigger that enables RLS on any new `public`
> table as a backstop, but the trigger only exists once the file has been applied at least
> once.

Verify with the two queries at the foot of that file; both should return nothing.

### Migrating and seeding

```bash
npm run prisma:migrate   # create/apply a migration (uses DIRECT_URL)
npm run db:secure        # RLS + revoke Data API grants — after EVERY migration
npm run prisma:seed      # parish, people, and the post corpus
npm run db:reset         # DESTRUCTIVE: drop, re-migrate, re-secure, re-seed
```

Three things about that sequence:

- **Seeding is never automatic.** The CLI does not run it after a migrate. It is registered
  in `prisma.config.ts` (`migrations.seed`) so `prisma db seed` knows what to run, and
  nothing more.
- **`db:reset` passes `--skip-seed` deliberately.** `migrate reset` *would* trigger the
  configured seed, and it has to not — the seed must land after `db:secure`, or it writes
  into tables the Data API can still read.
- **`prisma migrate reset` drops everything, and Prisma blocks it for AI agents.** Recent
  CLI versions refuse it in an agent environment without explicit user consent passed
  through `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. That guard is correct; do not
  work around it. Run the reset yourself.

`prisma/seed.js` provisions two real, sign-innable Supabase accounts (an ADMIN priest and a
MEMBER layperson) and a cast of Profile-only people who author the seeded comments but have
no credentials. That split is deliberate: it makes "provisioned" and "exists in the app"
visibly different states, which is what invite-only means here. It is idempotent — every
row upserts on a natural key.

### Naming

Models and fields are camelCase in the Prisma client and **snake_case in Postgres**, via
`@@map` / `@map`. Postgres folds unquoted identifiers to lowercase, so a mixed-case table
has to be quoted forever — in every raw query, every psql session, and every statement
typed into the Supabase SQL editor. A new model needs its `@@map`; the raw `DISTINCT ON`
query in `posts.service.js` is the one place this is visible in app code.

### If you add a field

1. `prisma/schema.prisma` — include `@map` for any camelCase name, and an `@@index` on any
   new foreign key (Postgres does not index one automatically, and an unindexed FK turns
   `ON DELETE CASCADE` into a sequential scan).
2. `npm run prisma:migrate`, then `npm run db:secure` if the change added a table.
3. `lib/server/projections.js` — nothing reaches a client that is not listed there.
4. The service, if it needs a new `include` or `where`.

Steps 3 and 4 are where a schema change stops. No route handler, store, hook, or component
should need to change for a rename, because the projection absorbs it.

---

## 11. Adding groups without editing the seed — the design, not yet built

**Status: proposed. Nothing below exists.** Written down now because the shape of it decides
whether the prod seed stays two people and one parish, and because the obvious
implementation is the wrong one.

Today a group is created by `prisma/seed.prod.js` and its first admin is a literal in that
file. That is correct for launch — one parish, two admins, both of them the people building
it — and it stops being correct the moment a second parish wants in. Onboarding a customer
should not be a deploy.

### The gap: there is no third scope

The app has exactly two authorization axes, and neither can express this:

- `Membership.role` (ADMIN | MEMBER) is **per-group**. An admin of Holy Trinity has no
  standing anywhere else, which is the entire point — see the schema header.
- `Profile.vocation` is who someone is and **grants nothing**.

Creating a group is neither. It is not scoped to a group, because the group does not exist
yet; whoever does it acts on the *platform*. So the honest change is a third axis, kept
apart from the other two for the same reason those two are kept apart from each other:

```prisma
/// Authority over the platform itself, not over any one group. Deliberately a third axis:
/// `Membership.role` cannot express it (the group does not exist yet) and `vocation` grants
/// nothing. OWNER is expected to be one or two people, forever.
enum PlatformRole {
  NONE
  OWNER

  @@map("platform_role")
}

model Profile {
  // ...
  platformRole PlatformRole @default(NONE) @map("platform_role")
}
```

`ajkoranda@gmail.com` is `OWNER`. The prod seed asserts it the same way it asserts the
memberships — that is the one line it would gain.

### What it unlocks, and what it must not

Two endpoints, both gated by a new `requirePlatformOwner(viewer)` in `lib/server/auth.js`:

| Endpoint | Does |
|---|---|
| `POST /api/orgs` | Creates a group: `name`, `kind`, `slug`, optional `parentId`. |
| `POST /api/orgs/:orgId/members` | **Already exists.** Admits the head priest as ADMIN. |

Onboarding a parish is therefore *create the group, then admit its priest as its admin* —
two calls, the second of which is the invite flow that already works today. `admitOne`
provisions the Supabase user, the Profile and the APPROVED membership in one step, so the
priest simply signs in. Nothing new is needed for the hard half.

Three constraints that are easy to get wrong:

1. **OWNER must not imply read access to every group.** It is the authority to *create* a
   group and admit its first admin — not a master key to every parish's feed and roster.
   `requireViewer`'s membership scoping stays exactly as it is, and `requirePlatformOwner`
   is a separate check used only by the two endpoints above. An owner who wants to read a
   parish gets a membership in it, visibly, like everyone else. Collapsing these is how a
   platform role becomes a backdoor.
2. **`GET /api/orgs` stays the viewer's own groups.** It is not a directory, and making it
   one for owners would put a second meaning behind one endpoint. A console needs
   `GET /api/admin/orgs`, separately gated.
3. **This is not a join-request flow.** Admission stays one-directional, and
   `MembershipStatus` stays `APPROVED | REVOKED` — see the schema header before reaching for
   a third value.

### The surface

A single screen, reachable only by an owner, that takes a parish name, a kind, and the head
priest's email address, and performs the two calls. It belongs beside Settings → Groups
rather than inside it: that screen lists groups you administer, and this one creates groups
you will not.

Until it exists, onboarding a second parish is: add the group and the priest's email to
`seed.prod.js`, run `npm run db:seed:prod`. That works, it is idempotent, and it is a deploy
— which is precisely the cost this section exists to eventually remove.

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
