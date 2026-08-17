// Prisma configuration. Consumed only by the Prisma CLI (migrate/generate/seed/studio),
// never by the Next.js build. `import "dotenv/config"` loads .env / .env.local so
// DATABASE_URL and DIRECT_URL are available to the CLI.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Registered here rather than only as an npm script, so `prisma db seed` works and
    // the CLI knows how to reseed. Note the CLI does NOT run this automatically after a
    // migrate or a reset — seeding is always an explicit step. `npm run db:reset` chains
    // it deliberately.
    seed: "node prisma/seed.js",
  },
});
