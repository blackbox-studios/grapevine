"use client"

import {
    DOCUMENT_MIME_TYPES,
    IMAGE_MAX_DIMENSION,
    IMAGE_MIME_TYPES,
    MAX_DOCUMENT_BYTES,
    MAX_IMAGE_BYTES,
} from "@/lib/constants"

/* Turning a file a person picked into something worth uploading.
 *
 * Its own module rather than `lib/utils.js` for the same reason `lib/name.js` and
 * `lib/native.js` are: this is browser-API work — canvas, `createImageBitmap`, object URLs —
 * not the pure formatting helpers that file is for.
 *
 * **Two kinds of file take opposite paths, and the difference is the point.** A photo is
 * decoded, scaled and re-encoded (see below); an attachment is passed through byte for byte,
 * because a PDF that has been "processed" is a corrupted PDF. `prepareFile` is the seam: it
 * decides which a file is and stamps the `kind` the post's media row will carry.
 *
 * **The re-encode is not an optimization, it is the point.** A phone camera hands over a
 * 12-megapixel, 5MB HEIC or JPEG; the widest column the app ever renders one in is a few
 * hundred CSS pixels. Uploading the original would spend a parish's mobile data on detail
 * nobody can see, and would leave the feed downloading it again on every reader's phone.
 * Scaling to `IMAGE_MAX_DIMENSION` and re-encoding as WebP typically takes 5MB to under 300KB
 * with no visible difference at the sizes rendered.
 *
 * It also **strips EXIF**, which matters more than the bytes: a photo taken on a phone
 * carries GPS coordinates, and a parish posting a picture of a parishioner's home should not
 * be publishing its location. A canvas re-encode keeps only the pixels. The one thing EXIF
 * carries that must survive is orientation, and `createImageBitmap` applies it during decode
 * (`imageOrientation: "from-image"`) so the drawn pixels are already the right way up. */

/* WebP at this quality is visually lossless at the sizes this app renders and roughly a
 * third the size of the equivalent JPEG. Supported everywhere the app runs — every browser
 * since 2020, and both WebViews. */
const OUTPUT_TYPE = "image/webp"
const OUTPUT_QUALITY = 0.85

/* An animated GIF is the one thing this cannot re-encode: a canvas holds a single frame, so
 * drawing one through it would silently freeze it. Those pass through untouched — measured
 * but not rewritten — which means they keep their EXIF too, and GIFs do not carry any. */
const PASSTHROUGH_TYPES = new Set(["image/gif"])

/* Decoded pixels, right way up.
 *
 * `createImageBitmap` is the fast path and the only one that can apply EXIF orientation
 * during decode. Safari's older releases reject the options bag rather than ignoring it, and
 * a Capacitor WebView is whatever WebKit the device shipped with, so the fallback decodes
 * through an `<img>` — which browsers also orient from EXIF, and which is additionally the
 * path that handles a format `createImageBitmap` declines. */
const decode = async (file) => {
    try {
        return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
        const url = URL.createObjectURL(file)
        try {
            const image = new Image()
            image.src = url
            await image.decode()
            return image
        } finally {
            /* Revoking after `decode()` is safe — the bitmap is in memory by then — and
             * skipping it leaks the whole file for the life of the document. */
            URL.revokeObjectURL(url)
        }
    }
}

const dimensionsOf = (source) => ({
    width: source.width || source.naturalWidth,
    height: source.height || source.naturalHeight,
})

/* Prepares one picked photo.
 *
 * Returns `{ blob, width, height, mimeType, fileName, sizeBytes }` — everything both the
 * upload and the `PostMedia` row need, so no caller re-measures. Throws a plain `Error` with
 * a message safe to show; the store that calls this is what turns it into the app's error
 * state.
 *
 * `width`/`height` are the *encoded* dimensions, not the original's. They are what the feed
 * card reserves its aspect-ratio box from, so they have to describe the file that will
 * actually be fetched. */
const prepareImage = async (file) => {
    const source = await decode(file).catch(() => null)
    if (!source) throw new Error(`Couldn't read ${file.name || "that image"}.`)

    const { width, height } = dimensionsOf(source)
    if (!width || !height) throw new Error(`Couldn't read ${file.name || "that image"}.`)

    if (PASSTHROUGH_TYPES.has(file.type)) {
        source.close?.()
        return {
            blob: file,
            width,
            height,
            mimeType: file.type,
            fileName: file.name || null,
            sizeBytes: file.size,
        }
    }

    /* Only ever downward: enlarging a small photo would add bytes and no detail. */
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(width, height))
    const target = {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    }

    const canvas = document.createElement("canvas")
    canvas.width = target.width
    canvas.height = target.height
    canvas.getContext("2d").drawImage(source, 0, 0, target.width, target.height)

    /* An ImageBitmap holds the *decoded* image — four bytes a pixel, so a dozen megabytes
     * for one phone photo — and nothing releases it on its own. Picking several at once
     * without this is a real chance of the WebView being killed for memory. */
    source.close?.()

    /* `toBlob` is callback-only. Promisified here rather than reaching for `convertToBlob`
     * on an OffscreenCanvas, which is the newer API and not in every WebView the app ships
     * to. */
    const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY),
    )
    if (!blob) throw new Error(`Couldn't process ${file.name || "that image"}.`)

    return {
        blob,
        ...target,
        mimeType: OUTPUT_TYPE,
        fileName: file.name || null,
        sizeBytes: blob.size,
    }
}

/* Prepares one picked attachment — which is to say, does nothing to it.
 *
 * **The bytes must reach storage untouched.** There is no re-encode, no metadata strip, no
 * downscale: a PDF or a spreadsheet that has been through a canvas is a broken PDF or
 * spreadsheet. That also means an attachment carries whatever its author left in it, so the
 * allow-list is short by design (see `DOCUMENT_MIME_TYPES`).
 *
 * `fileName` is the one field that matters more here than for a photo: it is what the
 * document card prints, so "Coffee Hour Sign-Up.pdf" has to survive the trip. The object's
 * own key is still a UUID — the name is data on the row, never part of the path. */
const prepareDocument = (file) => ({
    blob: file,
    mimeType: file.type,
    fileName: file.name || null,
    sizeBytes: file.size,
})

/* The ceiling on anything straight off the device, whatever it turns out to be — derived from
 * the two product limits rather than tuned separately, because it *is* the higher of them.
 *
 * It exists so that a file too big to be any use is refused before it is decoded, not after.
 * Decoding is the expensive step: a 200MB image becomes a 200-million-pixel bitmap in memory
 * — four bytes a pixel — and on a phone that is the WebView being killed rather than an error
 * anyone can act on. */
const MAX_PICKED_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_DOCUMENT_BYTES)

const megabytes = (bytes) => Math.round(bytes / 1024 / 1024)

/* The seam between the two: decides what a picked file *is*, prepares it accordingly, and
 * stamps the `kind` its `PostMedia` row will carry.
 *
 * **Two size checks, and they are not the same check twice.**
 *
 *  - Before anything happens, against the file as picked, so nothing enormous is decoded.
 *  - After preparing, against what will *actually be sent*, per kind. For an attachment that
 *    is the same bytes and so the same number. For a photo it is the re-encoded WebP, which
 *    is the only number worth judging: a 20MB original scaled to `IMAGE_MAX_DIMENSION` lands
 *    at a few hundred kilobytes, and refusing it for what it weighed before processing would
 *    be refusing a photo that is about to be small. The 8MB photo ceiling therefore bites on
 *    the one kind nothing shrinks — an animated GIF, which is passed through whole.
 *
 * Both throw an `Error` naming the file, which the uploads store parks in `error.upload` and
 * `useErrorListener` turns into a toast. That is why the message has to read as a sentence to
 * a person: it is the copy, not a log line.
 *
 * The bucket enforces `MAX_PICKED_BYTES` as well, since a bucket-wide limit cannot tell a
 * photo from a PDF — so these are what actually hold photos to 8MB. */
export const prepareFile = async (file) => {
    const isImage = IMAGE_MIME_TYPES.includes(file.type)
    const isDocument = DOCUMENT_MIME_TYPES.includes(file.type)

    if (!isImage && !isDocument) {
        throw new Error(`${file.name || "That file"} isn't a kind of file we can post.`)
    }

    if (file.size > MAX_PICKED_BYTES) {
        throw new Error(
            `${file.name || "That file"} is ${megabytes(file.size)}MB. The limit is ${megabytes(MAX_PICKED_BYTES)}MB.`,
        )
    }

    const prepared = isImage ? await prepareImage(file) : prepareDocument(file)
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES

    if (prepared.blob.size > limit) {
        throw new Error(
            `${prepared.fileName ?? "That file"} is too large to post. ${
                isImage ? "Photos" : "Files"
            } are limited to ${megabytes(limit)}MB.`,
        )
    }

    return { ...prepared, kind: isImage ? "IMAGE" : "DOCUMENT" }
}
