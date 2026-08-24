/* Creates the Supabase Storage bucket the app uploads into.
 *
 *   npm run storage:setup
 *
 * Idempotent: run it as often as you like. If the bucket already exists it is reconciled
 * to the settings below rather than recreated, so nothing that has been uploaded is
 * touched. Run it once per environment — a new Supabase project has no buckets.
 *
 * ── Why a script and not a migration ────────────────────────────────────────
 *
 * Storage lives in Supabase's own `storage` schema, which Prisma does not manage — a
 * migration that reached into it would make every `prisma migrate` depend on another
 * service's internals, which is the same reason there is no foreign key from Profile to
 * auth.users. The Storage API is the supported way to do this, and it needs the secret key,
 * which is exactly the trust boundary `prisma/seed.js` and `dev:login` already sit behind:
 * your machine, your .env, never shipped.
 *
 * ── The bucket is public-read, on purpose ───────────────────────────────────
 *
 * Read the header of `src/lib/server/storage.js` before changing that. In short: an object's
 * key is a random UUID under an opaque folder, `list` is not granted to anon, and public
 * reads are what let a feed page render its photos with no signing round trip and with a
 * stable, cacheable URL. Writes are *not* public — they need a signed upload URL, which only
 * `/api/uploads` can mint, and only after it has checked the same permission the write the
 * file is destined for would check.
 *
 * `prisma/policies.sql` is unaffected either way: it locks down the `public` schema, which
 * is where this app's tables live and where Storage's are not. */

import "dotenv/config"

import { createClient } from "@supabase/supabase-js"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SECRET) {
    console.error(
        "✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. See .env.example.",
    )
    process.exit(1)
}

/* Keep in step with BUCKET and the constants in `src/lib/constants.js` — this script is
 * plain Node run outside Next, so it cannot import through the `@/` alias.
 *
 * The size limit is a bucket-wide ceiling, so it is the *larger* of the app's two: photos are
 * held to MAX_IMAGE_BYTES and attachments to MAX_DOCUMENT_BYTES, and both are enforced before
 * a byte is sent (`prepareFile`) and again by `uploads.service.js`. This is the backstop. */
const BUCKET = "media"
const FILE_SIZE_LIMIT = 25 * 1024 * 1024
const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
]

const OPTIONS = {
    public: true,
    fileSizeLimit: FILE_SIZE_LIMIT,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
}

const supabase = createClient(URL, SECRET, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const { data: buckets, error: listError } = await supabase.storage.listBuckets()

if (listError) {
    console.error(`✗ Could not reach Supabase Storage: ${listError.message}`)
    process.exit(1)
}

const exists = buckets.some((bucket) => bucket.name === BUCKET)

const { error } = exists
    ? await supabase.storage.updateBucket(BUCKET, OPTIONS)
    : await supabase.storage.createBucket(BUCKET, OPTIONS)

if (error) {
    console.error(`✗ Could not ${exists ? "update" : "create"} the "${BUCKET}" bucket: ${error.message}`)
    process.exit(1)
}

console.log(
    `✓ Bucket "${BUCKET}" ${exists ? "reconciled" : "created"} — public read, ` +
        `${Math.round(FILE_SIZE_LIMIT / 1024 / 1024)}MB limit, ` +
        `${ALLOWED_MIME_TYPES.length} allowed types (images + attachments).`,
)
