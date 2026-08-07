// Prisma configuration. Consumed only by the Prisma CLI (migrate/generate/studio),
// never by the Next.js build. `import "dotenv/config"` loads .env / .env.local so
// DATABASE_URL is available to the CLI.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
