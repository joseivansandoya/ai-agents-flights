import 'dotenv/config';
import { Agent, Runner } from '@openai/agents';
import express, { Express, Request, Response } from "express";

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

const storyTellerAgent = new Agent({
  name: 'Storyteller',
  instructions:
    'You are a talented story teller that can tell an engaging 3-4 paragraph story on any topic.',
});

const runner = new Runner({
  model: 'gpt-4.1-mini',
});

app.get("/", (_: Request, res: Response) => {
  res.send("Welcome to Ai Agents");
});

// SSE endpoint for streaming text
app.post("/stream", async (req: Request, res: Response) => {
  const { prompt } = req.body;
  
  // Set headers for SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control"
  });

  // Stream AI Agent response
  const storyStream = await runner.run(
    storyTellerAgent,
    prompt,
    {
      // enable streaming
      stream: true,
    },
  );
  for await (const text of storyStream.toTextStream()) {
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  }
  // waiting to make sure that we are done with handling the stream
  await storyStream.completed;
  res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
  res.end();

  // Handle client disconnect
  req.on("close", () => {
    console.log("Client disconnected from SSE stream");
  });
});

app.use((_: Request, res: Response) => {
  res.status(404).send("404 - Not Found");
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
