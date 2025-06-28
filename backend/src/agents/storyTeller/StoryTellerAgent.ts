import { Agent, Runner } from "@openai/agents";

interface StoryTellerAgentCallbacks {
  onTextStream?: (text: string) => void;
  onCompleted?: () => void;
}

export class StoryTellerAgent {
  private agent: Agent;
  private runner: Runner;
  private callbacks: StoryTellerAgentCallbacks;

  public constructor(callbacks: StoryTellerAgentCallbacks) {
    this.agent = new Agent({
      name: 'Storyteller',
      instructions:
        'You are a talented story teller that can tell an engaging 3-4 paragraph story on any topic.',
    });

    this.runner = new Runner({
      model: 'gpt-4.1-mini',
    });

    this.callbacks = callbacks;
  }

  public async run(prompt: string) {
    // Stream AI Agent response
    const storyStream = await this.runner.run(
      this.agent,
      prompt,
      {
        // enable streaming
        stream: true,
      },
    );

    for await (const text of storyStream.toTextStream()) {
      this.callbacks.onTextStream?.(text);
    }

    // waiting to make sure that we are done with handling the stream
    await storyStream.completed;
    this.callbacks.onCompleted?.();
  }
}
