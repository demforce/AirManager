Domain services (one file per domain, e.g. `flights.service.ts`) — the only layer allowed to import the Prisma client; routes and pages call these, never Prisma directly.
