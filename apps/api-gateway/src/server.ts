import http from "http";
import { app } from "./app";
import { env } from "./config/env";
import { attachWatchPartyUpgrade } from "./watch-party/ws";

const server = http.createServer(app);

attachWatchPartyUpgrade(server);

server.listen(env.port, () => {
  console.log(`API Gateway running on port ${env.port}`);
});
