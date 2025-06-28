import { Request, Response, Router } from "express";

import { StoryTellerAgent } from "../../agents/storyTeller/storyTellerAgent"

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

  const agent = new StoryTellerAgent({
    onTextStream: (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    },
    onCompleted: () => {
      res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
      res.end();
    }
  });

  await agent.run(prompt);

  // Handle client disconnect
  req.on("close", () => {
    console.log("Client disconnected from SSE stream");
  });
});

export default agentRouter;
