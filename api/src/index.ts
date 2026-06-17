import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env["PORT"] ?? 8080);

app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
