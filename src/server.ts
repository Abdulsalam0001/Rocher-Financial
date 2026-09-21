import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(morgan("combined"));
app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "rocher-mutuel-financial",
    environment: process.env.NODE_ENV ?? "development"
  });
});

app.get("/api", (_req, res) => {
  res.json({
    name: "Rocher Mutuel Financial",
    message: "A modern financial institution built from Monaco, for an increasingly international world."
  });
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Rocher Mutuel Financial listening on port ${port}`);
});
