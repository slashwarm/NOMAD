import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act } from '../../tests/helpers/render';
import { Routes, Route } from 'react-router-dom';
import { resetAllStores, seedStore } from '../../tests/helpers/store';
import { buildUser, buildTrip, buildDay } from '../../tests/helpers/factories';
import { useAuthStore } from '../store/authStore';
import { useTripStore } from '../store/tripStore';
import TripPlannerPage from './TripPlannerPage';

// Mock Leaflet-dependent components
vi.mock('../components/Map/MapView', () => ({
  MapView: () => React.createElement('div', { 'data-testid': 'map-view' }),
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'map-container' }, children),
  TileLayer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Tooltip: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Polyline: () => null,
  CircleMarker: () => null,
  Circle: () => null,
  useMap: () => ({ fitBounds: vi.fn(), getCenter: vi.fn(() => ({ lat: 0, lng: 0 })) }),
}));

vi.mock('react-leaflet-cluster', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}));

vi.mock('leaflet', () => {
  const L = {
    divIcon: vi.fn(() => ({})),
    latLngBounds: vi.fn(() => ({ extend: vi.fn(), isValid: vi.fn(() => true) })),
    icon: vi.fn(() => ({})),
  };
  return { default: L, ...L };
});

// Mock the WebSocket hook so we can verify it's called
const mockUseTripWebSocket = vi.fn();
vi.mock('../hooks/useTripWebSocket', () => ({
  useTripWebSocket: (...args: unknown[]) => mockUseTripWebSocket(...args),
}));

// Mock heavy sub-components
vi.mock('../components/Planner/DayPlanSidebar', () => ({
  default: () => React.createElement('div', { 'data-testid': 'day-plan-sidebar' }),
}));

vi.mock('../components/Planner/PlacesSidebar', () => ({
  default: () => React.createElement('div', { 'data-testid': 'places-sidebar' }),
}));

vi.mock('../components/Planner/PlaceInspector', () => ({
  default: () => null,
}));

vi.mock('../components/Planner/DayDetailPanel', () => ({
  default: () => null,
}));

vi.mock('../components/Memories/MemoriesPanel', () => ({
  default: () => React.createElement('div', { 'data-testid': 'memories-panel' }),
}));

vi.mock('../components/Collab/CollabPanel', () => ({
  default: () => React.createElement('div', { 'data-testid': 'collab-panel' }),
}));

vi.mock('../components/Files/FileManager', () => ({
  default: () => React.createElement('div', { 'data-testid': 'file-manager' }),
}));

// Helper to seed a complete trip store state with mocked actions
function seedTripStore(overrides: { id?: number; tripName?: string; withMocks?: boolean } = {}) {
  const { id = 42, tripName = 'Test Trip', withMocks = true } = overrides;
  // Use `title` because TripPlannerPage reads trip.title
  const trip = { ...buildTrip({ id }), title: tripName };
  const day = buildDay({ trip_id: id });

  const mockLoadTrip = withMocks ? vi.fn().mockResolvedValue(undefined) : undefined;
  const mockLoadFiles = withMocks ? vi.fn().mockResolvedValue(undefined) : undefined;
  const mockLoadReservations = withMocks ? vi.fn().mockResolvedValue(undefined) : undefined;

  seedStore(useTripStore, {
    trip,
    isLoading: false,
    days: [day],
    places: [],
    assignments: {},
    packingItems: [],
    todoItems: [],
    categories: [],
    reservations: [],
    budgetItems: [],
    files: [],
    ...(withMocks && {
      loadTrip: mockLoadTrip,
      loadFiles: mockLoadFiles,
      loadReservations: mockLoadReservations,
    }),
  } as any);

  return { trip, day, mockLoadTrip, mockLoadFiles, mockLoadReservations };
}

// Helper to render TripPlannerPage with route params
function renderPlannerPage(tripId: number | string) {
  return render(
    <Routes>
      <Route path="/trips/:id" element={<TripPlannerPage />} />
    </Routes>,
    { initialEntries: [`/trips/${tripId}`] },
  );
}

beforeEach(() => {
  resetAllStores();
  mockUseTripWebSocket.mockReset();
  seedStore(useAuthStore, { isAuthenticated: true, user: buildUser() });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TripPlannerPage', () => {
  describe('FE-PAGE-PLANNER-001: Calls loadTrip with route param on mount', () => {
    it('calls loadTrip with the trip ID from URL params', async () => {
      const { mockLoadTrip } = seedTripStore({ id: 42 });

      renderPlannerPage(42);

      await waitFor(() => {
        expect(mockLoadTrip).toHaveBeenCalledWith('42');
      });
    });
  });

  describe('FE-PAGE-PLANNER-002: Loading state shown while loadTrip in progress', () => {
    it('shows loading animation when isLoading is true', () => {
      seedStore(useTripStore, {
        trip: null,
        isLoading: true,
        days: [],
        places: [],
        assignments: {},
        loadTrip: vi.fn().mockReturnValue(new Promise(() => {})),
        loadFiles: vi.fn().mockResolvedValue(undefined),
        loadReservations: vi.fn().mockResolvedValue(undefined),
      } as any);

      renderPlannerPage(99);

      // Loading state: shows loading gif
      const loadingImg = document.querySelector('img[alt="Loading"]');
      expect(loadingImg).toBeInTheDocument();
    });
  });

  describe('FE-PAGE-PLANNER-003: Error state shown if loadTrip fails', () => {
    it('calls loadTrip and the action is called (even if it rejects)', async () => {
      const mockLoadTrip = vi.fn().mockRejectedValue(new Error('Not found'));
      const mockLoadFiles = vi.fn().mockResolvedValue(undefined);
      const mockLoadReservations = vi.fn().mockResolvedValue(undefined);

      seedStore(useTripStore, {
        trip: null,
        isLoading: false,
        days: [],
        places: [],
        assignments: {},
        loadTrip: mockLoadTrip,
        loadFiles: mockLoadFiles,
        loadReservations: mockLoadReservations,
      } as any);

      renderPlannerPage(999);

      await waitFor(() => {
        expect(mockLoadTrip).toHaveBeenCalledWith('999');
      });
    });
  });

  describe('FE-PAGE-PLANNER-004: Trip name in header after load', () => {
    it('shows trip title in the Navbar after splash screen', async () => {
      vi.useFakeTimers();

      seedTripStore({ id: 7, tripName: 'Tokyo Adventure' });

      renderPlannerPage(7);

      // Run all pending timers (including the 1500ms splash timeout) synchronously
      act(() => { vi.runAllTimers(); });

      vi.useRealTimers();

      await waitFor(() => {
        expect(screen.getByText('Tokyo Adventure')).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-PLANNER-005: Day plan sidebar renders', () => {
    it('renders the DayPlanSidebar component after splash', async () => {
      vi.useFakeTimers();

      seedTripStore({ id: 3, tripName: 'Day Tabs Trip' });

      renderPlannerPage(3);

      act(() => { vi.runAllTimers(); });

      vi.useRealTimers();

      await waitFor(() => {
        expect(screen.getByTestId('day-plan-sidebar')).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-PLANNER-007: Places sidebar renders', () => {
    it('renders the PlacesSidebar component after splash', async () => {
      vi.useFakeTimers();

      seedTripStore({ id: 5, tripName: 'Places Trip' });

      renderPlannerPage(5);

      act(() => { vi.runAllTimers(); });

      vi.useRealTimers();

      await waitFor(() => {
        expect(screen.getByTestId('places-sidebar')).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-PLANNER-008: WebSocket hook mounted', () => {
    it('calls useTripWebSocket with the trip ID string', async () => {
      seedTripStore({ id: 15 });

      renderPlannerPage(15);

      await waitFor(() => {
        expect(mockUseTripWebSocket).toHaveBeenCalledWith('15');
      });
    });
  });
});
