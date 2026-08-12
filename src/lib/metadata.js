/* In-memory seed data for the demo. The stores clone this on init, then mutate
 * their own copy in-session. Nothing persists to disk or across reloads —
 * reload the page to reset to this baseline. */

export const CURRENT_USER = {
    id: "7e799cc2-e781-447e-94a1-b825d08df9ca",
    email: "admin@synaxis.chat",
    full_name: "Synaxis Admin",
    is_enabled: true,
    role: "admin",
    created_at: "2026-05-26T20:33:48.795230Z",
    updated_at: "2026-05-26T20:33:48.795230Z",
    last_login: "2026-06-11T18:42:10.000000Z",
}

export const USERS = [
    CURRENT_USER,
    {
        id: "8d8a99cc-7f72-4d3e-ae71-c116e1e9aaaa",
        email: "provision@example.com",
        full_name: "Provisioner",
        is_enabled: true,
        role: "provisioner",
        created_at: "2026-05-26T20:33:48.795230Z",
        updated_at: "2026-05-26T20:33:48.795230Z",
        last_login: "2026-06-13T09:15:00.000000Z",
    },
    {
        id: "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081",
        email: "jordan.rivera@example.com",
        full_name: "Jordan Rivera",
        is_enabled: true,
        role: "basic",
        created_at: "2026-04-12T14:05:11.000000Z",
        updated_at: "2026-05-30T09:21:02.000000Z",
        last_login: "2026-06-10T07:15:33.000000Z",
    },
    {
        id: "2c3d4e5f-6071-4829-ab3c-4d5e6f708192",
        email: "casey.nguyen@example.com",
        full_name: "Casey Nguyen",
        is_enabled: true,
        role: "basic",
        created_at: "2026-03-03T08:42:33.000000Z",
        updated_at: "2026-05-18T16:48:57.000000Z",
        last_login: "2026-05-18T16:48:57.000000Z",
    },
    {
        id: "3d4e5f60-7182-493a-bc4d-5e6f708192a3",
        email: "morgan.patel@example.com",
        full_name: "Morgan Patel",
        is_enabled: true,
        role: "basic",
        created_at: "2026-02-19T11:17:09.000000Z",
        updated_at: "2026-04-27T13:02:44.000000Z",
        last_login: "2026-06-09T21:03:48.000000Z",
    },
    {
        id: "4e5f6071-8293-4a4b-cd5e-6f708192a3b4",
        email: "taylor.brooks@example.com",
        full_name: "Taylor Brooks",
        is_enabled: false,
        role: "basic",
        created_at: "2026-01-08T19:55:26.000000Z",
        updated_at: "2026-03-15T07:33:18.000000Z",
        last_login: "2026-03-15T07:33:18.000000Z",
    },
    {
        id: "5f607182-93a4-4b5c-de6f-708192a3b4c5",
        email: "sam.okafor@example.com",
        full_name: "Sam Okafor",
        is_enabled: true,
        role: "basic",
        created_at: "2025-12-01T22:10:40.000000Z",
        updated_at: "2026-05-22T10:09:15.000000Z",
        last_login: "2026-06-12T08:27:05.000000Z",
    },
    {
        id: "60718293-a4b5-4c6d-ef70-8192a3b4c5d6",
        email: "riley.chen@example.com",
        full_name: "Riley Chen",
        is_enabled: false,
        role: "basic",
        created_at: "2025-11-14T05:28:51.000000Z",
        updated_at: "2026-02-02T18:44:30.000000Z",
        last_login: "2026-02-02T18:44:30.000000Z",
    },
]

/* Seed events feed. */
export const EVENTS = [
    {
        id: "evt-001",
        created_at: "2026-07-08T14:30:00.000000Z",
        user: "Admin",
        action: "install",
        status: "complete",
    },
    {
        id: "evt-002",
        created_at: "2026-07-08T10:12:00.000000Z",
        user: "Jordan Rivera",
        action: "upgrade",
        status: "complete",
    },
    {
        id: "evt-003",
        created_at: "2026-07-07T16:47:00.000000Z",
        user: "Casey Nguyen",
        action: "upgrade",
        status: "pending",
    },
    {
        id: "evt-004",
        created_at: "2026-07-06T09:03:00.000000Z",
        user: "Admin",
        action: "install",
        status: "complete",
    },
    {
        id: "evt-005",
        created_at: "2026-07-05T13:19:00.000000Z",
        user: "Morgan Patel",
        action: "install",
        status: "complete",
    },
    {
        id: "evt-006",
        created_at: "2026-07-04T18:52:00.000000Z",
        user: "Sam Okafor",
        action: "install",
        status: "complete",
    },
]

/* Seed social feed — a BuddyBoss-style parish activity stream (modeled on the
 * Our Diocese "Activity" feed). Each post is authored by a person (the poster)
 * into a `group` (the parish community), which is the primary identity on the
 * card. Posts carry one of a few media shapes: an uploaded `image` (photos, e.g.
 * a birth announcement), multiple images (`images: [...]`, rendered as a
 * swipeable Instagram-style carousel), no media at all (a text-only
 * announcement), or a `document` attachment (a shared PDF). A post uses either
 * `image` (single) or `images` (carousel). Images live under public/img/mock and
 * are referenced root-absolute; render them through appPath() so they resolve
 * under a subpath. Single-`image` posts also carry the media's intrinsic
 * `width`/`height` (px) so the feed card can reserve the correct aspect-ratio box
 * before the image decodes — otherwise the img collapses to 0 height on a cold
 * cache and shifts the layout as it loads. The `feed` store paginates over this
 * array (see lib/store/feed/store.js). */
export const FEED = [
    {
        id: "post-001",
        author: {
            handle: "cathedraldean",
            name: "Priest Alexander",
            avatar: "/img/mock/priest-alexander.png",
            verified: true,
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-09T14:00:00.000000Z",
        image: "/img/mock/cyrus.jpg",
        width: 533,
        height: 400,
        title: null,
        body: "Cyrus John Novak, born 8/3 at 6:41am, 9lbs 5oz and 22.5in. Stephanie and Cyrus are both doing well. Glory to God — many years!",
        likes: 18,
        likedBy: "Mat. Carly",
        comments: 13,
        liked: false,
        saved: false,
    },
    {
        id: "post-002",
        author: {
            handle: "cathedraldean",
            name: "Priest Alexander",
            avatar: "/img/mock/priest-alexander.png",
            verified: true,
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-08T14:00:00.000000Z",
        image: "/img/mock/st-herman.jpg",
        width: 2000,
        height: 1500,
        title: "Feast of St. Herman of Alaska",
        body: "The saint who brought and lived Holy Orthodoxy to America, St. Herman, will be celebrated this weekend. Come and spend the weekend celebrating Christ's Resurrection and the saint who lived in the joy of the Lord's Resurrection here in America.",
        likes: 3,
        likedBy: "Mat. Carly",
        comments: 2,
        liked: false,
        saved: false,
    },
    {
        id: "post-003",
        author: {
            handle: "cathedraldean",
            name: "Priest Alexander",
            avatar: "/img/mock/priest-alexander.png",
            verified: true,
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-07T14:00:00.000000Z",
        image: "/img/mock/lydia.jpg",
        width: 301,
        height: 400,
        title: null,
        body: "Lydia Oneill. Born July 22, 2026 at 11:21pm. 7lb 7oz 21 inches. Glory to God! Many years!",
        likes: 22,
        likedBy: "Geoffrey",
        comments: 4,
        liked: false,
        saved: false,
    },
    {
        id: "post-004",
        author: {
            handle: "cathedraldean",
            name: "Priest Alexander",
            avatar: "/img/mock/priest-alexander.png",
            verified: true,
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
        title: "20 Years of Priesthood — Fr. Thomas",
        body: "Today, August 6, the Great Feast of the Transfiguration of the Lord, we celebrate the 20th anniversary of ordination of Fr. Thomas. Fr. Thomas has a long history of serving the Cathedral that dates well before his diaconal service — as Parish Council President, catechist, singer, Reader, and Subdeacon.",
        likes: 13,
        likedBy: "Geoffrey",
        comments: 6,
        liked: false,
        saved: false,
    },
    {
        id: "post-005",
        author: {
            handle: "cathedraldean",
            name: "Priest Alexander",
            avatar: "/img/mock/priest-alexander.png",
            verified: true,
        },
        group: "Holy Trinity Cathedral",
        created_at: "2026-08-06T14:00:00.000000Z",
        image: "/img/mock/transfiguration.jpg",
        width: 1024,
        height: 683,
        title: "The Holy Transfiguration of Our Lord",
        body: "August 6 — This feast is tied to the commemoration of the event on Mount Tabor, written about by the evangelists (Mt. 17:1-13; Lk. 9:28-36), when Christ was transfigured in glory before His disciples in view of the approach of His suffering and death.",
        likes: 2,
        likedBy: "Mat. Carly",
        comments: 0,
        liked: false,
        saved: false,
    },
    {
        id: "post-006",
        author: {
            handle: "cathedraldean",
            name: "Priest Alexander",
            avatar: "/img/mock/priest-alexander.png",
            verified: true,
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
        likedBy: "Mat. Carly",
        comments: 1,
        liked: false,
        saved: false,
    },
]

/* Every post id in the seed. The native build is a static export, so `/p/:id` has no
 * server to resolve the segment at request time and Next needs the reachable ids up
 * front (see (protected)/p/[postId]/page.jsx → generateStaticParams). Reading them from
 * FEED keeps the one list of posts authoritative; a real backend replaces this with a
 * query, and any id it can't know ahead of time can't be a prerendered path. */
export const postIds = () => FEED.map((post) => post.id)

/* The signed-in viewer's social identity — the author stamped on comments posted
 * from the composer, and the avatar shown in the composer's input row. A real
 * backend would derive this from the authenticated session/profile. */
export const VIEWER = {
    handle: "geoffrey.k",
    name: "Geoffrey",
    avatar: null,
    verified: false,
}

/* Seed comment threads, keyed by post id — the shape a paginated Instagram-style
 * comments API returns. Each comment carries its author, body text, a creation
 * timestamp, a like tally, and whether the viewer has liked it. The `comments`
 * store paginates over each post's array (see lib/store/comments/store.js →
 * load / loadMore); a post's `comments` count on FEED equals its array length
 * here. Authors without an `avatar` render a deterministic gradient monogram. */
export const COMMENTS = {
    "post-001": [
        {
            id: "cmt-001-01",
            author: { handle: "mat.carly", name: "Mat. Carly", avatar: null },
            text: "Glory to God! He is beautiful. Many years to Stephanie and Cyrus! 🎉",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 24,
            liked: false,
        },
        {
            id: "cmt-001-02",
            author: { handle: "geoffrey.k", name: "Geoffrey", avatar: null },
            text: "Axios! What a blessing for your family. Praying for a swift recovery for mom.",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 11,
            liked: false,
        },
        {
            id: "cmt-001-03",
            author: { handle: "reader.michael", name: "Reader Michael", avatar: null },
            text: "9lbs 5oz — a strong little one! Congratulations to the whole family.",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 9,
            liked: false,
        },
        {
            id: "cmt-001-04",
            author: { handle: "presvytera.anna", name: "Anna", avatar: null },
            text: "Welcome to the world, Cyrus John! May God grant him many years. ☦️",
            created_at: "2026-08-09T17:00:00.000000Z",
            likes: 15,
            liked: false,
        },
        {
            id: "cmt-001-05",
            author: { handle: "deacon.paul", name: "Dn. Paul", avatar: null },
            text: "Such joyful news. We will keep them in our prayers.",
            created_at: "2026-08-09T18:00:00.000000Z",
            likes: 6,
            liked: false,
        },
        {
            id: "cmt-001-06",
            author: { handle: "theodora.v", name: "Theodora", avatar: null },
            text: "Congratulations!! He already looks so peaceful. 🥹",
            created_at: "2026-08-09T22:00:00.000000Z",
            likes: 8,
            liked: false,
        },
        {
            id: "cmt-001-07",
            author: { handle: "j.rivera", name: "Jordan Rivera", avatar: null },
            text: "What a gift. Many years to the newest member of the parish!",
            created_at: "2026-08-10T00:00:00.000000Z",
            likes: 4,
            liked: false,
        },
        {
            id: "cmt-001-08",
            author: { handle: "sam.okafor", name: "Sam Okafor", avatar: null },
            text: "Beautiful name. God is good!",
            created_at: "2026-08-10T14:00:00.000000Z",
            likes: 3,
            liked: false,
        },
        {
            id: "cmt-001-09",
            author: { handle: "casey.n", name: "Casey Nguyen", avatar: null },
            text: "Praise God! So happy for them both. 🙏",
            created_at: "2026-08-10T14:00:00.000000Z",
            likes: 5,
            liked: false,
        },
        {
            id: "cmt-001-10",
            author: { handle: "morgan.p", name: "Morgan Patel", avatar: null },
            text: "Many years! Can't wait to meet him at coffee hour.",
            created_at: "2026-08-10T16:00:00.000000Z",
            likes: 7,
            liked: false,
        },
        {
            id: "cmt-001-11",
            author: { handle: "choir.elena", name: "Elena", avatar: null },
            text: "The whole choir is rejoicing with you. Axios!",
            created_at: "2026-08-10T18:00:00.000000Z",
            likes: 2,
            liked: false,
        },
        {
            id: "cmt-001-12",
            author: { handle: "taylor.b", name: "Taylor Brooks", avatar: null },
            text: "Congratulations to Stephanie! Rest well, mama. ❤️",
            created_at: "2026-08-11T02:00:00.000000Z",
            likes: 1,
            liked: false,
        },
        {
            id: "cmt-001-13",
            author: { handle: "riley.c", name: "Riley Chen", avatar: null },
            text: "Glory to God for all things! 🙌",
            created_at: "2026-08-11T08:00:00.000000Z",
            likes: 0,
            liked: false,
        },
    ],
    "post-002": [
        {
            id: "cmt-002-01",
            author: { handle: "reader.michael", name: "Reader Michael", avatar: null },
            text: "St. Herman of Alaska, pray to God for us! Looking forward to this weekend.",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 5,
            liked: false,
        },
        {
            id: "cmt-002-02",
            author: { handle: "theodora.v", name: "Theodora", avatar: null },
            text: "One of my favorite feasts. Will the Saturday vigil start at the usual time?",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 2,
            liked: false,
        },
    ],
    "post-003": [
        {
            id: "cmt-003-01",
            author: { handle: "geoffrey.k", name: "Geoffrey", avatar: null },
            text: "Many years to baby Lydia and her parents! 🎉",
            created_at: "2026-08-07T14:00:00.000000Z",
            likes: 12,
            liked: false,
        },
        {
            id: "cmt-003-02",
            author: { handle: "mat.carly", name: "Mat. Carly", avatar: null },
            text: "Glory to God! She's precious. ☦️",
            created_at: "2026-08-07T14:00:00.000000Z",
            likes: 8,
            liked: false,
        },
        {
            id: "cmt-003-03",
            author: { handle: "presvytera.anna", name: "Anna", avatar: null },
            text: "Congratulations!! 21 inches — she's going to be tall. 🥹",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 3,
            liked: false,
        },
        {
            id: "cmt-003-04",
            author: { handle: "sam.okafor", name: "Sam Okafor", avatar: null },
            text: "Welcome, Lydia! Praying for the family.",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 1,
            liked: false,
        },
    ],
    "post-004": [
        {
            id: "cmt-004-01",
            author: { handle: "mat.carly", name: "Mat. Carly", avatar: null },
            text: "Axios, Fr. Thomas! Twenty years of faithful service. 🙏",
            created_at: "2026-08-07T14:00:00.000000Z",
            likes: 31,
            liked: false,
        },
        {
            id: "cmt-004-02",
            author: { handle: "reader.michael", name: "Reader Michael", avatar: null },
            text: "So grateful for his ministry. Many years, Father!",
            created_at: "2026-08-07T14:00:00.000000Z",
            likes: 14,
            liked: false,
        },
        {
            id: "cmt-004-03",
            author: { handle: "deacon.paul", name: "Dn. Paul", avatar: null },
            text: "What a beautiful milestone on the Feast of the Transfiguration.",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 9,
            liked: false,
        },
        {
            id: "cmt-004-04",
            author: { handle: "choir.elena", name: "Elena", avatar: null },
            text: "Axios! Axios! Axios!",
            created_at: "2026-08-08T14:00:00.000000Z",
            likes: 18,
            liked: false,
        },
        {
            id: "cmt-004-05",
            author: { handle: "j.rivera", name: "Jordan Rivera", avatar: null },
            text: "Blessed to have grown up in this parish under his care.",
            created_at: "2026-08-09T14:00:00.000000Z",
            likes: 6,
            liked: false,
        },
        {
            id: "cmt-004-06",
            author: { handle: "morgan.p", name: "Morgan Patel", avatar: null },
            text: "Many years, Fr. Thomas! 🎉",
            created_at: "2026-08-10T14:00:00.000000Z",
            likes: 2,
            liked: false,
        },
    ],
    "post-006": [
        {
            id: "cmt-006-01",
            author: { handle: "theodora.v", name: "Theodora", avatar: null },
            text: "Signed up for an October Sunday! Happy to help in the kitchen. 🙌",
            created_at: "2026-08-06T14:00:00.000000Z",
            likes: 4,
            liked: false,
        },
    ],
}
