import express, { Express, Request, Response } from "express";

const app: Express = express();
const port = 5005;

app.get("/", (_: Request, res: Response) => {
  res.send("Welcome to Ai Agents");
});

// SSE endpoint for streaming text
app.get("/stream", (req: Request, res: Response) => {
  // Set headers for SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control"
  });

  const loremText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

  let index = 0;

  const streamText = () => {
    if (index < loremText.length) {
      const char = loremText[index];
      // Send the character as an SSE event
      res.write(`data: ${JSON.stringify({ char, index })}\n\n`);
      index++;
      
      // Continue streaming with a small delay
      setTimeout(streamText, 50); // 50ms delay between characters
    } else {
      // Send end event
      res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
      res.end();
    }
  };

  // Start streaming
  streamText();

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
