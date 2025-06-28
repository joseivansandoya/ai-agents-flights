import "dotenv/config";
import { Agent, Runner } from "@openai/agents";
import { Request, Response, Router } from "express";

const storyTellerAgent = new Agent({
  name: 'Storyteller',
  instructions:
    'You are a talented story teller that can tell an engaging 3-4 paragraph story on any topic.',
});

const runner = new Runner({
  model: 'gpt-4.1-mini',
});

const agentRouter = Router();

agentRouter.post("/", async (req: Request, res: Response) => {
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

export default agentRouter;
