// FE-COMP-RES-001 to FE-COMP-RES-015
import { render, screen, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip, buildReservation } from '../../../tests/helpers/factories';
import ReservationsPanel from './ReservationsPanel';

const defaultProps = {
  tripId: 1,
  reservations: [],
  days: [],
  assignments: {},
  files: [],
  onAdd: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onNavigateToFiles: vi.fn(),
};

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }) });
});

describe('ReservationsPanel', () => {
  it('FE-COMP-RES-001: renders without crashing', () => {
    render(<ReservationsPanel {...defaultProps} />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-RES-002: shows Bookings title', () => {
    render(<ReservationsPanel {...defaultProps} />);
    // reservations.title = "Bookings"
    expect(screen.getByText('Bookings')).toBeInTheDocument();
  });

  it('FE-COMP-RES-003: shows empty state when no reservations', () => {
    render(<ReservationsPanel {...defaultProps} reservations={[]} />);
    // "No reservations yet" appears in both header subtitle and empty state body
    const els = screen.getAllByText('No reservations yet');
    expect(els.length).toBeGreaterThan(0);
  });

  it('FE-COMP-RES-004: shows empty hint text', () => {
    render(<ReservationsPanel {...defaultProps} reservations={[]} />);
    expect(screen.getByText(/Add reservations for flights/i)).toBeInTheDocument();
  });

  it('FE-COMP-RES-005: shows Manual Booking add button', () => {
    render(<ReservationsPanel {...defaultProps} />);
    // Button text is reservations.addManual = "Manual Booking"
    expect(screen.getByText('Manual Booking')).toBeInTheDocument();
  });

  it('FE-COMP-RES-006: clicking Manual Booking button calls onAdd', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ReservationsPanel {...defaultProps} onAdd={onAdd} />);
    await user.click(screen.getByText('Manual Booking'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('FE-COMP-RES-007: renders reservation title', () => {
    // Component renders r.title, not r.name
    const res = buildReservation({ title: 'Hotel Paris', type: 'hotel', status: 'confirmed' });
    render(<ReservationsPanel {...defaultProps} reservations={[res]} />);
    expect(screen.getByText('Hotel Paris')).toBeInTheDocument();
  });

  it('FE-COMP-RES-008: renders confirmed reservation badge', () => {
    const res = buildReservation({ title: 'Flight NY', type: 'flight', status: 'confirmed' });
    render(<ReservationsPanel {...defaultProps} reservations={[res]} />);
    // "Confirmed" appears in both section header and card badge
    const els = screen.getAllByText('Confirmed');
    expect(els.length).toBeGreaterThan(0);
  });

  it('FE-COMP-RES-009: renders pending reservation badge', () => {
    const res = buildReservation({ title: 'Hotel Rome', type: 'hotel', status: 'pending' });
    render(<ReservationsPanel {...defaultProps} reservations={[res]} />);
    // "Pending" appears in both section header and card badge
    const els = screen.getAllByText('Pending');
    expect(els.length).toBeGreaterThan(0);
  });

  it('FE-COMP-RES-010: shows summary text with confirmed and pending counts', () => {
    const r1 = buildReservation({ title: 'Flight', type: 'flight', status: 'confirmed' });
    const r2 = buildReservation({ title: 'Hotel', type: 'hotel', status: 'pending' });
    render(<ReservationsPanel {...defaultProps} reservations={[r1, r2]} />);
    // reservations.summary = "{confirmed} confirmed, {pending} pending"
    expect(screen.getByText(/1 confirmed, 1 pending/i)).toBeInTheDocument();
  });

  it('FE-COMP-RES-011: hotel reservation renders', () => {
    const res = buildReservation({ title: 'Grand Hotel', type: 'hotel', status: 'confirmed' });
    render(<ReservationsPanel {...defaultProps} reservations={[res]} />);
    expect(screen.getByText('Grand Hotel')).toBeInTheDocument();
  });

  it('FE-COMP-RES-012: flight reservation renders', () => {
    const res = buildReservation({ title: 'Air France 123', type: 'flight', status: 'confirmed' });
    render(<ReservationsPanel {...defaultProps} reservations={[res]} />);
    expect(screen.getByText('Air France 123')).toBeInTheDocument();
  });

  it('FE-COMP-RES-013: multiple reservations all render', () => {
    const r1 = buildReservation({ title: 'Hotel A', type: 'hotel', status: 'confirmed' });
    const r2 = buildReservation({ title: 'Flight B', type: 'flight', status: 'confirmed' });
    const r3 = buildReservation({ title: 'Restaurant C', type: 'restaurant', status: 'pending' });
    render(<ReservationsPanel {...defaultProps} reservations={[r1, r2, r3]} />);
    expect(screen.getByText('Hotel A')).toBeInTheDocument();
    expect(screen.getByText('Flight B')).toBeInTheDocument();
    expect(screen.getByText('Restaurant C')).toBeInTheDocument();
  });

  it('FE-COMP-RES-014: edit button calls onEdit with reservation', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const res = buildReservation({ id: 77, title: 'Editable Res', type: 'hotel', status: 'confirmed' });
    render(<ReservationsPanel {...defaultProps} reservations={[res]} onEdit={onEdit} />);
    const editBtn = screen.getByTitle('Edit');
    await user.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }));
  });

  it('FE-COMP-RES-015: delete button opens confirm dialog, then calls onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const res = buildReservation({ id: 88, title: 'Delete Me', type: 'hotel', status: 'confirmed' });
    render(<ReservationsPanel {...defaultProps} reservations={[res]} onDelete={onDelete} />);
    await user.click(screen.getByTitle('Delete'));
    // Confirm dialog appears — click the Confirm button
    const confirmBtn = await screen.findByText('Confirm');
    await user.click(confirmBtn);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(88));
  });
});
