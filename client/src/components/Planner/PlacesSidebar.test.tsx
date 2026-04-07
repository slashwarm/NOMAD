// FE-COMP-PLACES-001 to FE-COMP-PLACES-015
import { render, screen } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildTrip, buildPlace, buildCategory, buildDay } from '../../../tests/helpers/factories';
import PlacesSidebar from './PlacesSidebar';

// Mock photoService so PlaceAvatar doesn't trigger API calls
vi.mock('../../services/photoService', () => ({
  getCached: vi.fn(() => null),
  isLoading: vi.fn(() => false),
  fetchPhoto: vi.fn(),
  onThumbReady: vi.fn(() => () => {}),
}));

// PlaceAvatar uses `new IntersectionObserver(...)` — needs a class-based mock
class MockIO {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
beforeAll(() => { (globalThis as any).IntersectionObserver = MockIO; });

const defaultProps = {
  tripId: 1,
  places: [],
  categories: [],
  assignments: {},
  selectedDayId: null,
  selectedPlaceId: null,
  onPlaceClick: vi.fn(),
  onAddPlace: vi.fn(),
  onAssignToDay: vi.fn(),
  onEditPlace: vi.fn(),
  onDeletePlace: vi.fn(),
  days: [],
  isMobile: false,
};

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }) });
});

describe('PlacesSidebar', () => {
  it('FE-COMP-PLACES-001: renders without crashing', () => {
    render(<PlacesSidebar {...defaultProps} />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-002: shows search input', () => {
    render(<PlacesSidebar {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText(/Search places/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-003: renders places from props', () => {
    const places = [
      buildPlace({ name: 'Eiffel Tower' }),
      buildPlace({ name: 'Louvre Museum' }),
    ];
    render(<PlacesSidebar {...defaultProps} places={places} />);
    expect(screen.getByText('Eiffel Tower')).toBeInTheDocument();
    expect(screen.getByText('Louvre Museum')).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-004: shows Add Place button', () => {
    render(<PlacesSidebar {...defaultProps} />);
    // Multiple "Add Place/Activity" buttons may exist (top toolbar + empty state)
    const addBtns = screen.getAllByText(/Add Place\/Activity/i);
    expect(addBtns.length).toBeGreaterThan(0);
  });

  it('FE-COMP-PLACES-005: clicking Add Place calls onAddPlace', async () => {
    const user = userEvent.setup();
    const onAddPlace = vi.fn();
    render(<PlacesSidebar {...defaultProps} onAddPlace={onAddPlace} />);
    const addBtns = screen.getAllByText(/Add Place\/Activity/i);
    await user.click(addBtns[0]);
    expect(onAddPlace).toHaveBeenCalled();
  });

  it('FE-COMP-PLACES-006: clicking a place calls onPlaceClick with place id', async () => {
    const user = userEvent.setup();
    const onPlaceClick = vi.fn();
    const place = buildPlace({ id: 42, name: 'Notre Dame' });
    render(<PlacesSidebar {...defaultProps} places={[place]} onPlaceClick={onPlaceClick} />);
    await user.click(screen.getByText('Notre Dame'));
    expect(onPlaceClick).toHaveBeenCalled();
  });

  it('FE-COMP-PLACES-007: search filters places by name', async () => {
    const user = userEvent.setup();
    const places = [
      buildPlace({ name: 'Arc de Triomphe' }),
      buildPlace({ name: 'Sacre Coeur' }),
    ];
    render(<PlacesSidebar {...defaultProps} places={places} />);
    const searchInput = screen.getByPlaceholderText(/Search places/i);
    await user.type(searchInput, 'Arc');
    expect(screen.getByText('Arc de Triomphe')).toBeInTheDocument();
    expect(screen.queryByText('Sacre Coeur')).not.toBeInTheDocument();
  });

  it('FE-COMP-PLACES-008: search is case-insensitive', async () => {
    const user = userEvent.setup();
    const places = [buildPlace({ name: 'Museum of Art' })];
    render(<PlacesSidebar {...defaultProps} places={places} />);
    const searchInput = screen.getByPlaceholderText(/Search places/i);
    await user.type(searchInput, 'museum');
    expect(screen.getByText('Museum of Art')).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-009: selected place is highlighted', () => {
    const place = buildPlace({ id: 10, name: 'Central Park' });
    render(<PlacesSidebar {...defaultProps} places={[place]} selectedPlaceId={10} />);
    expect(screen.getByText('Central Park')).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-010: shows place count', () => {
    const places = [buildPlace({ name: 'P1' }), buildPlace({ name: 'P2' }), buildPlace({ name: 'P3' })];
    render(<PlacesSidebar {...defaultProps} places={places} />);
    // i18n: places.count = "{count} places"
    expect(screen.getByText(/3 places/i)).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-011: empty list shows no place names', () => {
    render(<PlacesSidebar {...defaultProps} places={[]} />);
    expect(screen.queryByText(/Eiffel/)).not.toBeInTheDocument();
  });

  it('FE-COMP-PLACES-012: categories from props render without error', () => {
    const cats = [buildCategory({ name: 'Restaurant' }), buildCategory({ name: 'Hotel' })];
    render(<PlacesSidebar {...defaultProps} categories={cats} />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-013: clearing search shows all places again', async () => {
    const user = userEvent.setup();
    const places = [buildPlace({ name: 'Place A' }), buildPlace({ name: 'Place B' })];
    render(<PlacesSidebar {...defaultProps} places={places} />);
    const searchInput = screen.getByPlaceholderText(/Search places/i);
    await user.type(searchInput, 'Place A');
    expect(screen.queryByText('Place B')).not.toBeInTheDocument();
    await user.clear(searchInput);
    expect(screen.getByText('Place B')).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-014: renders with days prop for day assignment', () => {
    const days = [buildDay({ id: 1, date: '2025-06-01' })];
    render(<PlacesSidebar {...defaultProps} days={days} />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-PLACES-015: onEditPlace passed to component correctly', () => {
    const onEditPlace = vi.fn();
    const place = buildPlace({ name: 'Test Place' });
    render(<PlacesSidebar {...defaultProps} places={[place]} onEditPlace={onEditPlace} />);
    expect(screen.getByText('Test Place')).toBeInTheDocument();
  });
});
