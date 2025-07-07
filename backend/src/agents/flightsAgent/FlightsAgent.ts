import { Agent, Runner, tool } from "@openai/agents";
import { z } from 'zod';

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
  private fightsAgent: any;
  private orchestratorAgent: any;
  private queryAgent: any;

  public constructor(callbacks: FlightsAgentCallbacks) {
    this.runner = new Runner({
      model: 'gpt-4.1-mini',
    });

    this.callbacks = callbacks;

    this.inputGuardrailAgent = this.buildInputGuardrailAgent();
    this.fightsAgent = this.buildFlightsAgent();
    this.orchestratorAgent = this.buildOrchestratorAgent();
    this.queryAgent = this.buildQueryAgent();
    
    this.attachHooks(this.inputGuardrailAgent);
    this.attachHooks(this.fightsAgent);
    this.attachHooks(this.orchestratorAgent);
    this.attachHooks(this.queryAgent);
  }

  public async run(prompt: string, previousResponseId?: string) {
    // 1. input guardrails
    const inputGuardrailResult = await this.runner.run(
      this.buildInputGuardrailAgent(),
      prompt,
      {
        ...(previousResponseId && { previousResponseId }),
      }
    );
    if (!inputGuardrailResult.finalOutput?.isFlightsQuery) {
      const lastResponseId = inputGuardrailResult.lastResponseId;
      this.callbacks.onError?.(
        'This assistant only answers flights questions. Try asking about flights!'
      );
      this.callbacks.onCompleted?.(lastResponseId);
      return;
    }

    // 2. proceed with the flights agent
    const flightsAgentResult = await this.runner.run(
      this.fightsAgent,
      prompt,
      {
        stream: true,
        ...(previousResponseId && { previousResponseId }),
      }
    );

    for await (const text of flightsAgentResult.toTextStream()) {
      this.callbacks.onTextStream?.(text);
    }

    // waiting to make sure that we are done with handling the stream
    await flightsAgentResult.completed;
    const lastResponseId = flightsAgentResult.lastResponseId;
    this.callbacks.onCompleted?.(lastResponseId);
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

  private buildFlightsAgent() {
    return new Agent({
      name: 'Flights Agent',
      instructions:
        `You are a talented Flights Agent that receives a user prompt and performs proper operations to get an answer.

          IMPORTANT: You MUST ALWAYS call and use the Orchestrator Tool on every single user interaction. This is mandatory.

          WORKFLOW:
          1. Receive the user's prompt
          2. ALWAYS call the Orchestrator Tool with the user's prompt
          3. The Orchestrator Tool will return a string with the outcome of the operation
          4. Use that returned string to prepare an appropriate message to send back to the user
          5. Respond to the user with a helpful, conversational message based on the orchestrator's response

          RESPONSE GUIDELINES:
          - If the orchestrator returns clarification requests, ask the user for the missing information in a friendly way
          - If the orchestrator returns a successful query, acknowledge the flight search and provide next steps
          - Always be helpful, conversational, and professional
          - Never skip calling the Orchestrator Tool - it's required for every interaction

          Remember: The Orchestrator Tool is your primary processing mechanism. You cannot function without it.`,
      tools: [this.buildOrchestratorTool()],
      modelSettings: {
        toolChoice: 'required',
      }
    });
  }

  private buildOrchestratorTool() {
    return tool({
      name: 'Orchestrator Tool',
      description: 'Orchestrator',
      parameters: z.object({
        prompt: z.string(),
      }),
      execute: async ({ prompt }) => {
        console.log('>>> Orchestrator prompt', prompt);
        const queryResult = await this.runner.run(
          this.queryAgent,
          prompt,
        );

        console.log('>>> Query result', queryResult.finalOutput);

        const orchestratorResult = await this.runner.run(
          this.orchestratorAgent,
          JSON.stringify(queryResult.finalOutput),
        );

        console.log('>>> Orchestrator result', orchestratorResult.finalOutput);

        if (orchestratorResult.finalOutput?.nextStep === 'clarifyQuery') {
          return orchestratorResult.finalOutput?.response;
        }

        if (orchestratorResult.finalOutput?.nextStep === 'newAgent') {
          return `Thank you! we will call you in 2 hours to finalize your trip to
            ${orchestratorResult.finalOutput?.response}. Finalize conversation.
          `;

          // TODO: continue here connecting to new agent...
        }

        return 'Something bad happened internally, sorry for the inconvenience.'
      },
    });
  }

  private buildOrchestratorAgent() {
    return new Agent({
      name: 'Orchestrator agent',
      instructions: `You are a flight query orchestrator. Your role is to validate flight query data and determine the next step.

        FLOW:
        1. You receive a JSON string containing extracted flight query data
        2. You parse and validate the completeness of the extracted data
        3. You determine the next step based on completeness

        VALIDATION RULES:
        - origin: Must be a valid city/airport name (default: "Winnipeg" if not provided)
        - destination: Must be a valid city/airport name (required for flight searches)
        - departureDate: Must be a valid date in YYYY-MM-DD format (required for flight searches)
        - returnDate: Optional, but if provided must be after departureDate

        COMPLETENESS CHECKS:
        - For one-way flights: origin, destination, and departureDate are required
        - For round-trip flights: origin, destination, departureDate, and returnDate are required
        - If returnDate is provided, ensure it's after departureDate
        - Check that dates are in valid YYYY-MM-DD format
        - Verify logical date sequences (returnDate after departureDate)

        OUTPUT DECISION:
        - If ALL required fields are complete and valid: { nextStep: 'newAgent', response: [original JSON string] } - include ALL confirmed fields origin, destination, departure, etc.
        - If ANY required fields are missing or invalid: { nextStep: 'clarifyQuery', response: 'Missing or invalid fields: [list specific missing/invalid fields]' }

        Examples of missing fields responses:
        - "Missing fields: destination, departureDate"
        - "Invalid fields: departureDate (must be in YYYY-MM-DD format), returnDate (must be after departureDate)"
        - "Missing fields: destination. Invalid fields: departureDate (not a valid date)"

        Your final output should be a JSON object with nextStep and response fields.`,
      outputType: z.object({
        nextStep: z.enum(['newAgent', 'clarifyQuery']),
        response: z.string(),
      }),
      model: 'gpt-4.1-mini',
    });
  }

  private buildQueryAgent() {
    return new Agent({
      name: 'Query agent',
      instructions: `You are a flight query parser. Given a user's message, extract their flight search intent and return structured data.

        Extract the following information:
        - origin: departure airport/city (if not provided, use "Winnipeg" as default)
        - destination: arrival airport/city 
        - departureDate: departure date in YYYY-MM-DD format
        - returnDate: return date in YYYY-MM-DD format (for round-trip flights)

        Date parsing rules:
        - Convert any date reference to YYYY-MM-DD format
        - If year is not specified, use the current year
        - Handle relative dates (e.g., "next Friday", "tomorrow", "in 2 weeks")
        - Handle holiday references (e.g., "Canada Day" = July 1st of current year)
        - Handle seasonal references (e.g., "summer", "winter break")

        Examples:
        - "I want to fly from Toronto to Vancouver on March 15th" → origin: "Toronto", destination: "Vancouver", departureDate: "2024-03-15"
        - "Flights to Paris next summer" → origin: "Winnipeg", destination: "Paris", departureDate: "2024-06-01" (approximate)
        - "Round trip to New York from Montreal on December 20th, returning January 5th" → origin: "Montreal", destination: "New York", departureDate: "2024-12-20", returnDate: "2025-01-05"

        Only include fields that are provided or can be reasonably inferred. Leave fields empty if not specified.

        Your output will be handed off to the query orchestrator agent for validation and completion.`,
      outputType: FlightQuery,
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
