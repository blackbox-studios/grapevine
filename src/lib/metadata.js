/* In-memory seed data for the demo. The stores clone this on init, then mutate
 * their own copy in-session. Nothing persists to disk or across reloads —
 * reload the page to reset to this baseline. */

export const CURRENT_USER = {
    id: "7e799cc2-e781-447e-94a1-b825d08df9ca",
    email: "admin@ozora.com",
    full_name: "Ozora Admin",
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
