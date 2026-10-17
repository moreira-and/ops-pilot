import { createApp } from "./http/server.js";

if (process.argv[1]?.endsWith("/index.ts")) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port);
}