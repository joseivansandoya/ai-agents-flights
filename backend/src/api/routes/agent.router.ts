import { Request, Response, Router } from "express";

import { FlightsAgent } from "../../agents/flightsAgent/FlightsAgent";

const agentRouter = Router();

agentRouter.post("/", async (req: Request, res: Response) => {
  const { prompt, lastResponseId } = req.body;

  // Set headers for SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control"
  });

  const agent = new FlightsAgent({
    onTextStream: (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    },
    onCompleted: (lastResponseId?: string) => {
      res.write(`data: ${JSON.stringify({ type: "end", lastResponseId })}\n\n`);
      res.end();
    },
    onError: (error) => {
      res.write(`data: ${JSON.stringify({ text: error })}\n\n`);
    }
  });

  await agent.run(prompt, lastResponseId);

  // Handle client disconnect
  req.on("close", () => {
    console.log("Client disconnected from SSE stream");
  });
});

export default agentRouter;
