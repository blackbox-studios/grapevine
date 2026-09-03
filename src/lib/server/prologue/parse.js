/* Turns one day of the Prologue's MDX source into structured blocks.
 *
 * The source is jaredef/ochrid, a Nextra site whose content tree is one MDX file per day
 * (`content/september/2nd.mdx`). Those files are authored for Nextra's renderer, so they
 * carry three things this app has no use for: `import` lines, site chrome components
 * (<CustomPaginator/>, <RunningHead/>, the decorative <Image/> rules), and inline styling
 * expressed as React style objects.
 *
 * **The output is a block list, never HTML.** Handing the client a string to inject would
 * make a third party's repo an XSS vector into an authenticated surface, and it would also
 * hand ochrid.org's stylesheet control over how a Grapevine screen looks. Parsing to
 * `{ type, ... }` blocks means <Prologue/> decides the typography and nothing arbitrary can
 * be rendered — an unrecognised construct degrades to plain text rather than to markup.
 *
 * The corpus is uniform across all 366 files and this parser leans on that: every file has
 * the `# <div id="date">` heading, and the same four `##` sections in the same order after
 * the day's commemorations. Anything else under a `##` is read as another commemoration,
 * which is what makes a day with five saints work without listing them anywhere. */

/* The four sections every day closes with, in the order they appear. Everything above the
 * first of them is a saint's life, so this list is also what separates the two halves. */
const FIXED_SECTIONS = [
    { key: "hymn", heading: "HYMN OF PRAISE" },
    { key: "reflection", heading: "REFLECTION" },
    { key: "contemplation", heading: "CONTEMPLATION" },
    { key: "homily", heading: "HOMILY" },
]

const FIXED_BY_HEADING = new Map(
    FIXED_SECTIONS.map(({ key, heading }) => [heading, key]),
)

/* A styled <div> the text depends on, as opposed to the decorative ones stripped below.
 * Centred-and-crimson is the attribution under a hymn or homily title; right-aligned is the
 * scripture verse a homily is preached on. Both are matched before the generic tag strip so
 * their role survives as a block type instead of flattening into another paragraph. */
const STYLED_BLOCKS = [
    { type: "subtitle", re: /<div style=\{\{textAlign:'center'[^}]*\}\}>([\s\S]*?)<\/div>/ },
    { type: "epigraph", re: /<div style=\{\{textAlign:'right'[^}]*\}\}>([\s\S]*?)<\/div>/ },
]

/* Where the footnote definitions begin. Everything below is `[^n]: text` pairs, which are
 * collected separately so the homily's own text does not end with a glossary. */
const FOOTNOTES = /\n---\s*\n\*\*Footnotes\*\*\s*\n/

/* Cross-references to another day of the Prologue, written as ordinary markdown links to
 * ochrid.org's own routes ("/march/11th"). Reduced to their label rather than carried
 * through: the target is a route on somebody else's site, and this app has one day open at
 * a time, so there is nowhere here for "St. Sophronius" to lead. */
const CROSS_REFERENCE = /\[([^\]]+)\]\([^)]*\)/g

/* The Prologue's translation renders a closing double quote as two apostrophes, which is
 * faithful to the printed book and wrong in a browser, where it reads as a typo. */
const normalizeText = (text) =>
    text
        .replace(CROSS_REFERENCE, "$1")
        .replace(/''/g, "”")
        .replace(/\s+/g, " ")
        .trim()

/* Strips any JSX left after the meaningful constructs have been claimed. Self-closing
 * components carry no text and go entirely; paired tags keep their contents, which is what
 * preserves the inline <span> glosses ("[Priest-martyr]") that annotate a saint's title. */
const stripJsx = (text) =>
    text
        .replace(/<[A-Za-z][A-Za-z0-9]*\b[^>]*\/>/g, " ")
        .replace(/<\/?[A-Za-z][A-Za-z0-9]*\b[^>]*>/g, "")

const clean = (text) => normalizeText(stripJsx(text))

/* Reads the single-quoted value of a frontmatter key. */
const frontmatterValue = (block, key) =>
    block.match(new RegExp(`^${key}:\\s*'([\\s\\S]*?)'\\s*$`, "m"))?.[1]?.trim() ?? null

/* Prose between the styled blocks: paragraphs, the hymn's verse lines, and the numbered
 * points a Contemplation is built from.
 *
 * A hymn's line breaks are the form rather than wrapping, so its lines are kept one by one
 * — joining them into a paragraph is the same loss as reflowing a poem. The corpus marks
 * them two ways and both have to be read: most days blockquote the verse, but a good number
 * instead end each line with a markdown hard break (two trailing spaces), which is why the
 * raw line is tested before it is trimmed. A hard break says the *next* line is still verse,
 * so the run takes in the unmarked line that closes the stanza; it may only extend a verse
 * already under way, never open one, or a stray trailing space in prose would start a poem.
 *
 * Consecutive verse lines gather into one block, so the decorative separator between two
 * stanzas (an emptied-out <div>) ends one and opens the next with no rule of its own. */
const proseBlocks = (source) => {
    const blocks = []
    let paragraph = []
    let verse = []
    let list = []

    const flushParagraph = () => {
        if (!paragraph.length) return
        const text = clean(paragraph.join(" "))
        if (text) blocks.push({ type: "paragraph", text })
        paragraph = []
    }

    const flushVerse = () => {
        if (!verse.length) return
        blocks.push({ type: "verse", lines: verse })
        verse = []
    }

    const flushList = () => {
        if (!list.length) return
        blocks.push({ type: "list", items: list })
        list = []
    }

    const flushAll = () => {
        flushParagraph()
        flushVerse()
        flushList()
    }

    /* What a blank line ends — and it does **not** end a list.
     *
     * The Contemplation's points are separated by blank lines, which is an ordinary loose
     * markdown list and not three lists of one. Closing on the blank made each point its own
     * <ol>, so every one of them restarted its numbering at 1. A list is closed by content
     * that is not a list item, which the paragraph and verse branches below both do. */
    const flushBlank = () => {
        flushParagraph()
        flushVerse()
    }

    const lines = source.split(/\r?\n/)
    const hardBreak = lines.map((line) => /\S {2,}$/.test(line))

    const pushVerse = (text) => {
        flushParagraph()
        flushList()
        /* A line that was nothing but a stripped component leaves an empty verse line,
         * which would otherwise print as a blank row mid-stanza. */
        if (text) verse.push(text)
    }

    lines.forEach((raw, index) => {
        const line = raw.trim()

        if (!line) {
            flushBlank()
            return
        }

        if (line.startsWith(">")) {
            pushVerse(clean(line.slice(1)))
            return
        }

        /* Ahead of the hard-break test, so a numbered point that happens to carry trailing
         * whitespace stays a list item. */
        const item = line.match(/^(\d+)\.\s+(.*)$/)
        if (item) {
            flushParagraph()
            flushVerse()
            const text = clean(item[2])
            if (text) list.push(text)
            return
        }

        if (hardBreak[index] || (verse.length && index > 0 && hardBreak[index - 1])) {
            pushVerse(clean(line))
            return
        }

        flushVerse()
        flushList()
        paragraph.push(line)
    })

    flushAll()
    return blocks
}

/* Splits a section body at each styled <div>, so the surrounding prose and the styled block
 * stay in document order. Scanning for the earliest remaining match rather than running one
 * pattern to exhaustion is what keeps a homily's attribution above its scripture verse. */
const toBlocks = (source) => {
    const blocks = []
    let rest = source

    while (rest) {
        let earliest = null

        for (const { type, re } of STYLED_BLOCKS) {
            const match = rest.match(re)
            if (match && (!earliest || match.index < earliest.match.index)) {
                earliest = { type, match }
            }
        }

        if (!earliest) break

        blocks.push(...proseBlocks(rest.slice(0, earliest.match.index)))
        const text = clean(earliest.match[1])
        if (text) blocks.push({ type: earliest.type, text })
        rest = rest.slice(earliest.match.index + earliest.match[0].length)
    }

    blocks.push(...proseBlocks(rest))
    return blocks
}

/* `[^1]: the note` pairs, in the order they are defined. A definition can run past its own
 * line, so each one is read up to the next marker rather than to the next newline. */
const parseFootnotes = (source) => {
    if (!source) return []

    const notes = []
    const pattern = /\[\^([^\]]+)\]:\s*([\s\S]*?)(?=\n\[\^|$)/g

    for (const [, label, text] of source.matchAll(pattern)) {
        const body = clean(text)
        if (body) notes.push({ label, text: body })
    }

    return notes
}

/* One day of the Prologue.
 *
 * Returns:
 *   date          — "September 2", as the source prints it
 *   title         — the day's commemorations as one line
 *   lives         — [{ heading, blocks }], one per saint commemorated
 *   hymn,
 *   reflection,
 *   contemplation,
 *   homily        — { heading, blocks } each, or null on the rare day one is absent
 *   footnotes     — [{ label, text }]
 *
 * Throws on a file with no `##` sections at all, which is the one shape that means the
 * fetch returned something other than a day of the Prologue — GitHub's 404 page reaches the
 * caller as a 200 in some proxy configurations, and parsing it silently would surface as an
 * empty screen rather than as an error. */
export const parsePrologue = (mdx) => {
    const frontmatter = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)

    let body = frontmatter ? mdx.slice(frontmatter[0].length) : mdx

    /* Site chrome, in the order it has to go: the imports name the components, the
     * components render the paginator and the running head, and the images are the
     * decorative rules between sections. None of it is the reading. */
    body = body
        .replace(/^import\s+.*$/gm, "")
        .replace(/<(CustomPaginator|RunningHead)\b[^>]*\/>/g, "")

    const heading = body.match(/^#\s+<div id="date">([\s\S]*?)<\/div>\s*$/m)
    const date = heading ? clean(heading[1]) : null
    if (heading) body = body.slice(body.indexOf(heading[0]) + heading[0].length)

    const [content, footnoteSource] = body.split(FOOTNOTES)

    /* Splitting on the capture keeps heading and body adjacent in the result array, so the
     * pairs can be walked two at a time. Index 0 is whatever preceded the first heading. */
    const parts = content.split(/^##\s+(.+?)\s*$/m)
    if (parts.length < 3) {
        throw new Error("Prologue source has no sections")
    }

    const day = {
        date,
        title: null,
        lives: [],
        hymn: null,
        reflection: null,
        contemplation: null,
        homily: null,
        footnotes: parseFootnotes(footnoteSource),
    }

    for (let i = 1; i < parts.length; i += 2) {
        const label = clean(parts[i])
        const section = { heading: label, blocks: toBlocks(parts[i + 1] ?? "") }
        const fixed = FIXED_BY_HEADING.get(label.toUpperCase())

        if (fixed) day[fixed] = section
        else day.lives.push(section)
    }

    /* Frontmatter states the day's commemorations as one line, and two files in the corpus
     * are missing it. Composing the same line from the headings is the fallback, because
     * those headings are what that line is a summary of. */
    day.title =
        (frontmatter && frontmatterValue(frontmatter[1], "title")) ||
        day.lives.map((life) => life.heading).join(", ") ||
        null

    return day
}
