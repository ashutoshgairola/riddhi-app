import { rebuildHistory } from './history';
import { ChatMessage } from './entities/chat-message.entity';

function row(role: ChatMessage['role'], blocks: unknown[]): ChatMessage {
  return { role, blocks } as ChatMessage;
}

describe('rebuildHistory', () => {
  it('strips render-only blocks from assistant rows', () => {
    const messages = rebuildHistory([
      row('user', [{ type: 'text', text: 'hi' }]),
      row('assistant', [
        { type: 'text', text: 'hello' },
        { type: 'widget', widget: { kind: 'stat' } },
        { type: 'confirmation', widget: { kind: 'confirmation' } },
      ]),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1].content).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('maps tool rows to user-side tool_result turns', () => {
    const toolResult = {
      type: 'tool_result',
      tool_use_id: 'tu1',
      content: '{}',
    };
    const messages = rebuildHistory([
      row('user', [{ type: 'text', text: 'list goals' }]),
      row('assistant', [{ type: 'tool_use', id: 'tu1', name: 'list_goals' }]),
      row('tool', [toolResult]),
    ]);

    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toEqual([toolResult]);
  });

  it('serializes event rows as system notes', () => {
    const messages = rebuildHistory([
      row('user', [{ type: 'text', text: 'delete it' }]),
      row('event', [{ type: 'event_note', text: 'The user confirmed: X.' }]),
    ]);

    expect(messages[1]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: '[system note] The user confirmed: X.' }],
    });
  });

  it('never starts history on an orphaned tool_result row', () => {
    // Simulates the cap slicing between an assistant tool_use and its result.
    const rows = [
      row('tool', [{ type: 'tool_result', tool_use_id: 'cut', content: '' }]),
      row('user', [{ type: 'text', text: 'next question' }]),
      row('assistant', [{ type: 'text', text: 'answer' }]),
    ];
    const messages = rebuildHistory(rows);

    expect(messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'next question' }],
    });
  });
});
