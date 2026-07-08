import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { useState } from "react";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const getContacts = createServerFn({ method: "GET" }).handler(async () => {
  const sql = getDb();
  const rows = await sql`
    SELECT id, business_name, contact_name, address_line1, city, state, phone,
           latitude, longitude, category
    FROM contacts WHERE status = 'active'
    ORDER BY business_name ASC LIMIT 200
  `;
  return rows.map((r: any) => ({
    ...r,
    latitude: r.latitude?.toString() ?? null,
    longitude: r.longitude?.toString() ?? null,
  }));
});

const createRoute = createServerFn({ method: "POST" }).handler(
  async (input: Record<string, any>) => {
    const sql = getDb();

    const contactIds = JSON.parse(input.contact_ids);
    let contacts: any[];
    if (contactIds.length > 0) {
      contacts = await sql`
        SELECT id, latitude, longitude FROM contacts WHERE id = ANY(${contactIds})
      `;
    } else {
      contacts = [];
    }

    let orderedIds = contactIds;

    if (input.optimize === "true" && contacts.length > 1) {
      const withCoords = contacts
        .filter((c: any) => c.latitude && c.longitude)
        .map((c: any) => ({
          contact_id: c.id,
          latitude: parseFloat(c.latitude),
          longitude: parseFloat(c.longitude),
        }));
      const geoOrdered = nearestNeighbor(withCoords);
      const nonGeo = contacts
        .filter((c: any) => !c.latitude || !c.longitude)
        .map((c: any) => c.id);
      orderedIds = [...geoOrdered, ...nonGeo];
    }

    // Total distance
    let totalDistance = 0;
    if (input.optimize === "true" && contacts.length > 1) {
      for (let i = 0; i < orderedIds.length - 1; i++) {
        const c1 = contacts.find((c: any) => c.id === orderedIds[i]);
        const c2 = contacts.find((c: any) => c.id === orderedIds[i + 1]);
        if (c1?.latitude && c1?.longitude && c2?.latitude && c2?.longitude) {
          totalDistance += haversineKm(
            parseFloat(c1.latitude), parseFloat(c1.longitude),
            parseFloat(c2.latitude), parseFloat(c2.longitude),
          );
        }
      }
    }

    const [route] = await sql`
      INSERT INTO routes (team_id, user_id, name, date, notes, total_distance_km, optimized, status)
      VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
              ${input.name}, ${input.date || null}, ${input.notes || null},
              ${totalDistance > 0 ? totalDistance.toFixed(2) : null},
              ${input.optimize === "true"}, 'active')
      RETURNING id
    `;

    for (let i = 0; i < orderedIds.length; i++) {
      const contact = contacts.find((c: any) => c.id === orderedIds[i]);
      await sql`
        INSERT INTO route_stops (route_id, contact_id, stop_order, latitude, longitude)
        VALUES (${route.id}, ${orderedIds[i]}, ${i + 1},
                ${contact?.latitude ? parseFloat(contact.latitude) : null},
                ${contact?.longitude ? parseFloat(contact.longitude) : null})
      `;
    }

    return { id: route.id };
  },
);

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNeighbor(stops: { contact_id: string; latitude: number; longitude: number }[]): string[] {
  if (stops.length <= 1) return stops.map((s) => s.contact_id);
  const unvisited = [...stops];
  const ordered: string[] = [];
  let currentLat = unvisited[0].latitude;
  let currentLng = unvisited[0].longitude;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversineKm(currentLat, currentLng, unvisited[i].latitude, unvisited[i].longitude);
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
    }
    const nearest = unvisited[nearestIdx];
    ordered.push(nearest.contact_id);
    currentLat = nearest.latitude;
    currentLng = nearest.longitude;
    unvisited.splice(nearestIdx, 1);
  }
  return ordered;
}

export const Route = createFileRoute("/routes/new")({
  component: NewRoute,
  loader: () => getContacts(),
});

function NewRoute() {
  const navigate = useNavigate();
  const allContacts = Route.useLoaderData();
  const [routeName, setRouteName] = useState("");
  const [routeDate, setRouteDate] = useState("");
  const [optimize, setOptimize] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = allContacts.filter((c: any) =>
    !search || c.business_name.toLowerCase().includes(search.toLowerCase()) ||
    c.city?.toLowerCase().includes(search.toLowerCase()) ||
    c.category?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedContacts = allContacts.filter((c: any) => selectedIds.has(c.id));
  const orderedContacts = [...selectedContacts];

  const toggleContact = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const moveContact = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === orderedContacts.length - 1) return;
    const arr = [...orderedContacts];
    const swap = direction === "up" ? index - 1 : index + 1;
    [arr[index], arr[swap]] = [arr[swap], arr[index]];
    // Rebuild set preserving order
    const newIds = new Set(arr.map((c: any) => c.id));
    setSelectedIds(newIds);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeName.trim()) { setError("Route name is required"); return; }
    if (selectedIds.size === 0) { setError("Select at least one contact"); return; }
    setSaving(true);
    setError("");

    try {
      const result = await createRoute({
        name: routeName,
        date: routeDate || null,
        notes: null,
        contact_ids: JSON.stringify(Array.from(selectedIds)),
        optimize: optimize.toString(),
      });
      navigate({ to: "/routes/$routeId", params: { routeId: result.id } });
    } catch {
      setError("Failed to create route.");
    }
    setSaving(false);
  };

  const hasLocation = (c: any) => c.latitude && c.longitude;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/routes" className="hover:text-indigo-600 dark:hover:text-indigo-400">Routes</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700 dark:text-gray-300">New Route</span>
      </nav>

      <h1 className="mb-8 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">New Route</h1>

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Route Info */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Route Name *</label>
              <input value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="e.g. Tuesday East Side" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
              <input type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800">
                <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Optimize route order</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Arrange stops by nearest-neighbor for the shortest driving route</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Contact Selection */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Select Contacts ({selectedIds.size} selected)
            </h2>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />

          {/* Selected contacts (ordered list) */}
          {selectedIds.size > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Stops ({selectedContacts.length})</h3>
              <div className="space-y-1 rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950/30">
                {orderedContacts.map((c: any, i: number) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm shadow-sm dark:bg-gray-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">{i + 1}</span>
                    <span className="flex-1 text-gray-900 dark:text-white truncate">{c.business_name}</span>
                    {!hasLocation(c) && <span className="text-xs text-amber-500">no GPS</span>}
                    <div className="flex gap-1">
                      <button type="button" onClick={() => moveContact(i, "up")} disabled={i === 0} className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                      </button>
                      <button type="button" onClick={() => moveContact(i, "down")} disabled={i === orderedContacts.length - 1} className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                      <button type="button" onClick={() => toggleContact(c.id)} className="rounded p-0.5 text-red-400 hover:text-red-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available contacts */}
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">No contacts found</p>
            ) : (
              filtered.map((c: any) => (
                <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800 ${selectedIds.has(c.id) ? "bg-indigo-50 dark:bg-indigo-950/20" : ""}`}>
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleContact(c.id)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900 dark:text-white">{c.business_name}</span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      {[c.city, c.state].filter(Boolean).join(", ")}
                      {!hasLocation(c) && <span className="ml-1 text-amber-500">(no GPS)</span>}
                    </span>
                  </div>
                  {c.category && <span className="text-xs text-gray-400 dark:text-gray-500">{c.category}</span>}
                </label>
              ))
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <Link to="/routes" className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-500 dark:text-gray-300">Cancel</Link>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
            {saving ? "Creating..." : `Create Route (${selectedIds.size} stops)`}
          </button>
        </div>
      </form>
    </div>
  );
}