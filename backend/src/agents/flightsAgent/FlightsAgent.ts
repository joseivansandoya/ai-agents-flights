import { Agent, Runner, webSearchTool } from "@openai/agents";
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

interface FlightsAgentCallbacks {
  onTextStream?: (text: string) => void;
  onCompleted?: (lastResponseId?: string) => void;
  onError?: (text: string) => void;
}

export class FlightsAgent {
  private runner: Runner;
  private callbacks: FlightsAgentCallbacks;

  // agents
  private inputGuardrailAgent: any;
  private queryParserAgent: any;
  private searchAgent: any;
  private webDeveloperAgent: any;

  public constructor(callbacks: FlightsAgentCallbacks) {
    this.runner = new Runner({
      model: 'gpt-4.1-mini',
    });

    this.callbacks = callbacks;

    this.inputGuardrailAgent = this.buildInputGuardrailAgent();
    this.queryParserAgent = this.buildQueryParserAgent();
    this.searchAgent = this.buildSearchAgent();
    this.webDeveloperAgent = this.buildWebDeveloperAgent();
    
    this.attachHooks(this.inputGuardrailAgent);
    this.attachHooks(this.queryParserAgent);
    this.attachHooks(this.searchAgent);
    this.attachHooks(this.webDeveloperAgent);
  }

  public async run(prompt: string, previousResponseId?: string) {
    try {
      // 1. Input guardrails
      this.callbacks.onTextStream?.("🔍 Analyzing your request...\n");
      const inputGuardrailResult = await this.runner.run(
        this.inputGuardrailAgent,
        prompt,
        {
          ...(previousResponseId && { previousResponseId }),
        }
      );
      
      if (!inputGuardrailResult.finalOutput?.isFlightsQuery) {
        this.callbacks.onError?.(
          'This assistant only answers flights questions. Try asking about flights!'
        );
        this.callbacks.onCompleted?.(inputGuardrailResult.lastResponseId);
        return;
      }

      // 2. Parse the flight query
      this.callbacks.onTextStream?.("✈️ Parsing your flight request...\n");
      const queryResult = await this.runner.run(
        this.queryParserAgent,
        prompt,
      );

      // Check if we have enough information
      const flightQuery = queryResult.finalOutput;
      if (!flightQuery?.destination || !flightQuery?.departureDate) {
        let missingFields = [];
        if (!flightQuery?.destination) missingFields.push('destination');
        if (!flightQuery?.departureDate) missingFields.push('departure date');
        
        this.callbacks.onTextStream?.(`❌ Missing required information: ${missingFields.join(', ')}. Please provide these details to search for flights.\n`);
        this.callbacks.onCompleted?.(queryResult.lastResponseId);
        return;
      }

      // 3. Search for flights
      this.callbacks.onTextStream?.("🔎 Searching for flights...\n");
      const searchResult = await this.runner.run(
        this.searchAgent,
        JSON.stringify(flightQuery),
      );

      // 4. Generate HTML presentation
      this.callbacks.onTextStream?.("📝 Preparing your flight results...\n");
      const webResult = await this.runner.run(
        this.webDeveloperAgent,
        JSON.stringify({
          results: searchResult.finalOutput?.results || [],
          query: flightQuery
        }),
      );

      // 5. Stream the final HTML
      if (webResult.finalOutput?.html) {
        this.callbacks.onTextStream?.("✅ Here are your flight search results:\n\n");
        this.callbacks.onTextStream?.(webResult.finalOutput.html);
      } else {
        this.callbacks.onTextStream?.("❌ Unable to generate flight results. Please try again.\n");
      }

      this.callbacks.onCompleted?.(webResult.lastResponseId);

    } catch (error) {
      this.callbacks.onError?.(`An error occurred while processing your request: ${error}`);
    }
  }

  // private methods

  private buildInputGuardrailAgent() {
    return new Agent({
      name: 'Flights-only filter',
      instructions: `Read the user's message and output **exactly** the JSON:\n\n{"isFlightsQuery": <true|false>}.
        Criteria: message involves flights, airfare, airlines, airports, tickets, or dated travel plans.
        If there is a previous response (look at the previousResponseId) take into account if the new message is
        still related to it and ultimately to flights, airfare, airlines, airports, tickets, or dated travel plans.
        `,
      outputType: z.object({ isFlightsQuery: z.boolean() }),
      model: 'gpt-4.1-mini',
    });
  }

  private buildQueryParserAgent() {
    return new Agent({
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
        - Handle holiday references (e.g., "Canada Day" = July 1st of current year, "Christmas" = December 25th)
        - Handle seasonal references (e.g., "summer", "winter break")
  
        Examples:
        - "I want to fly from Toronto to Vancouver on March 15th" → origin: "Toronto", destination: "Vancouver", departureDate: "2025-03-15"
        - "Flights to Paris next summer" → origin: "Winnipeg", destination: "Paris", departureDate: "2025-06-01" (approximate)
        - "Round trip to New York from Montreal on December 20th, returning January 5th" → origin: "Montreal", destination: "New York", departureDate: "2025-12-20", returnDate: "2026-01-05"
        - "fly to ny from winnipeg, on xmass and return 2 weeks later" → origin: "Winnipeg", destination: "New York", departureDate: "2025-12-25", returnDate: "2026-01-08"
  
        Only include fields that are provided or can be reasonably inferred. Leave fields empty if not specified.`,
      outputType: FlightQuery,
      model: 'gpt-4.1-mini',
    });
  }

  private buildSearchAgent() {
    return new Agent({
      name: 'Search Agent',
      instructions: `
        Use the JSON flight query parameters you received to perform a web search.
        The parameters should look like a JSON object with these fields: origin, destination, departureDate, and returnDate.
        Use the JSON information to perform the web search.

        IMPORTANT: prioritize official Airlines websites rather than travel agencies.
        Perform the web search and only pick the five most relevant results.
        Pick only 5 results maximum.

        Format your search query to include flight information like:
        "flights from [origin] to [destination] on [departureDate]"
        `,
      tools: [webSearchTool()],
      outputType: z.object({
        results: z.array(WebSearchResult)
      }),
      modelSettings: {
        toolChoice: 'required',
      }
    });
  }

  private buildWebDeveloperAgent() {
    return new Agent({
      name: 'Web Developer Agent',
      instructions: `You are a web development agent that creates beautiful HTML pages for flight search results.
        
        You will receive a JSON object with:
        - results: array of search results with flight information
        - query: the original flight query (origin, destination, dates)
        
        Your job is to build a complete, standalone HTML page with embedded CSS that displays the search results.
        
        REQUIREMENTS:
        - Generate a single HTML document with embedded CSS in <style> tags
        - Create a modern, responsive design with a clean layout
        - Display all flight search results in an organized way
        - Include the search criteria at the top
        - Use proper styling with colors, fonts, and spacing
        - Make it mobile-friendly
        - Include flight details like price, airline, and links
        
        DESIGN GUIDELINES:
        - Use a professional color scheme (blues/whites work well for travel)
        - Card-based layout for each flight result
        - Clear typography and good spacing
        - Hover effects and modern styling
        - Include icons or emojis for visual appeal
        
        Return ONLY the complete HTML as a string in your response with the key "html".`,
      outputType: z.object({
        html: z.string()
      }),
      model: 'gpt-4.1-mini',
    });
  }

  private attachHooks(agent: Agent<any, any>) {
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
}
