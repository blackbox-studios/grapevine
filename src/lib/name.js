import {
    CHRISTIAN_NAME_VOCATIONS,
    HANDLE_MAX,
    VOCATION_HANDLE_PREFIX,
    VOCATION_TITLE,
} from "@/lib/constants"

/* How a person is written, everywhere.
 *
 * The database stores `firstName`, `lastName`, and `vocation` as three separate facts and
 * no display string at all — see the Profile model in `prisma/schema.prisma`. This module
 * is where they become a name, and it is deliberately the *only* place that happens: a
 * second `${first} ${last}` at a call site is how the feed and the roster start disagreeing
 * about what to call the same deacon.
 *
 * **Clergy are addressed by title and given name; everyone else by given and family name.**
 * That is the parish convention, not a shortening — "Dn. Paul" is his name in the nave, and
 * "Dn. Paul Ivanov" is not how anyone speaks to him. Surnames are still stored and still
 * searched and sorted on by the roster; they are simply not part of how a ranked person is
 * addressed. `fullName()` exists for the places that genuinely want both parts.
 *
 * **And for a reader and above the given name is the Christian one, not the legal one** —
 * see `givenName()` below, which every function here goes through.
 *
 * Every function here tolerates a missing name, because a Profile exists from the moment an
 * admin admits an email address and has no name until that person completes orientation.
 * The handle is the fallback throughout — it is the one identifier that always exists. */

/* The name a person is called by.
 *
 * For a **reader and above** that is `christianName`, the name conferred with the rank: a
 * priest whose legal name is Robert and whose Christian name is Alexander is Fr. Alexander to
 * everyone in the parish, and "Priest Robert" names a man nobody knows. It can be conferred
 * more than once — again at tonsure, again at consecration — which is why the column holds
 * the current one rather than a baptismal record. For everyone else it is `firstName`; a
 * layman is called what he is called.
 *
 * Falls back to `firstName` whenever the Christian name is missing — a deacon admitted last
 * week may not have finished orientation, and "Dn." with nothing after it is worse than his
 * legal name. */
const givenName = (person) => {
    const first = person.firstName?.trim() ?? ""
    if (!CHRISTIAN_NAME_VOCATIONS.includes(person.vocation)) return first
    return person.christianName?.trim() || first
}

/* The name to show: "Dn. Paul", "Jordan Rivera", or "@handle" for someone who has not
 * finished orientation.
 *
 * Takes the author/viewer/member object whole rather than loose arguments, so every call
 * site passes the same thing and adding a field later does not mean touching them all. */
export const displayName = (person) => {
    if (!person) return ""

    const first = givenName(person)
    const last = person.lastName?.trim() ?? ""
    const title = VOCATION_TITLE[person.vocation]

    /* No name yet — an admitted address that has never signed in. The handle always
     * exists, and showing it beats an empty byline or a bare title with nobody attached. */
    if (!first && !last) return person.handle ? `@${person.handle}` : ""

    /* A title needs a given name to attach to. Someone ranked who has somehow only a
     * surname recorded falls through to the plain form rather than reading "Dn. Ivanov",
     * which addresses him as a person he is not. */
    if (title && first) return `${title} ${first}`

    return [first, last].filter(Boolean).join(" ")
}

/* Given and family name, with no title — for the roster, search, and anywhere sorting by
 * surname has to agree with what is on screen. Falls back to the handle for the same reason
 * `displayName` does.
 *
 * The given half is `givenName()`, so a priest reads as "Alexander Petrov" here and "Priest
 * Alexander" in a byline. Two lists that named the same man differently would be worse than
 * either choice — which is the whole reason this module exists. */
export const fullName = (person) => {
    if (!person) return ""
    const parts = [givenName(person), person.lastName?.trim()].filter(Boolean)
    if (parts.length === 0) return person.handle ? `@${person.handle}` : ""
    return parts.join(" ")
}

/* Up to two letters for the gradient avatar fallback.
 *
 * Built from the name parts rather than by splitting a display string, because the display
 * string may lead with a title — "Dn. Paul" would otherwise initialize as "DP", which is
 * neither of his names. Falls back to the handle's first letter. */
export const initials = (person) => {
    if (!person) return ""
    const letters = [givenName(person)[0], person.lastName?.trim()?.[0]].filter(Boolean)
    if (letters.length > 0) return letters.join("").toUpperCase()
    return person.handle?.[0]?.toUpperCase() ?? ""
}

/* What the viewer typed, as a handle would be stored: lowercased, stripped of a leading @
 * (people type it, and it is not part of the value), and clipped to the maximum.
 *
 * Applied as the field's onChange rather than only at submit, so the input shows the value
 * that will actually be saved instead of silently transforming it afterwards. The server
 * runs the same normalization — this one is for the typing experience, not for safety. */
export const normalizeHandleInput = (value) =>
    String(value ?? "")
        .trim()
        .replace(/^@+/, "")
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, HANDLE_MAX)

/* A handle suggestion, following the same convention as a byline: **rank and given name for
 * anyone who holds one, given and family name for everyone else.**
 *
 *   READER   Justinian Cross   → rdr.justinian
 *   MATUSHKA Carly Petrov      → mat.carly
 *   FAITHFUL Robert Paul       → robert.paul
 *
 * That parallel is the point. A reader is "Reader Justinian" in the nave and on a post card,
 * so proposing `justinian.cross` would hand him an identity nobody uses — while a layman
 * addressed as "Robert Paul" would find `robert` alone both presumptuous and likely taken.
 * The suggestion follows how each person is actually named.
 *
 * `firstName` and not `givenName()`, so a priest is offered `fr.robert` where his byline will
 * read "Priest Alexander". That is the ordering of orientation rather than an oversight: the
 * handle step runs before the one that asks for a Christian name, so there is nothing better
 * to propose — and the field is his to overwrite on the screen he is looking at.
 *
 * Only a starting point: the field it fills is editable, the availability check decides
 * whether it survives, and nothing re-derives it if the person is later ordained — their
 * handle is theirs by then. */
export const suggestHandle = ({ firstName, lastName, vocation }) => {
    const part = (value) => normalizeHandleInput(value).replace(/[._-]+/g, "")

    const first = part(firstName)
    const last = part(lastName)
    const prefix = VOCATION_HANDLE_PREFIX[vocation]

    const base = prefix && first ? `${prefix}.${first}` : [first, last].filter(Boolean).join(".")

    /* Clipped to the maximum, then stripped of any separator the clip left dangling —
     * `HANDLE_PATTERN` requires a handle to end on a letter or number, and a suggestion that
     * fails validation the instant it appears is worse than none. */
    return base.slice(0, HANDLE_MAX).replace(/[._-]+$/, "")
}
