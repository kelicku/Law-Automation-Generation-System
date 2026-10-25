import { resetDb } from "./helpers";

export default async function globalSetup() {
  await resetDb();
}
