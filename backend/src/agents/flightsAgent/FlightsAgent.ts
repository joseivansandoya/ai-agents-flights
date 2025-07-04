import { Agent, Runner } from '@openai/agents';
import { z } from 'zod';

interface FlightsAgentCallbacks {
  onTextStream?: (text: string) => void;
  onCompleted?: () => void;
  onError?: (msg: string) => void;
}

export class FlightsAgent {
  private runner: Runner;
  private callbacks: FlightsAgentCallbacks;

  constructor(callbacks: FlightsAgentCallbacks) {
    this.runner = new Runner();
    this.callbacks = callbacks;
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

    // 2. query agent
    const stream = await this.runner.run(
      this.buildQueryAgent(),
      prompt,
      { stream: true }
    );
    for await (const chunk of stream.toTextStream()) {
      this.callbacks.onTextStream?.(chunk);
    }
    await stream.completed;
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

  private buildQueryAgent() {
    return new Agent({
      name: 'Flights helper',
      instructions: `You are a helpful assistant for all things flights.`,
      model: 'gpt-4.1-mini',
    });
  }
}