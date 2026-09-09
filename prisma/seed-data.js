/* The corpus the database is seeded from.
 *
 * This was the mock backend's in-memory "database" (formerly src/lib/server/seed.js). Now
 * that Postgres is behind the API it has exactly one consumer, `prisma/seed.js`, which
 * maps these objects onto Post / PostMedia / Comment rows so a fresh database opens with
 * something to read instead of an empty feed.
 *
 * It is kept in the wire shape it always had rather than being rewritten as Prisma input,
 * because that shape is what the fixtures and the public/img/mock assets were authored
 * against; the mapping to columns lives in the seed script, which is the place that has to
 * change when the schema does.
 *
 * `created_at` is still snake_case here. That is deliberate: this is a frozen fixture, and
 * the seed script translates it. The live API emits `createdAt` everywhere.
 */

/* Seed social feed — a BuddyBoss-style parish activity stream (modeled on the
 * Our Diocese "Activity" feed). Each post is authored by a person (the poster)
 * into a `group` (the parish community), which is the primary identity on the
 * card. Posts carry one of a few media shapes: an uploaded `image` (photos, e.g.
 * a birth announcement), multiple images (`images: [...]`, rendered as a
 * swipeable Instagram-style carousel), no media at all (a text-only
 * announcement), or a `document` attachment (a shared PDF). A post uses either
 * `image` (single) or `images` (carousel). Images live under public/img/mock and
 * are referenced root-absolute; render them through appPath() so they resolve
 * under a subpath. Either media shape carries the intrinsic `width`/`height` (px) of
 * the *first* photo, so the feed card can reserve the correct aspect-ratio box before
 * the image decodes — otherwise the img collapses to 0 height on a cold cache and
 * shifts the layout as it loads, and a carousel falls back to a square.
 *
 * Newest first, which is the order `GET /api/feed` pages through (see
 * posts.service.js → listFeed). A real backend would sort by `created_at`. */
export const FEED = [
    {
        id: "post-001",
        author: {
            handle: "cathedraldean",
            avatar: "/img/mock/priest-alexander.png",
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-09T14:00:00.000000Z",
        image: "/img/mock/cyrus.jpg",
        width: 533,
        height: 400,
        title: null,
        body: "Cyrus John Novak, born 8/3 at 6:41am, 9lbs 5oz and 22.5in. Stephanie and Cyrus are both doing well. Glory to God — many years!",
        likes: 18,
        likedBy: "mat.carly",
        comments: 13,
        liked: false,
        saved: false,
    },
    {
        id: "post-002",
        author: {
            handle: "cathedraldean",
            avatar: "/img/mock/priest-alexander.png",
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-08T14:00:00.000000Z",
        image: "/img/mock/st-herman.jpg",
        width: 2000,
        height: 1500,
        title: "Feast of St. Herman of Alaska",
        body: "The saint who brought and lived Holy Orthodoxy to America, St. Herman, will be celebrated this weekend. Come and spend the weekend celebrating Christ's Resurrection and the saint who lived in the joy of the Lord's Resurrection here in America.",
        likes: 3,
        likedBy: "mat.carly",
        comments: 2,
        liked: false,
        saved: false,
    },
    {
        id: "post-003",
        author: {
            handle: "cathedraldean",
            avatar: "/img/mock/priest-alexander.png",
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-07T14:00:00.000000Z",
        image: "/img/mock/lydia.jpg",
        width: 301,
        height: 400,
        title: null,
        body: "Lydia Oneill. Born July 22, 2026 at 11:21pm. 7lb 7oz 21 inches. Glory to God! Many years!",
        likes: 22,
        likedBy: "geoffrey.k",
        comments: 4,
        liked: false,
        saved: false,
    },
    {
        id: "post-004",
        author: {
            handle: "cathedraldean",
            avatar: "/img/mock/priest-alexander.png",
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-07T10:00:00.000000Z",
        images: [
            "/img/mock/fr-thomas-1.jpg",
            "/img/mock/fr-thomas-2.jpg",
            "/img/mock/fr-thomas-3.jpg",
            "/img/mock/fr-thomas-4.jpg",
            "/img/mock/cross-1.jpg",
            "/img/mock/cross-2.jpg",
            "/img/mock/cross-3.jpg",
        ],
        width: 356,
        height: 534,
        title: "20 Years of Priesthood — Fr. Thomas",
        body: "Today, August 6, the Great Feast of the Transfiguration of the Lord, we celebrate the 20th anniversary of ordination of Fr. Thomas. Fr. Thomas has a long history of serving the Cathedral that dates well before his diaconal service — as Parish Council President, catechist, singer, Reader, and Subdeacon.",
        likes: 13,
        likedBy: "geoffrey.k",
        comments: 6,
        liked: false,
        saved: false,
    },
    {
        id: "post-005",
        author: {
            handle: "cathedraldean",
            avatar: "/img/mock/priest-alexander.png",
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-06T14:00:00.000000Z",
        image: "/img/mock/transfiguration.jpg",
        width: 1024,
        height: 683,
        title: "The Holy Transfiguration of Our Lord",
        body: "August 6 — This feast is tied to the commemoration of the event on Mount Tabor, written about by the evangelists (Mt. 17:1-13; Lk. 9:28-36), when Christ was transfigured in glory before His disciples in view of the approach of His suffering and death.",
        likes: 2,
        likedBy: "mat.carly",
        comments: 0,
        liked: false,
        saved: false,
    },
    {
        id: "post-006",
        author: {
            handle: "cathedraldean",
            avatar: "/img/mock/priest-alexander.png",
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-06T10:00:00.000000Z",
        image: "/img/mock/coffee-hour.jpg",
        width: 464,
        height: 600,
        document: {
            name: "Coffee-Hour.pdf",
            size: "142 KB",
            type: "pdf",
        },
        title: "Hospitality & Coffee Hour Sign-Ups",
        body: "Last week I made a post focused on the Sunday gospel reading regarding our efforts in hospitality and service as a parish — coffee hour and the Cathedral's Kitchen. I am very grateful for the response the post received. August and September are full, and several Sundays in October and November remain.",
        likes: 7,
        likedBy: "mat.carly",
        comments: 1,
        liked: false,
        saved: false,
    },
]

/* Seed comment threads, keyed by post id. Each comment carries its author, body text, a
 * creation timestamp, a like tally, and whether the viewer has liked it.
 * `GET /api/posts/:postId/comments` pages through a post's array (see posts.service.js →
 * listComments); a post's `comments` count on FEED equals its array length here, and
 * `addComment` keeps the two in step. Authors without an `avatar` render a deterministic
 * gradient monogram. A post absent from this map simply has no comments yet. */
export const COMMENTS = {
    "post-001": [
        {
            id: "cmt-001-01",
            author: { handle: "mat.carly", avatar: null },
            text: "Glory to God! He is beautiful. Many years to Stephanie and Cyrus! 🎉",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 24,
            liked: false,
        },
        {
            id: "cmt-001-02",
            author: { handle: "geoffrey.k", avatar: null },
            text: "Axios! What a blessing for your family. Praying for a swift recovery for mom.",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 11,
            liked: false,
        },
        {
            id: "cmt-001-03",
            author: { handle: "reader.michael", avatar: null },
            text: "9lbs 5oz — a strong little one! Congratulations to the whole family.",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 9,
            liked: false,
        },
        {
            id: "cmt-001-04",
            author: { handle: "matushka.anna", avatar: null },
            text: "Welcome to the world, Cyrus John! May God grant him many years. ☦️",
            created_at: "2026-08-09T17:00:00.000000Z",
            likes: 15,
            liked: false,
        },
        {
            id: "cmt-001-05",
            author: { handle: "deacon.paul", avatar: null },
            text: "Such joyful news. We will keep them in our prayers.",
            created_at: "2026-08-09T18:00:00.000000Z",
            likes: 6,
            liked: false,
        },
        {
            id: "cmt-001-06",
            author: { handle: "theodora.v", avatar: null },
            text: "Congratulations!! He already looks so peaceful. 🥹",
            created_at: "2026-08-09T22:00:00.000000Z",
            likes: 8,
            liked: false,
        },
        {
            id: "cmt-001-07",
            author: { handle: "j.rivera", avatar: null },
            text: "What a gift. Many years to the newest member of the parish!",
            created_at: "2026-08-10T00:00:00.000000Z",
            likes: 4,
            liked: false,
        },
        {
            id: "cmt-001-08",
            author: { handle: "sam.okafor", avatar: null },
            text: "Beautiful name. God is good!",
            created_at: "2026-08-10T14:00:00.000000Z",
            likes: 3,
            liked: false,
        },
        {
            id: "cmt-001-09",
            author: { handle: "casey.n", avatar: null },
            text: "Praise God! So happy for them both. 🙏",
            created_at: "2026-08-10T14:00:00.000000Z",
            likes: 5,
            liked: false,
        },
        {
            id: "cmt-001-10",
            author: { handle: "morgan.p", avatar: null },
            text: "Many years! Can't wait to meet him at coffee hour.",
            created_at: "2026-08-10T16:00:00.000000Z",
            likes: 7,
            liked: false,
        },
        {
            id: "cmt-001-11",
            author: { handle: "choir.elena", avatar: null },
            text: "The whole choir is rejoicing with you. Axios!",
            created_at: "2026-08-10T18:00:00.000000Z",
            likes: 2,
            liked: false,
        },
        {
            id: "cmt-001-12",
            author: { handle: "taylor.b", avatar: null },
            text: "Congratulations to Stephanie! Rest well, mama. ❤️",
            created_at: "2026-08-11T02:00:00.000000Z",
            likes: 1,
            liked: false,
        },
        {
            id: "cmt-001-13",
            author: { handle: "riley.c", avatar: null },
            text: "Glory to God for all things! 🙌",
            created_at: "2026-08-11T08:00:00.000000Z",
            likes: 0,
            liked: false,
        },
    ],
    "post-002": [
        {
            id: "cmt-002-01",
            author: { handle: "reader.michael", avatar: null },
            text: "St. Herman of Alaska, pray to God for us! Looking forward to this weekend.",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 5,
            liked: false,
        },
        {
            id: "cmt-002-02",
            author: { handle: "theodora.v", avatar: null },
            text: "One of my favorite feasts. Will the Saturday vigil start at the usual time?",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 2,
            liked: false,
        },
    ],
    "post-003": [
        {
            id: "cmt-003-01",
            author: { handle: "geoffrey.k", avatar: null },
            text: "Many years to baby Lydia and her parents! 🎉",
            created_at: "2026-08-07T14:00:00.000000Z",
            likes: 12,
            liked: false,
        },
        {
            id: "cmt-003-02",
            author: { handle: "mat.carly", avatar: null },
            text: "Glory to God! She's precious. ☦️",
            created_at: "2026-08-07T14:00:00.000000Z",
            likes: 8,
            liked: false,
        },
        {
            id: "cmt-003-03",
            author: { handle: "matushka.anna", avatar: null },
            text: "Congratulations!! 21 inches — she's going to be tall. 🥹",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 3,
            liked: false,
        },
        {
            id: "cmt-003-04",
            author: { handle: "sam.okafor", avatar: null },
            text: "Welcome, Lydia! Praying for the family.",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 1,
            liked: false,
        },
    ],
    "post-004": [
        {
            id: "cmt-004-01",
            author: { handle: "mat.carly", avatar: null },
            text: "Axios, Fr. Thomas! Twenty years of faithful service. 🙏",
            created_at: "2026-08-07T14:00:00.000000Z",
            likes: 31,
            liked: false,
        },
        {
            id: "cmt-004-02",
            author: { handle: "reader.michael", avatar: null },
            text: "So grateful for his ministry. Many years, Father!",
            created_at: "2026-08-07T14:00:00.000000Z",
            likes: 14,
            liked: false,
        },
        {
            id: "cmt-004-03",
            author: { handle: "deacon.paul", avatar: null },
            text: "What a beautiful milestone on the Feast of the Transfiguration.",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 9,
            liked: false,
        },
        {
            id: "cmt-004-04",
            author: { handle: "choir.elena", avatar: null },
            text: "Axios! Axios! Axios!",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 18,
            liked: false,
        },
        {
            id: "cmt-004-05",
            author: { handle: "j.rivera", avatar: null },
            text: "Blessed to have grown up in this parish under his care.",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 6,
            liked: false,
        },
        {
            id: "cmt-004-06",
            author: { handle: "morgan.p", avatar: null },
            text: "Many years, Fr. Thomas! 🎉",
            created_at: "2026-08-10T14:00:00.000000Z",
            likes: 2,
            liked: false,
        },
    ],
    "post-006": [
        {
            id: "cmt-006-01",
            author: { handle: "theodora.v", avatar: null },
            text: "Signed up for an October Sunday! Happy to help in the kitchen. 🙌",
            created_at: "2026-08-06T14:00:00.000000Z",
            likes: 4,
            liked: false,
        },
    ],
}
