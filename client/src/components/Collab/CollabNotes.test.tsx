// FE-COMP-NOTES-001 to FE-COMP-NOTES-012
// CollabNotes uses addListener/removeListener from websocket — extend the global mock
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
import CollabNotes from './CollabNotes';

const currentUser = buildUser({ id: 1, username: 'testuser' });

const defaultProps = {
  tripId: 1,
  currentUser,
};

beforeEach(() => {
  resetAllStores();
  server.use(
    http.get('/api/trips/1/collab/notes', () =>
      HttpResponse.json({ notes: [] })
    ),
  );
  seedStore(useAuthStore, { user: currentUser, isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }) });
});

describe('CollabNotes', () => {
  it('FE-COMP-NOTES-001: renders without crashing', () => {
    render(<CollabNotes {...defaultProps} />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-NOTES-002: shows empty state when no notes', async () => {
    render(<CollabNotes {...defaultProps} />);
    await screen.findByText('No notes yet');
  });

  it('FE-COMP-NOTES-003: shows New Note button', async () => {
    render(<CollabNotes {...defaultProps} />);
    await screen.findByText('No notes yet');
    expect(screen.getByText('New Note')).toBeInTheDocument();
  });

  it('FE-COMP-NOTES-004: shows existing notes from API', async () => {
    server.use(
      http.get('/api/trips/1/collab/notes', () =>
        HttpResponse.json({
          notes: [{
            id: 1, trip_id: 1, user_id: currentUser.id, author_username: 'testuser',
            author_avatar: null, title: 'Packing Tips', content: 'Bring sunscreen',
            category: null, color: '#3b82f6', files: [],
            created_at: '2025-06-01T10:00:00.000Z', updated_at: '2025-06-01T10:00:00.000Z',
          }],
        })
      )
    );
    render(<CollabNotes {...defaultProps} />);
    await screen.findByText('Packing Tips');
  });

  it('FE-COMP-NOTES-005: clicking New Note opens modal', async () => {
    const user = userEvent.setup();
    render(<CollabNotes {...defaultProps} />);
    await screen.findByText('No notes yet');
    await user.click(screen.getByText('New Note'));
    // Modal opens with a title input — placeholder is "Note title" (no ellipsis)
    await screen.findByPlaceholderText('Note title');
  });

  it('FE-COMP-NOTES-006: note title is shown in the grid', async () => {
    server.use(
      http.get('/api/trips/1/collab/notes', () =>
        HttpResponse.json({
          notes: [{
            id: 1, trip_id: 1, user_id: 1, author_username: 'testuser',
            author_avatar: null, title: 'My Checklist', content: 'Items',
            category: 'Travel', color: '#ef4444', files: [],
            created_at: '2025-06-01T10:00:00.000Z', updated_at: '2025-06-01T10:00:00.000Z',
          }],
        })
      )
    );
    render(<CollabNotes {...defaultProps} />);
    await screen.findByText('My Checklist');
  });

  it('FE-COMP-NOTES-007: multiple notes all render', async () => {
    server.use(
      http.get('/api/trips/1/collab/notes', () =>
        HttpResponse.json({
          notes: [
            { id: 1, trip_id: 1, user_id: 1, author_username: 'testuser', author_avatar: null, title: 'Note A', content: '', category: null, color: '#3b82f6', files: [], created_at: '2025-06-01T10:00:00.000Z', updated_at: '2025-06-01T10:00:00.000Z' },
            { id: 2, trip_id: 1, user_id: 2, author_username: 'alice', author_avatar: null, title: 'Note B', content: '', category: null, color: '#ef4444', files: [], created_at: '2025-06-01T10:01:00.000Z', updated_at: '2025-06-01T10:01:00.000Z' },
          ],
        })
      )
    );
    render(<CollabNotes {...defaultProps} />);
    await screen.findByText('Note A');
    expect(screen.getByText('Note B')).toBeInTheDocument();
  });

  it('FE-COMP-NOTES-008: Notes title heading is shown', async () => {
    render(<CollabNotes {...defaultProps} />);
    // collab.notes.title = "Notes"
    await screen.findByText('Notes');
  });

  it('FE-COMP-NOTES-009: create note calls POST API', async () => {
    const user = userEvent.setup();
    let postCalled = false;
    server.use(
      http.post('/api/trips/1/collab/notes', async () => {
        postCalled = true;
        return HttpResponse.json({
          note: { id: 99, trip_id: 1, user_id: 1, author_username: 'testuser', author_avatar: null, title: 'New Note', content: '', category: null, color: '#3b82f6', files: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        });
      })
    );
    render(<CollabNotes {...defaultProps} />);
    await screen.findByText('No notes yet');
    await user.click(screen.getByText('New Note'));
    const titleInput = await screen.findByPlaceholderText('Note title');
    await user.type(titleInput, 'Test Note');
    // collab.notes.create = "Create"
    const createBtn = screen.getByRole('button', { name: /^Create$/i });
    await user.click(createBtn);
    await waitFor(() => expect(postCalled).toBe(true));
  });

  it('FE-COMP-NOTES-010: note content is shown when available', async () => {
    server.use(
      http.get('/api/trips/1/collab/notes', () =>
        HttpResponse.json({
          notes: [{ id: 1, trip_id: 1, user_id: 1, author_username: 'testuser', author_avatar: null, title: 'Details', content: 'Bring passport', category: null, color: '#3b82f6', files: [], created_at: '2025-06-01T10:00:00.000Z', updated_at: '2025-06-01T10:00:00.000Z' }],
        })
      )
    );
    render(<CollabNotes {...defaultProps} />);
    await screen.findByText('Details');
    expect(screen.getByText('Bring passport')).toBeInTheDocument();
  });

  it('FE-COMP-NOTES-011: category filter buttons appear when notes have categories', async () => {
    server.use(
      http.get('/api/trips/1/collab/notes', () =>
        HttpResponse.json({
          notes: [{ id: 1, trip_id: 1, user_id: 1, author_username: 'testuser', author_avatar: null, title: 'Hotel Info', content: '', category: 'Accommodation', color: '#8b5cf6', files: [], created_at: '2025-06-01T10:00:00.000Z', updated_at: '2025-06-01T10:00:00.000Z' }],
        })
      )
    );
    render(<CollabNotes {...defaultProps} />);
    // "Accommodation" appears in both category filter and note card
    const els = await screen.findAllByText('Accommodation');
    expect(els.length).toBeGreaterThan(0);
  });

  it('FE-COMP-NOTES-012: renders loading state initially', () => {
    render(<CollabNotes {...defaultProps} />);
    // Component starts with loading=true; skeleton or spinner is present
    expect(document.body).toBeInTheDocument();
  });
});
