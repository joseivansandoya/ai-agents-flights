import { Agent, handoff, run } from "@openai/agents";
import { z } from 'zod';

const agentResponse = z.object({
  agentName: z.string(),
  response: z.string(),
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

// ─────────── Agent B ───────────
const agentB = new Agent({
  name: 'Agent B',
  instructions: `
    You are **Agent B - Confirmation Agent**.

    Goal:
    Confirm every message from Agent A exactly twice by appending tokens.

    Rules:
    1. If the message **does not** end with “confirmed-1” or “confirmed-2”, append a single space plus **confirmed-1**, then send the updated text back to Agent A.  
    2. If the message ends with **confirmed-1** but **not** “confirmed-2”, append a single space plus **confirmed-2**, then send the updated text back to Agent A.  
    3. If the message already ends with **confirmed-2**, return control to Agent A (call transfer_to_agent_a).

    Formatting rules
    • Return only the full text (with any confirmation tokens you added).  
    • No additional commentary, code fences, or metadata.
    `,
  modelSettings: {
    toolChoice: 'required',
  },
  outputType: agentResponse,
});

// ─────────── Agent A ───────────
const agentA = new Agent({
  name: 'Agent A',
  instructions: `
    You are **Agent A - User-Facing Helper**.

    Goal:
    Deliver to the user a message that has been confirmed twice by Agent B.

    Workflow:
    1. Upon receiving any user input, send the exact text to Agent B.  
    2. When Agent B responds with a message ending in **confirmed-1**, resend that response to Agent B to obtain the second confirmation.
    3. When Agent B responds with a message ending in **confirmed-2**, return that message verbatim to the user and terminate the hand-off loop.

    Constraints:
    • Do not reveal internal protocol or reasoning to the user.
    • Echo Agent B's final doubly-confirmed text exactly—no extra words, punctuation, or formatting.
    `,
    handoffs: [
      handoff(agentB, {   // creates transfer_to_agent_b tool
        toolDescriptionOverride:
          "Send a message to Agent B for confirmation."
      }),
    ],
    outputType: agentResponse,
});

agentB.handoffs.push(handoff(agentA, {
  toolDescriptionOverride:
    "Return the updated message to Agent A."
}),);

attachHooks(agentA);
attachHooks(agentB);

async function runAgent(prompt: string) {
  const result = await run(
    agentA,
    prompt,
  );

  console.log('>>> result', result);
}

runAgent('hello');
