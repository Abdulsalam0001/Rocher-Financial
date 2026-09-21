import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(helmet());
app.use(express.json());
app.use(morgan("combined"));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "rocher-mutuel-financial",
    environment: process.env.NODE_ENV ?? "development"
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "Rocher Mutuel Financial",
    message: "A modern financial institution built from Monaco, for an increasingly international world."
  });
});

app.listen(port, () => {
  console.log(`Rocher Mutuel Financial API listening on port ${port}`);
});
