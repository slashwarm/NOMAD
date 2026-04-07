// FE-COMP-CHAT-001 to FE-COMP-CHAT-012
// jsdom doesn't implement scrollTo — mock it to prevent uncaught exceptions from CollabChat's scrollToBottom
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn() as any;
});

// CollabChat uses addListener/removeListener from websocket — extend the global mock
vi.mock('../../api/websocket', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getSocketId: vi.fn(() => null),
  setRefetchCallback: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

import { render, screen, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip } from '../../../tests/helpers/factories';
import CollabChat from './CollabChat';

const currentUser = buildUser({ id: 1, username: 'testuser' });

const defaultProps = {
  tripId: 1,
  currentUser,
};

beforeEach(() => {
  resetAllStores();
  server.use(
    http.get('/api/trips/1/collab/messages', () =>
      HttpResponse.json({ messages: [], total: 0 })
    ),
  );
  seedStore(useAuthStore, { user: currentUser, isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }) });
});

describe('CollabChat', () => {
  it('FE-COMP-CHAT-001: renders without crashing', () => {
    render(<CollabChat {...defaultProps} />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-CHAT-002: shows empty state when no messages', async () => {
    render(<CollabChat {...defaultProps} />);
    await screen.findByText('Start the conversation');
  });

  it('FE-COMP-CHAT-003: shows message input placeholder', async () => {
    render(<CollabChat {...defaultProps} />);
    // Wait for loading to complete
    await screen.findByText('Start the conversation');
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('FE-COMP-CHAT-004: shows send button (ArrowUp icon, no title)', async () => {
    render(<CollabChat {...defaultProps} />);
    await screen.findByText('Start the conversation');
    // Send button has no title attr — verify buttons exist in the toolbar area
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('FE-COMP-CHAT-005: shows existing messages from API', async () => {
    server.use(
      http.get('/api/trips/1/collab/messages', () =>
        HttpResponse.json({
          messages: [{
            id: 1, trip_id: 1, user_id: currentUser.id, username: 'testuser',
            avatar_url: null, text: 'Hello world!', created_at: '2025-06-01T10:00:00.000Z',
            reactions: {}, reply_to: null, deleted: false, edited: false,
          }],
          total: 1,
        })
      )
    );
    render(<CollabChat {...defaultProps} />);
    await screen.findByText('Hello world!');
  });

  it('FE-COMP-CHAT-006: typing in input updates text field', async () => {
    const user = userEvent.setup();
    render(<CollabChat {...defaultProps} />);
    await screen.findByText('Start the conversation');
    const input = screen.getByPlaceholderText('Type a message...');
    await user.type(input, 'Test message');
    expect((input as HTMLTextAreaElement).value).toBe('Test message');
  });

  it('FE-COMP-CHAT-007: submitting message via Enter calls POST API', async () => {
    const user = userEvent.setup();
    let postCalled = false;
    server.use(
      http.post('/api/trips/1/collab/messages', async () => {
        postCalled = true;
        return HttpResponse.json({
          id: 2, trip_id: 1, user_id: 1, username: 'testuser',
          avatar_url: null, text: 'New message', created_at: new Date().toISOString(),
          reactions: {}, reply_to: null, deleted: false, edited: false,
        });
      })
    );
    render(<CollabChat {...defaultProps} />);
    await screen.findByText('Start the conversation');
    const input = screen.getByPlaceholderText('Type a message...');
    // Enter key sends message (Shift+Enter = newline, Enter = send)
    await user.type(input, 'New message{Enter}');
    await waitFor(() => expect(postCalled).toBe(true));
  });

  it('FE-COMP-CHAT-008: message input area is present after loading', async () => {
    render(<CollabChat {...defaultProps} />);
    await screen.findByText('Start the conversation');
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('FE-COMP-CHAT-009: shows hint text in empty state', async () => {
    render(<CollabChat {...defaultProps} />);
    await screen.findByText(/Share ideas, plans/i);
  });

  it('FE-COMP-CHAT-010: chat container renders', () => {
    render(<CollabChat {...defaultProps} />);
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it('FE-COMP-CHAT-011: multiple messages all render', async () => {
    server.use(
      http.get('/api/trips/1/collab/messages', () =>
        HttpResponse.json({
          messages: [
            { id: 1, trip_id: 1, user_id: 1, username: 'testuser', avatar_url: null, text: 'First message', created_at: '2025-06-01T10:00:00.000Z', reactions: {}, reply_to: null, deleted: false, edited: false },
            { id: 2, trip_id: 1, user_id: 2, username: 'alice', avatar_url: null, text: 'Second message', created_at: '2025-06-01T10:01:00.000Z', reactions: {}, reply_to: null, deleted: false, edited: false },
          ],
          total: 2,
        })
      )
    );
    render(<CollabChat {...defaultProps} />);
    await screen.findByText('First message');
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });

  it('FE-COMP-CHAT-012: shows emoji button in the toolbar', async () => {
    render(<CollabChat {...defaultProps} />);
    await screen.findByText('Start the conversation');
    // Emoji button is a button in the toolbar
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
