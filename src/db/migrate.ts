import { client } from "./index";
import { applySchema } from "./schema-setup";

/** Creates the tables and columns if they aren't there yet. Safe to re-run. */
export async function migrate(): Promise<void> {
  await applySchema(client);
}
