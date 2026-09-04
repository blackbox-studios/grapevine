"use client"

import EventsView from "@/components/EventsView"

/* `/events`. The surface is `<EventsView/>`, which is also what `RUNTIME_SURFACES` renders for
 * `/events/s/:sheetId` — one component, so a rota reached by a link lands on exactly the same
 * screen as a rota reached by tapping one. See that component's header. */
const EventsPage = () => <EventsView />

export default EventsPage
