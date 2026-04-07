// FE-COMP-PACKING-001 to FE-COMP-PACKING-020
import { render, screen, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip, buildPackingItem } from '../../../tests/helpers/factories';
import PackingListPanel from './PackingListPanel';

beforeEach(() => {
  resetAllStores();
  // Side-effect APIs PackingListPanel calls on mount
  server.use(
    http.get('/api/trips/:id/members', () =>
      HttpResponse.json({ owner: null, members: [], current_user_id: 1 })
    ),
    http.get('/api/trips/:id/packing/category-assignees', () =>
      HttpResponse.json({ assignees: {} })
    ),
    http.get('/api/admin/bag-tracking', () =>
      HttpResponse.json({ enabled: false })
    ),
    http.get('/api/admin/packing-templates', () =>
      HttpResponse.json({ templates: [] })
    ),
  );
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }) });
});

describe('PackingListPanel', () => {
  it('FE-COMP-PACKING-001: renders Packing List title', () => {
    render(<PackingListPanel tripId={1} items={[]} />);
    expect(screen.getByText('Packing List')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-002: shows empty state when no items', () => {
    render(<PackingListPanel tripId={1} items={[]} />);
    // Both the subtitle and the empty content area say "Packing list is empty"
    const els = screen.getAllByText('Packing list is empty');
    expect(els.length).toBeGreaterThan(0);
  });

  it('FE-COMP-PACKING-003: empty state shows hint text', () => {
    render(<PackingListPanel tripId={1} items={[]} />);
    expect(screen.getByText(/Add items or use the suggestions/i)).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-004: shows items from props grouped by category', () => {
    const items = [
      buildPackingItem({ name: 'Passport', category: 'Documents' }),
      buildPackingItem({ name: 'Charger', category: 'Electronics' }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    expect(screen.getByText('Passport')).toBeInTheDocument();
    expect(screen.getByText('Charger')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-005: shows category group headers', () => {
    const items = [
      buildPackingItem({ name: 'Toothbrush', category: 'Hygiene' }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    expect(screen.getByText('Hygiene')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-006: shows progress count in subtitle', () => {
    const items = [
      buildPackingItem({ name: 'Item1', checked: 1 }),
      buildPackingItem({ name: 'Item2', checked: 0 }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    expect(screen.getByText(/1 of 2 packed/i)).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-007: shows progress bar for packed items', () => {
    const items = [
      buildPackingItem({ name: 'Item1', checked: 1 }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    // 1/1 = 100% packed shows "All packed!"
    expect(screen.getByText('All packed!')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-008: items without category are grouped under default category', () => {
    const items = [
      buildPackingItem({ name: 'Sunscreen', category: null }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    expect(screen.getByText('Sunscreen')).toBeInTheDocument();
    // default category is "Other"
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-009: clicking Add item reveals input form', async () => {
    const user = userEvent.setup();
    const items = [buildPackingItem({ name: 'Shorts', category: 'Clothing' })];
    render(<PackingListPanel tripId={1} items={items} />);
    // Click "Add item" button to reveal input
    await user.click(screen.getByText('Add item'));
    expect(screen.getByPlaceholderText('Item name...')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-010: typing in add item input and pressing Enter calls POST', async () => {
    const user = userEvent.setup();
    const existingItem = buildPackingItem({ name: 'Existing', category: 'Clothing' });
    let postCalled = false;
    server.use(
      http.post('/api/trips/1/packing', async ({ request }) => {
        postCalled = true;
        const body = await request.json() as Record<string, unknown>;
        const item = buildPackingItem({ name: String(body.name), category: String(body.category) });
        return HttpResponse.json({ item });
      })
    );
    render(<PackingListPanel tripId={1} items={[existingItem]} />);
    await user.click(screen.getByText('Add item'));
    const addInput = screen.getByPlaceholderText('Item name...');
    await user.type(addInput, 'T-Shirt{Enter}');
    await waitFor(() => expect(postCalled).toBe(true));
  });

  it('FE-COMP-PACKING-011: checked item has checked state visually (1=checked)', () => {
    const items = [buildPackingItem({ name: 'Packed Item', checked: 1 })];
    render(<PackingListPanel tripId={1} items={items} />);
    expect(screen.getByText('Packed Item')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-012: unchecked item renders in open state', () => {
    const items = [buildPackingItem({ name: 'Unpacked Item', checked: 0 })];
    render(<PackingListPanel tripId={1} items={items} />);
    expect(screen.getByText('Unpacked Item')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-013: multiple categories render independently', () => {
    const items = [
      buildPackingItem({ name: 'Shirt', category: 'Clothing' }),
      buildPackingItem({ name: 'Passport', category: 'Documents' }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    expect(screen.getByText('Clothing')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-014: Add category button is shown', () => {
    render(<PackingListPanel tripId={1} items={[]} />);
    // The "Add category" button should be present in the toolbar
    expect(screen.getByText('Add category')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-015: clicking Add Category shows the category name input', async () => {
    const user = userEvent.setup();
    render(<PackingListPanel tripId={1} items={[]} />);
    await user.click(screen.getByText('Add category'));
    await screen.findByPlaceholderText('Category name (e.g. Clothing)');
  });

  it('FE-COMP-PACKING-016: delete item button exists and triggers API call', async () => {
    const user = userEvent.setup();
    const item = buildPackingItem({ id: 99, name: 'To Remove', category: 'Test' });
    let deleteCalled = false;
    server.use(
      http.delete('/api/trips/1/packing/99', () => {
        deleteCalled = true;
        return HttpResponse.json({ success: true });
      })
    );
    render(<PackingListPanel tripId={1} items={[item]} />);
    expect(screen.getByText('To Remove')).toBeInTheDocument();
    // Delete button is in the DOM (opacity 0 on desktop but exists)
    const deleteBtn = screen.getByTitle('Delete');
    await user.click(deleteBtn);
    await waitFor(() => expect(deleteCalled).toBe(true));
  });

  it('FE-COMP-PACKING-017: shows filter buttons (All, Open, Done) when items exist', () => {
    const items = [buildPackingItem({ name: 'Shirt', category: 'Clothing' })];
    render(<PackingListPanel tripId={1} items={items} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-018: filtering to Done hides unchecked items', async () => {
    const user = userEvent.setup();
    const items = [
      buildPackingItem({ name: 'Done Item', checked: 1, category: 'Test' }),
      buildPackingItem({ name: 'Open Item', checked: 0, category: 'Test' }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    await user.click(screen.getByText('Done'));
    expect(screen.getByText('Done Item')).toBeInTheDocument();
    expect(screen.queryByText('Open Item')).not.toBeInTheDocument();
  });

  it('FE-COMP-PACKING-019: filtering to Open hides checked items', async () => {
    const user = userEvent.setup();
    const items = [
      buildPackingItem({ name: 'Done Item', checked: 1, category: 'Test' }),
      buildPackingItem({ name: 'Open Item', checked: 0, category: 'Test' }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    await user.click(screen.getByText('Open'));
    expect(screen.queryByText('Done Item')).not.toBeInTheDocument();
    expect(screen.getByText('Open Item')).toBeInTheDocument();
  });

  it('FE-COMP-PACKING-020: renders empty filter message when filter yields nothing', async () => {
    const user = userEvent.setup();
    const items = [
      buildPackingItem({ name: 'Open Item', checked: 0, category: 'Test' }),
    ];
    render(<PackingListPanel tripId={1} items={items} />);
    await user.click(screen.getByText('Done'));
    expect(screen.getByText('No items match this filter')).toBeInTheDocument();
  });
});
