import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const getRoute = createServerFn({ method: "GET" }).handler(
  async (routeId: string) => {
    const sql = getDb();
    const [route] = await sql`SELECT * FROM routes WHERE id = ${routeId}`;
    if (!route) return null;

    const stops = await sql`
      SELECT rs.*, c.business_name, c.contact_name, c.address_line1, c.city, c.state, c.phone, c.email,
             c.latitude as contact_lat, c.longitude as contact_lng
      FROM route_stops rs
      JOIN contacts c ON c.id = rs.contact_id
      WHERE rs.route_id = ${routeId}
      ORDER BY rs.stop_order ASC
    `;

    return {
      route: {
        ...route,
        created_at: String(route.created_at),
        updated_at: String(route.updated_at),
        date: route.date ? String(route.date) : null,
        total_distance_km: route.total_distance_km?.toString() ?? null,
      },
      stops: stops.map((s: any) => ({
        ...s,
        latitude: s.latitude || s.contact_lat,
        longitude: s.longitude || s.contact_lng,
        created_at: String(s.created_at),
      })),
    };
  },
);

const updateStopVisited = createServerFn({ method: "POST" }).handler(
  async ({ stopId, visited }: { stopId: string; visited: boolean }) => {
    const sql = getDb();
    await sql`UPDATE route_stops SET visited = ${visited}, updated_at = now() WHERE id = ${stopId}`;
    return { success: true };
  },
);

const updateRouteStatus = createServerFn({ method: "POST" }).handler(
  async ({ routeId, status }: { routeId: string; status: string }) => {
    const sql = getDb();
    await sql`UPDATE routes SET status = ${status}, updated_at = now() WHERE id = ${routeId}`;
    return { success: true };
  },
);

export const Route = createFileRoute("/routes/$routeId")({
  component: RouteDetail,
  loader: async ({ params }) => getRoute(params.routeId),
});

function RouteDetail() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  const [route, setRoute] = useState(data?.route);
  const [stops, setStops] = useState(data?.stops || []);

  useEffect(() => {
    if (!mapRef.current || !stops.length || mapInstance.current) return;

    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4);
    mapInstance.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const geocodedStops = stops.filter((s: any) => s.latitude && s.longitude);
    if (geocodedStops.length === 0) return;

    const bounds = L.latLngBounds([]);
    const markers: [number, number][] = [];

    geocodedStops.forEach((stop: any, i: number) => {
      const lat = parseFloat(stop.latitude);
      const lng = parseFloat(stop.longitude);
      const pos: [number, number] = [lat, lng];
      markers.push(pos);
      bounds.extend(pos);

      const color = stop.visited ? "#22c55e" : "#4f46e5";
      const marker = L.circleMarker(pos, {
        radius: 10,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      }).addTo(map);

      marker.bindPopup(`
        <b>#${i + 1}: ${stop.business_name}</b><br/>
        ${stop.address_line1 || ""}${stop.city ? `<br/>${stop.city}, ${stop.state || ""}` : ""}
      `);
    });

    // Draw polyline
    if (markers.length > 1) {
      L.polyline(markers, { color: "#4f46e5", weight: 3, opacity: 0.6 }).addTo(map);
    }

    map.fitBounds(bounds, { padding: [50, 50] });
  }, [stops]);

  if (!route) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Route not found</h2>
        <Link to="/routes" className="mt-4 inline-block text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">← Back to routes</Link>
      </div>
    );
  }

  const handleToggleVisited = async (stopId: string, visited: boolean) => {
    await updateStopVisited({ stopId, visited });
    setStops(stops.map((s: any) => s.id === stopId ? { ...s, visited } : s));
  };

  const handleCompleteRoute = async () => {
    await updateRouteStatus({ routeId: route.id, status: "completed" });
    setRoute({ ...route, status: "completed" });
  };

  const openNav = (stop: any) => {
    const addr = [stop.address_line1, stop.city, stop.state].filter(Boolean).join(", ");
    if (addr) window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, "_blank");
  };

  const openWaze = (stop: any) => {
    const addr = [stop.address_line1, stop.city, stop.state].filter(Boolean).join(", ");
    if (addr) window.open(`https://waze.com/ul?q=${encodeURIComponent(addr)}`, "_blank");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/routes" className="hover:text-indigo-600 dark:hover:text-indigo-400">Routes</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700 dark:text-gray-300">{route.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{route.name}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                route.status === "active" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                route.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              }`}>{route.status}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              <span>{stops.length} stop{stops.length !== 1 ? "s" : ""}</span>
              {route.total_distance_km && <span>{parseFloat(route.total_distance_km).toFixed(1)} km total</span>}
              {route.optimized && <span className="text-green-600 dark:text-green-400">Optimized route</span>}
              {route.date && <span>{new Date(route.date).toLocaleDateString()}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {route.status === "active" && (
              <button onClick={handleCompleteRoute} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Complete Route
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-gray-700">
        <div ref={mapRef} className="h-[350px] w-full" />
      </div>

      {/* Stop List */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Route Stops</h2>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {stops.map((stop: any, i: number) => (
            <div key={stop.id} className={`p-4 sm:p-6 transition ${stop.visited ? "bg-gray-50 dark:bg-gray-800/50" : ""}`}>
              <div className="flex items-start gap-4">
                {/* Stop number */}
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  stop.visited ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                }`}>{i + 1}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className={`font-semibold ${stop.visited ? "text-gray-500 line-through dark:text-gray-400" : "text-gray-900 dark:text-white"}`}>
                        {stop.business_name}
                      </h3>
                      {stop.contact_name && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{stop.contact_name}</p>
                      )}
                      {stop.address_line1 && (
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                          {stop.address_line1}{stop.city ? `, ${stop.city}${stop.state ? `, ${stop.state}` : ""}` : ""}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400 dark:text-gray-500">
                        {stop.phone && <span>{stop.phone}</span>}
                        {stop.email && <span>{stop.email}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openNav(stop)}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" /></svg>
                        Maps
                      </button>
                      <button
                        onClick={() => openWaze(stop)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.745 3.328A11.954 11.954 0 0 0 12 0C5.373 0 0 5.373 0 12c0 2.55.798 4.91 2.15 6.835l-.372 3.42 3.42-.372A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12 0-3.1-1.181-5.958-3.255-8.129-.086-.096-.172-.19-.26-.283" /></svg>
                        Waze
                      </button>
                    </div>
                  </div>

                  {/* Visit toggle */}
                  <div className="mt-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={stop.visited}
                        onChange={(e) => handleToggleVisited(stop.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Mark as visited
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}