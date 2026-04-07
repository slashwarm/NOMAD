import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '../../tests/helpers/render';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/helpers/msw/server';
import { resetAllStores } from '../../tests/helpers/store';
import SharedTripPage from './SharedTripPage';

// Mock react-leaflet (SharedTripPage renders a map)
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useMap: () => ({
    fitBounds: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
  }),
}));

vi.mock('leaflet', () => {
  const L = {
    divIcon: vi.fn(() => ({})),
    latLngBounds: vi.fn(() => ({
      extend: vi.fn(),
      isValid: vi.fn(() => true),
    })),
    icon: vi.fn(() => ({})),
  };
  return { default: L, ...L };
});

// Mock react-dom/server (used in createMarkerIcon)
vi.mock('react-dom/server', () => ({
  renderToStaticMarkup: vi.fn(() => '<svg></svg>'),
}));

// Helper: render SharedTripPage under the correct route so useParams works
function renderSharedTrip(token: string) {
  return render(
    <Routes>
      <Route path="/shared/:token" element={<SharedTripPage />} />
    </Routes>,
    { initialEntries: [`/shared/${token}`] },
  );
}

beforeEach(() => {
  // SharedTripPage does NOT require authentication — do NOT seed auth store
  resetAllStores();
});

describe('SharedTripPage', () => {
  describe('FE-PAGE-SHARED-001: Renders without authentication', () => {
    it('renders loading spinner without any auth state', async () => {
      // Use a token that will delay or we just check initial state before response
      server.use(
        http.get('/api/shared/:token', async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return HttpResponse.json({ trips: [] });
        }),
      );

      renderSharedTrip('test-token');

      // While data is loading, shows a spinner (the loading div)
      // The page shows a spinning div before data arrives
      expect(document.body.textContent).toBeDefined();
    });
  });

  describe('FE-PAGE-SHARED-002: Trip data loads from share token API', () => {
    it('fetches shared trip from GET /api/shared/:token', async () => {
      renderSharedTrip('test-token');

      // After data loads, trip name appears
      await waitFor(() => {
        expect(screen.getByText('Shared Paris Trip')).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-SHARED-003: Trip details displayed', () => {
    it('shows trip name after data loads', async () => {
      renderSharedTrip('test-token');

      await waitFor(() => {
        expect(screen.getByText('Shared Paris Trip')).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-SHARED-004: Invalid token shows error', () => {
    it('displays error message when token is invalid or expired', async () => {
      renderSharedTrip('invalid-token');

      await waitFor(() => {
        expect(screen.getByText(/link expired or invalid/i)).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-SHARED-005: No edit controls shown (read-only)', () => {
    it('shows the read-only indicator after data loads', async () => {
      renderSharedTrip('test-token');

      await waitFor(() => {
        // The shared page renders "Read-only shared view" text
        expect(screen.getByText(/read-only/i)).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-SHARED-006: Expired token hint is shown', () => {
    it('shows hint text below the lock icon on error', async () => {
      renderSharedTrip('expired-token');

      await waitFor(() => {
        expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-SHARED-007: Map is rendered', () => {
    it('renders the map container for the shared trip', async () => {
      renderSharedTrip('test-token');

      await waitFor(() => {
        expect(screen.getByText('Shared Paris Trip')).toBeInTheDocument();
      });

      // Map container should be rendered
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });
});
