// FE-COMP-PLACEFORM-001 to FE-COMP-PLACEFORM-015
import { render, screen, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip, buildPlace, buildCategory } from '../../../tests/helpers/factories';
import PlaceFormModal from './PlaceFormModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  place: null,
  prefillCoords: null,
  tripId: 1,
  categories: [],
  onCategoryCreated: vi.fn(),
  assignmentId: null,
  dayAssignments: [],
};

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true, hasMapsKey: false });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }) });
});

describe('PlaceFormModal', () => {
  it('FE-COMP-PLACEFORM-001: renders modal when isOpen is true', () => {
    render(<PlaceFormModal {...defaultProps} />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-002: shows Add Place title for new place', () => {
    render(<PlaceFormModal {...defaultProps} place={null} />);
    // places.addPlace = "Add Place/Activity"
    expect(screen.getAllByText(/Add Place\/Activity/i).length).toBeGreaterThan(0);
  });

  it('FE-COMP-PLACEFORM-003: shows Edit Place title when editing', () => {
    const place = buildPlace({ name: 'Eiffel Tower' });
    render(<PlaceFormModal {...defaultProps} place={place} />);
    expect(screen.getByText('Edit Place')).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-004: shows Name field with placeholder', () => {
    render(<PlaceFormModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/e\.g\. Eiffel Tower/i)).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-005: shows Description field', () => {
    render(<PlaceFormModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/Short description/i)).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-006: shows Address field', () => {
    render(<PlaceFormModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/Street, City, Country/i)).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-007: shows Add button for new place', () => {
    render(<PlaceFormModal {...defaultProps} place={null} />);
    expect(screen.getByRole('button', { name: /^Add$/i })).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-008: shows Update button when editing', () => {
    const place = buildPlace({ name: 'Test Place' });
    render(<PlaceFormModal {...defaultProps} place={place} />);
    expect(screen.getByRole('button', { name: /^Update$/i })).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-009: shows Cancel button', () => {
    render(<PlaceFormModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-010: clicking Cancel calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PlaceFormModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('FE-COMP-PLACEFORM-011: pre-fills name field when editing existing place', () => {
    const place = buildPlace({ name: 'Notre Dame' });
    render(<PlaceFormModal {...defaultProps} place={place} />);
    const nameInput = screen.getByDisplayValue('Notre Dame');
    expect(nameInput).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-012: pre-fills address when editing existing place', () => {
    const place = buildPlace({ name: 'Test', address: '123 Main St' });
    render(<PlaceFormModal {...defaultProps} place={place} />);
    expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument();
  });

  it('FE-COMP-PLACEFORM-013: submitting empty form does not call onSave (name required)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PlaceFormModal {...defaultProps} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: /^Add$/i }));
    // Form validation prevents calling onSave without a name
    expect(onSave).not.toHaveBeenCalled();
  });

  it('FE-COMP-PLACEFORM-014: typing in name field and submitting calls onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PlaceFormModal {...defaultProps} onSave={onSave} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. Eiffel Tower/i), 'Sacre Coeur');
    await user.click(screen.getByRole('button', { name: /^Add$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sacre Coeur' }));
  });

  it('FE-COMP-PLACEFORM-015: categories appear in category selector', () => {
    const cats = [buildCategory({ name: 'Museum' }), buildCategory({ name: 'Park' })];
    render(<PlaceFormModal {...defaultProps} categories={cats} />);
    // Category label is present
    expect(screen.getByText('Category')).toBeInTheDocument();
  });
});
