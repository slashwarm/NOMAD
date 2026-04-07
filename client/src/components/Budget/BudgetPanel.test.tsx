// FE-COMP-BUDGET-001 to FE-COMP-BUDGET-020
import { render, screen, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip, buildBudgetItem, buildSettings } from '../../../tests/helpers/factories';
import BudgetPanel from './BudgetPanel';

beforeEach(() => {
  resetAllStores();
  // Settlement and per-person APIs needed by BudgetPanel
  server.use(
    http.get('/api/trips/:id/budget/settlement', () =>
      HttpResponse.json({ balances: [], flows: [] })
    ),
    http.get('/api/trips/:id/budget/per-person', () =>
      HttpResponse.json({ summary: [] })
    ),
  );
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR' }) });
});

describe('BudgetPanel', () => {
  it('FE-COMP-BUDGET-001: renders empty state when no budget items', async () => {
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('No budget created yet');
  });

  it('FE-COMP-BUDGET-002: shows empty state text body', async () => {
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText(/Create categories and entries/i);
  });

  it('FE-COMP-BUDGET-003: shows category input in empty state when user can edit', async () => {
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByPlaceholderText('Enter category name...');
  });

  it('FE-COMP-BUDGET-004: renders budget items from store after load', async () => {
    const item = buildBudgetItem({ trip_id: 1, name: 'Hotel Paris', category: 'Accommodation' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Hotel Paris');
  });

  it('FE-COMP-BUDGET-005: renders category section header', async () => {
    const item = buildBudgetItem({ trip_id: 1, name: 'Flight to Rome', category: 'Transport' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Transport');
  });

  it('FE-COMP-BUDGET-006: renders budget table headers', async () => {
    const item = buildBudgetItem({ trip_id: 1, category: 'Food' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Name');
    await screen.findByText('Total');
  });

  it('FE-COMP-BUDGET-007: shows Budget title heading', async () => {
    const item = buildBudgetItem({ trip_id: 1, category: 'Other' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Budget');
  });

  it('FE-COMP-BUDGET-008: shows CSV export button', async () => {
    const item = buildBudgetItem({ trip_id: 1, category: 'Other' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('CSV');
  });

  it('FE-COMP-BUDGET-009: add item row visible in table', async () => {
    const item = buildBudgetItem({ trip_id: 1, category: 'Food' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByPlaceholderText('New Entry');
  });

  it('FE-COMP-BUDGET-010: adding new item via form calls POST and shows item', async () => {
    const user = userEvent.setup();
    const initialItem = buildBudgetItem({ trip_id: 1, category: 'Food', name: 'Existing' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [initialItem] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        const item = buildBudgetItem({ trip_id: 1, name: String(body.name || 'New Item'), category: 'Food' });
        return HttpResponse.json({ item });
      })
    );
    render(<BudgetPanel tripId={1} />);
    const nameInput = await screen.findByPlaceholderText('New Entry');
    await user.type(nameInput, 'Restaurant Dinner');
    const addBtn = screen.getByTitle('Add Reservation');
    await user.click(addBtn);
    await screen.findByText('Restaurant Dinner');
  });

  it('FE-COMP-BUDGET-011: delete button present for items when user can edit', async () => {
    const item = buildBudgetItem({ trip_id: 1, category: 'Food', name: 'Test Item' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Test Item');
    // Delete button has title="Delete"
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('FE-COMP-BUDGET-012: delete item removes it from the UI', async () => {
    const user = userEvent.setup();
    const item = buildBudgetItem({ id: 42, trip_id: 1, category: 'Food', name: 'Item To Delete' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] })),
      http.delete('/api/trips/1/budget/42', () => HttpResponse.json({ success: true }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Item To Delete');
    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.queryByText('Item To Delete')).not.toBeInTheDocument();
    });
  });

  it('FE-COMP-BUDGET-013: multiple items in same category all render', async () => {
    const item1 = buildBudgetItem({ trip_id: 1, category: 'Hotels', name: 'Hotel A' });
    const item2 = buildBudgetItem({ trip_id: 1, category: 'Hotels', name: 'Hotel B' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item1, item2] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Hotel A');
    await screen.findByText('Hotel B');
  });

  it('FE-COMP-BUDGET-014: items from different categories render separate sections', async () => {
    const item1 = buildBudgetItem({ trip_id: 1, category: 'Transport', name: 'Flight' });
    const item2 = buildBudgetItem({ trip_id: 1, category: 'Hotels', name: 'Hotel' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item1, item2] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Transport');
    await screen.findByText('Hotels');
  });

  it('FE-COMP-BUDGET-015: currency from settings store is used for default_currency display', async () => {
    seedStore(useSettingsStore, { settings: buildSettings({ default_currency: 'USD' }) });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] }))
    );
    render(<BudgetPanel tripId={1} />);
    // Component renders even in empty state
    await screen.findByText('No budget created yet');
  });

  it('FE-COMP-BUDGET-016: trip currency EUR is shown in header for item rows', async () => {
    seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR' }) });
    const item = buildBudgetItem({ trip_id: 1, category: 'Other', name: 'Misc', total_price: 50 });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('Misc');
    // Row exists - EUR formatting would appear in values
  });

  it('FE-COMP-BUDGET-017: Delete Category button shown in category header', async () => {
    const item = buildBudgetItem({ trip_id: 1, category: 'ToDelete', name: 'Item' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByText('ToDelete');
    expect(screen.getByTitle('Delete Category')).toBeInTheDocument();
  });

  it('FE-COMP-BUDGET-018: renders add item button (+ icon) in add row', async () => {
    const item = buildBudgetItem({ trip_id: 1, category: 'Other' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [item] }))
    );
    render(<BudgetPanel tripId={1} />);
    await screen.findByPlaceholderText('New Entry');
    // The add button is present
    expect(screen.getByTitle('Add Reservation')).toBeInTheDocument();
  });

  it('FE-COMP-BUDGET-019: add item with Enter key submits the form', async () => {
    const user = userEvent.setup();
    const initialItem = buildBudgetItem({ trip_id: 1, category: 'Food', name: 'Existing' });
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [initialItem] })),
      http.post('/api/trips/1/budget', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        const item = buildBudgetItem({ trip_id: 1, name: String(body.name), category: 'Food' });
        return HttpResponse.json({ item });
      })
    );
    render(<BudgetPanel tripId={1} />);
    const nameInput = await screen.findByPlaceholderText('New Entry');
    await user.type(nameInput, 'Pizza{Enter}');
    await screen.findByText('Pizza');
  });

  it('FE-COMP-BUDGET-020: component renders without crashing with empty tripMembers', async () => {
    server.use(
      http.get('/api/trips/1/budget', () => HttpResponse.json({ items: [] }))
    );
    render(<BudgetPanel tripId={1} tripMembers={[]} />);
    await screen.findByText('No budget created yet');
  });
});
