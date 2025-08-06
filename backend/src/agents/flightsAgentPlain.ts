import { Agent, handoff, run, webSearchTool, MCPServerStdio } from "@openai/agents";
import { z } from 'zod';

const WebSearchResult = z.object({
  url: z.string(),
  title: z.string(),
  price: z.string(),
  image: z.string(),
  link: z.string(),
});

const FlightQuery = z.object({
  origin: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  departureDate: z.string().nullable().optional(),
  returnDate: z.string().nullable().optional(),
});

function attachHooks(agent: Agent<any, any>) {
  agent.on('agent_start', (_ctx, agent) => {
    console.log(`${agent.name} started`);
  });
  agent.on('agent_end', (_ctx, output) => {
    console.log(`${agent.name} ended with output ${output}`);
  });
  agent.on('agent_handoff', (_ctx, nextAgent) => {
    console.log(`${agent.name} handed off to ${nextAgent.name}`);
  });
  agent.on('agent_tool_start', (_ctx, tool) => {
    console.log(`${agent.name} started tool ${tool.name}`);
  });
  agent.on('agent_tool_end', (_ctx, tool, output) => {
    console.log(`${agent.name} tool ${tool.name} ended with output ${output}`);
  });
}

async function runAgent(prompt: string) {
  const guardrailAgent = new Agent({
    name: 'Flights-only filter',
    instructions: `Read the user's message and output **exactly** the JSON:\n\n{"isFlightsQuery": <true|false>}.
      Criteria: message involves flights, airfare, airlines, airports, tickets, or dated travel plans.
      If there is a previous response (look at the previousResponseId) take into account if the new message is
      still related to it and ultimately to flights, airfare, airlines, airports, tickets, or dated travel plans.
      `,
    outputType: z.object({ isFlightsQuery: z.boolean() }),
    model: 'gpt-4.1-mini',
  });

  const fsMcpServer = new MCPServerStdio({
    name: 'Filesystem MCP server',
    fullCommand: 'npx -y @modelcontextprotocol/server-filesystem /Users/josesandoya/Documents/lab/ai-agents-flights/backend/public',
  });
  await fsMcpServer.connect();

  const webDeveloperAgent = new Agent({
    name: 'Web developer Agent',
    instructions: `You are a web development agent.
      You will receive a JSON object with the search results.
      Your job is to build a web page with the search results.
      The web page should be a list of the search results.
      The web page should be a list of the search results.

      Generate HTML and CSS for the web page.
      Return the HTML and CSS as a string to the user.

      Once you have the HTML and CSS, write it to a file in the public directory.
      Use the exact path: /Users/josesandoya/Documents/lab/ai-agents-flights/backend/public/
      The file name should be the origin and destination concatenated with the departure date.
      The file should be named like this: origin-destination-departureDate.html
      The file should be named like this: origin-destination-departureDate.css

      Always transfer the result to the user.
    `,
    mcpServers: [fsMcpServer],
  });
  
  const searchAgent = new Agent({
    name: 'Search Agent',
    instructions: `
      Use the tool parameters you were handed off to perform a web search.
      The parameters should look like a JSON object with these fields: origin, destination, departureDate, and returnDate.
      Use the JSON information to perform the web search, do not use the user's initial query.

      IMPORTANT: prioritize oficial Airlines websites rather than travel agencies.
      Perform the web search and only pick the five most relevant results.
      Pick only 5.

      Once you obtain the search result hand it off / transfer it to the Web developer agent.
      Do not send any final response to the user. Always transfer the result to the Web developer agent (always handoff).
    `,
    tools: [webSearchTool()],
    outputType: z.object({
      results: z.array(WebSearchResult)
    }),
    modelSettings: {
      toolChoice: 'required',
    }
  });
  
  const queryParserAgent = new Agent({
    name: 'Query Parser Agent',
    instructions: `You are a flight query parser. Given a user's message, extract their flight search intent and return structured data.
  
      Extract the following information:
      - origin: departure airport/city (if not provided, use "Winnipeg" as default)
      - destination: arrival airport/city 
      - departureDate: departure date in YYYY-MM-DD format
      - returnDate: return date in YYYY-MM-DD format (for round-trip flights)
  
      Date parsing rules:
      - Convert any date reference to YYYY-MM-DD format
      - If year is not specified, use the current year ${new Date().getFullYear()}
      - Handle relative dates (e.g., "next Friday", "tomorrow", "in 2 weeks")
      - Handle holiday references (e.g., "Canada Day" = July 1st of current year)
      - Handle seasonal references (e.g., "summer", "winter break")
  
      Examples:
      - "I want to fly from Toronto to Vancouver on March 15th" → origin: "Toronto", destination: "Vancouver", departureDate: "2024-03-15"
      - "Flights to Paris next summer" → origin: "Winnipeg", destination: "Paris", departureDate: "2024-06-01" (approximate)
      - "Round trip to New York from Montreal on December 20th, returning January 5th" → origin: "Montreal", destination: "New York", departureDate: "2024-12-20", returnDate: "2025-01-05"
  
      Produce a stringify version of this JSON {origin: string, destination: string, departureDate: string, returnDate: string}
      When transfering your response to another tool/agent always return that stringified JSON.
  
      Only include fields that are provided or can be reasonably inferred. Leave fields empty if not specified.
      If all the fields are complete hand off / transfer your formatted output to the Search agent, otherwise transfer it to the Flights Agent.`,
    modelSettings: {
      toolChoice: 'required',
    },
  });
  
  const flightsAgent = new Agent({
    name: 'Flights Agent',
    instructions: `
      You are the Flight Agent - you work as an orchestrator agent for a flights/travel agency.
  
      You will receive a user prompt and this is the workflow that you are going to use:
  
      1. When you receive the user prompt, transfer it to the Query Parser Agent
      2. If the Query Parser Agent needs more information from the user it will let you know
      3. If more information is required send a final response to the user about this
      3. If everything goes well you will receive the final response from the Presentation Agent
      4. Once you receive the response from the Presentation Agent, send a final response to the user
    `,
    handoffs: [queryParserAgent],
  });
  
  queryParserAgent.handoffs.push(
    handoff(flightsAgent),
    handoff(searchAgent, {
      inputType: FlightQuery,
      onHandoff: (_ctx, input) => {
        console.log('>>> query-to-search', input)
      },
    }),
  );

  searchAgent.handoffs.push(
    handoff(webDeveloperAgent, {
      inputType: z.object({
        results: z.array(WebSearchResult)
      }),
      onHandoff: (_ctx, input) => {
        console.log('>>> search-to-web-developer', input)
      },
    }),
  );
  
  attachHooks(guardrailAgent);
  attachHooks(flightsAgent);
  attachHooks(queryParserAgent);
  attachHooks(searchAgent);
  attachHooks(webDeveloperAgent);

  const inputGuardrailResult = await run(
    guardrailAgent,
    prompt,
  );
  if (!inputGuardrailResult.finalOutput?.isFlightsQuery) {
    console.log(
      'This assistant only answers flights questions. Try asking about flights!'
    );
    return;
  }

  const result = await run(
    flightsAgent,
    prompt,
  );

  console.log('>>> result', result.finalOutput);
}

runAgent('fly to ny from winnipeg, on xmass and return 2 weeks later');
// runAgent('fly to ny');
