import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the built Mini App from the same origin as the API/WebSocket server.
// Replit autoscale starts this process as its single public service.
const clientDist = path.resolve(import.meta.dirname, "../../telegram-game/dist/public");
app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path === "/api" || req.path.startsWith("/api/") || !req.accepts("html")) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

export default app;
