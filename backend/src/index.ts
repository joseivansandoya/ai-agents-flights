import "dotenv/config";
import express, { Express, Request, Response } from "express";

import agentRouter from "./api/routes/agent.router";

const app: Express = express();
const port = 5005;

// Add middleware to parse JSON bodies
app.use(express.json());
// Add CORS middleware
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Routes

app.use("/agent", agentRouter);
app.get("/", (_: Request, res: Response) => {
  res.send("Welcome to Ai Agents");
});
app.use((_: Request, res: Response) => {
  res.status(404).send("404 - Not Found");
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
