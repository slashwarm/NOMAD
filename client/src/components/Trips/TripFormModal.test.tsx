// FE-COMP-TRIPFORM-001 to FE-COMP-TRIPFORM-015
import { render, screen, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip } from '../../../tests/helpers/factories';
import TripFormModal from './TripFormModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  trip: null,
  onCoverUpdate: vi.fn(),
};

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }) });
});

describe('TripFormModal', () => {
  it('FE-COMP-TRIPFORM-001: renders without crashing', () => {
    render(<TripFormModal {...defaultProps} />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-TRIPFORM-002: shows Create New Trip title for new trip', () => {
    render(<TripFormModal {...defaultProps} trip={null} />);
    expect(screen.getAllByText('Create New Trip').length).toBeGreaterThan(0);
  });

  it('FE-COMP-TRIPFORM-003: shows Edit Trip title when editing', () => {
    const trip = buildTrip({ id: 1, title: 'Japan 2025' });
    render(<TripFormModal {...defaultProps} trip={trip} />);
    expect(screen.getByText('Edit Trip')).toBeInTheDocument();
  });

  it('FE-COMP-TRIPFORM-004: shows trip title input field', () => {
    render(<TripFormModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/Summer in Japan/i)).toBeInTheDocument();
  });

  it('FE-COMP-TRIPFORM-005: Cancel button is present', () => {
    render(<TripFormModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('FE-COMP-TRIPFORM-006: clicking Cancel calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripFormModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('FE-COMP-TRIPFORM-007: Create New Trip submit button is present', () => {
    render(<TripFormModal {...defaultProps} trip={null} />);
    // Submit button text is "Create New Trip" for new trips
    const createBtns = screen.getAllByText('Create New Trip');
    expect(createBtns.length).toBeGreaterThan(0);
  });

  it('FE-COMP-TRIPFORM-008: Update button shown when editing', () => {
    const trip = buildTrip({ id: 1, title: 'Japan 2025' });
    render(<TripFormModal {...defaultProps} trip={trip} />);
    expect(screen.getByRole('button', { name: /Update/i })).toBeInTheDocument();
  });

  it('FE-COMP-TRIPFORM-009: submitting with empty title shows error', async () => {
    const user = userEvent.setup();
    render(<TripFormModal {...defaultProps} />);
    // Click submit without filling title
    const submitBtn = screen.getAllByText('Create New Trip').find(
      el => el.tagName === 'BUTTON' || el.closest('button')
    );
    if (submitBtn) {
      await user.click(submitBtn.closest('button') || submitBtn);
    }
    // Error: "Title is required"
    await screen.findByText('Title is required');
  });

  it('FE-COMP-TRIPFORM-010: typing title and submitting calls onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({ trip: buildTrip({ id: 99 }) });
    render(<TripFormModal {...defaultProps} onSave={onSave} />);
    await user.type(screen.getByPlaceholderText(/Summer in Japan/i), 'Paris 2026');
    const submitBtns = screen.getAllByText('Create New Trip');
    const submitBtn = submitBtns.find(el => el.closest('button'));
    await user.click(submitBtn!.closest('button')!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Paris 2026' }));
  });

  it('FE-COMP-TRIPFORM-011: pre-fills title when editing trip', () => {
    const trip = buildTrip({ id: 1, title: 'Iceland Adventure' });
    render(<TripFormModal {...defaultProps} trip={trip} />);
    expect(screen.getByDisplayValue('Iceland Adventure')).toBeInTheDocument();
  });

  it('FE-COMP-TRIPFORM-012: shows Title label', () => {
    render(<TripFormModal {...defaultProps} />);
    // dashboard.tripTitle = "Title"
    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  it('FE-COMP-TRIPFORM-013: shows Cover Image section', () => {
    render(<TripFormModal {...defaultProps} />);
    expect(screen.getByText('Cover Image')).toBeInTheDocument();
  });

  it('FE-COMP-TRIPFORM-014: shows start and end date labels', () => {
    render(<TripFormModal {...defaultProps} />);
    // Uses CustomDatePicker with labels "Start Date" and "End Date"
    const startEls = screen.getAllByText('Start Date');
    const endEls = screen.getAllByText('End Date');
    expect(startEls.length).toBeGreaterThan(0);
    expect(endEls.length).toBeGreaterThan(0);
  });

  it('FE-COMP-TRIPFORM-015: renders date picker components for start and end', () => {
    const trip = buildTrip({ id: 1, title: 'Test Trip', start_date: '2026-06-01', end_date: '2026-06-15' });
    render(<TripFormModal {...defaultProps} trip={trip} />);
    // CustomDatePicker shows formatted dates as button text (locale-dependent)
    // Just verify labels and form render without error
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('End Date')).toBeInTheDocument();
  });
});
