import {
    HANDLE_MAX,
    RANKED_VOCATIONS,
    VOCATION_HANDLE_PREFIX,
    VOCATION_TITLE,
} from "@/lib/constants"

/* How a person is written, everywhere.
 *
 * **A person is addressed by the name they typed.** `Profile.displayName` holds it — "Priest
 * Alexander", "Dn. Paul", "Rob" — and nothing here composes one out of a rank and a Christian
 * name. That composition has no correct answer: `patronSaint` holds a saint written as the
 * Church writes him, so "The Right-Believing Prince Alexander Nevsky" is a correct value to
 * store and an impossible one to prefix with "Priest". See the `displayName` column in
 * `prisma/schema.prisma`.
 *
 * What survives is `suggestDisplayName()`, which proposes that composition into an editable
 * field at orientation and in Settings. It is the *only* function here that reads a vocation,
 * and it is only ever a suggestion.
 *
 * `firstName` and `lastName` stay the legal name, and `fullName()` is where the roster gets a
 * surname to sort on. Two functions rather than one because they answer different questions:
 * "Priest Alexander" has no surname in it, and a roster ordered on it would be ordered on
 * ranks.
 *
 * Every function here tolerates a missing name, because a Profile exists from the moment an
 * admin admits an email address and has no name until that person completes orientation. The
 * handle is the fallback throughout — it is the one identifier that always exists. */

/* The name to show: whatever the person set, else their legal name, else "@handle".
 *
 * Takes the author/viewer/member object whole rather than loose arguments, so every call site
 * passes the same thing and adding a field later does not mean touching them all. */
export const displayName = (person) => {
    if (!person) return ""

    const chosen = person.displayName?.trim()
    if (chosen) return chosen

    return fullName(person)
}

/* Given and family name, with no title — for the roster, search, and anywhere sorting by
 * surname has to agree with what is on screen. Falls back to the handle for the same reason
 * `displayName` does.
 *
 * It ignores `displayName` deliberately: a person who set theirs to "Priest Alexander" still
 * files under Petrov, and a list that sorted on the addressed name would put every priest in
 * the parish together under P. */
export const fullName = (person) => {
    if (!person) return ""
    const parts = [person.firstName?.trim(), person.lastName?.trim()].filter(Boolean)
    if (parts.length === 0) return person.handle ? `@${person.handle}` : ""
    return parts.join(" ")
}

/* Up to two letters for the gradient avatar fallback.
 *
 * Built from the legal name parts rather than by splitting the display name, because that
 * string may lead with a title — "Dn. Paul" would otherwise initialize as "DP", which is
 * neither of his names. Falls back to the handle's first letter. */
export const initials = (person) => {
    if (!person) return ""
    const letters = [person.firstName?.trim()?.[0], person.lastName?.trim()?.[0]].filter(Boolean)
    if (letters.length > 0) return letters.join("").toUpperCase()
    return person.handle?.[0]?.toUpperCase() ?? ""
}

/* A starting point for the display-name field: "Dn. Paul", "Mat. Carly", "Robert Paul".
 *
 * **The one place a rank and a name are joined, and it writes into a text box rather than
 * onto a screen.** Everything the composition gets wrong — a patron saint that is a full
 * hagiographic title, a priest who goes by "Fr. Alex", a rank whose English form the parish
 * does not use — is wrong in a field the person is looking at and can correct in one edit.
 * That is the whole reason it is a suggestion and `displayName` is a column.
 *
 * The given half is `patronSaint` for the ranks a name is conferred with, because that is
 * the name they are called by; `firstName` for everyone else, and as the fallback for a
 * ranked person who has not supplied one yet. A title with nothing after it is worse than a
 * legal name, so a profile with no first name gets nothing rather than "Dn. ". */
export const suggestDisplayName = (person) => {
    if (!person) return ""

    const first = person.firstName?.trim() ?? ""
    const given = RANKED_VOCATIONS.includes(person.vocation)
        ? person.patronSaint?.trim() || first
        : first

    const title = VOCATION_TITLE[person.vocation]
    if (title) return given ? `${title} ${given}` : ""

    return [first, person.lastName?.trim()].filter(Boolean).join(" ")
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
 * `firstName` and not the patron saint, so a priest is offered `fr.robert` where he may
 * well end up addressed as "Priest Alexander". That is the ordering of orientation rather
 * than an oversight: the handle step runs before the one that asks for a patron saint, so
 * there is nothing better to propose — and the field is his to overwrite on the screen he is
 * looking at.
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
