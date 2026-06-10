import { app } from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`API Gateway running on port ${env.port}`);
});