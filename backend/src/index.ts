import express, { Express, Request, Response } from "express";

const app: Express = express();
const port = 5005;

app.get("/", (_: Request, res: Response) => {
  res.send("Welcome to Ai Agents");
});

app.use((_: Request, res: Response) => {
  res.status(404).send("404 - Not Found");
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
