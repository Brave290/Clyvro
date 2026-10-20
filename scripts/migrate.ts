/** Run migrations ahead of deploy: DATABASE_URL=... npm run db:migrate */
import { createDb } from "../src/lib/db";

async function main() {
  await createDb();
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
