import { Agent, Runner } from '@openai/agents';
import { z } from 'zod';

const FlightQuery = z.object({
  origin: z.string().optional(),
  destination: z.string().optional(),
  departureDate: z.date().optional(),
  returnDate: z.date().optional(),
});

interface FlightsAgentCallbacks {
  onTextStream?: (text: string) => void;
  onCompleted?: () => void;
  onError?: (msg: string) => void;
}

export class FlightsAgent {
  private runner: Runner;
  private callbacks: FlightsAgentCallbacks;
  private queryJudgeAgent: Agent<unknown, typeof FlightQuery>;
  private queryAgent: Agent<unknown, typeof FlightQuery>;

  constructor(callbacks: FlightsAgentCallbacks) {
    this.runner = new Runner();
    this.callbacks = callbacks;
    this.queryJudgeAgent = this.buildQueryJudgeAgent();
    this.queryAgent = this.buildQueryAgent();
  }

  async run(prompt: string) {
    // 1. input guardrails
    const inputGuardrailResult = await this.runner.run(
      this.buildInputGuardrailAgent(),
      prompt,
    );
    if (!inputGuardrailResult.finalOutput?.isFlightsQuery) {
      this.callbacks.onError?.(
        'This assistant only answers flights questions. Try asking about flights!'
      );
      this.callbacks.onCompleted?.();
      return;
    }

    // 2. query judge agent (starts the structured query flow)
    const queryResult = await this.runner.run(
      this.queryJudgeAgent,
      prompt,
    );
    
    // 3. handle the final structured query result
    if (queryResult.finalOutput) {
      const flightQuery = queryResult.finalOutput;
      this.callbacks.onTextStream?.(`I found your flight query: ${JSON.stringify(flightQuery, null, 2)}`);
    }
    
    this.callbacks.onCompleted?.();
  }

  private buildInputGuardrailAgent() {
    return new Agent({
      name: 'Flights-only filter',
      instructions: `Read the user's message and output **exactly** the JSON:\n\n{"isFlightsQuery": <true|false>}.
        Criteria: message involves flights, airfare, airlines, airports, tickets, or dated travel plans.`,
      outputType: z.object({ isFlightsQuery: z.boolean() }),
      model: 'gpt-4.1-mini',
    });
  }

  private buildQueryJudgeAgent() {
    return new Agent({
      name: 'Flights query judge agent',
      instructions: `You are a flight query judge. Your role is to orchestrate the flight query extraction process and validate the final result.

FLOW:
1. You receive the initial user prompt
2. You hand off this prompt to the query agent for structured extraction
3. The query agent returns a FlightQuery object
4. You validate the completeness and quality of the extracted data
5. You return the final validated FlightQuery object

VALIDATION RULES:
- origin: Must be a valid city/airport name (default: "Winnipeg" if not provided)
- destination: Must be a valid city/airport name (required for flight searches)
- departureDate: Must be a valid date in YYYY-MM-DD format (required for flight searches)
- returnDate: Optional, but if provided must be after departureDate

COMPLETENESS CHECKS:
- For one-way flights: origin, destination, and departureDate are required
- For round-trip flights: origin, destination, departureDate, and returnDate are required
- If returnDate is provided, ensure it's after departureDate
- If dates are missing or invalid, provide reasonable defaults or mark as incomplete

QUALITY CHECKS:
- Ensure city names are recognizable and properly formatted
- Validate date formats and logical date sequences
- Check for obvious errors (e.g., same origin and destination)

If the query is incomplete or invalid, provide helpful feedback and attempt to fill in missing information with reasonable defaults.

Your final output should be a complete, validated FlightQuery object ready for flight search processing.`,
      outputType: FlightQuery,
      model: 'gpt-4.1-mini',
      handoffs: [this.queryAgent],
    });
  }

  private buildQueryAgent() {
    return new Agent({
      name: 'Flights query agent',
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

Only include fields that are provided or can be reasonably inferred. Leave fields undefined if not specified.

Your output will be handed off to the query judge agent for validation and completion.`,
      outputType: FlightQuery,
      model: 'gpt-4.1-mini',
    });
  }
}