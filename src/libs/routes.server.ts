import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

// ---- Types ----
export type Route = {
  id: string;
  team_id: string;
  user_id: string;
  name: string;
  date: string | null;
  notes: string | null;
  origin_address: string | null;
  origin_latitude: string | null;
  origin_longitude: string | null;
  total_distance_km: string | null;
  total_duration_min: number | null;
  optimized: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type RouteStop = {
  id: string;
  route_id: string;
  contact_id: string;
  stop_order: number;
  notes: string | null;
  planned_duration_min: number | null;
  visited: boolean;
  visit_id: string | null;
  latitude: string | null;
  longitude: string | null;
  created_at: string;
  // Joined fields
  business_name?: string;
  contact_name?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  phone?: string;
};

// ---- haversine distance (km) between two lat/lng points ----
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---- Nearest-neighbor TSP optimizer ----
function optimizeStops(
  stops: { contact_id: string; latitude: number; longitude: number }[],
  originLat?: number,
  originLng?: number,
): string[] {
  if (stops.length <= 1) return stops.map((s) => s.contact_id);

  const unvisited = [...stops];
  const ordered: string[] = [];

  // Start from origin or first stop
  let currentLat = originLat ?? unvisited[0].latitude;
  let currentLng = originLng ?? unvisited[0].longitude;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversineKm(
        currentLat,
        currentLng,
        unvisited[i].latitude,
        unvisited[i].longitude,
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = unvisited[nearestIdx];
    ordered.push(nearest.contact_id);
    currentLat = nearest.latitude;
    currentLng = nearest.longitude;
    unvisited.splice(nearestIdx, 1);
  }

  return ordered;
}

// ---- List routes ----
export const listRoutes = createServerFn({ method: "GET" }).handler(
  async (): Promise<any[]> => {
    const sql = getDb();
    const rows = await sql`
      SELECT r.*, COUNT(rs.id) as stop_count
      FROM routes r
      LEFT JOIN route_stops rs ON rs.route_id = r.id
      GROUP BY r.id
      ORDER BY r.updated_at DESC
      LIMIT 50
    `;
    return rows.map((r: any) => ({
      ...r,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      date: r.date ? String(r.date) : null,
      stop_count: parseInt(r.stop_count),
    }));
  },
);

// ---- Create a new route with stops ----
export const createRoute = createServerFn({ method: "POST" }).handler(
  async (input: {
    name: string;
    contact_ids: string[];
    notes?: string;
    date?: string;
    optimize?: boolean;
  }): Promise<{ id: string }> => {
    const sql = getDb();

    // Get contact locations
    let contacts: { id: string; latitude: string | null; longitude: string | null }[];
    if (input.contact_ids.length > 0) {
      contacts = await sql`
        SELECT id, latitude, longitude FROM contacts
        WHERE id = ANY(${input.contact_ids})
      `;
    } else {
      contacts = [];
    }

    // Determine order
    let orderedIds = input.contact_ids;

    if (input.optimize && contacts.length > 1) {
      const stopsWithCoords = contacts
        .filter((c) => c.latitude && c.longitude)
        .map((c) => ({
          contact_id: c.id,
          latitude: parseFloat(c.latitude!),
          longitude: parseFloat(c.longitude!),
        }));
      // Put geocoded contacts first, non-geocoded at the end
      const geocoded = stopsWithCoords.map((s) => s.contact_id);
      const nonGeocoded = contacts
        .filter((c) => !c.latitude || !c.longitude)
        .map((c) => c.id);
      orderedIds = [...optimizeStops(stopsWithCoords), ...nonGeocoded];
    }

    // Calculate total distance for optimized routes
    let totalDistance = 0;
    if (input.optimize && contacts.length > 1) {
      for (let i = 0; i < orderedIds.length - 1; i++) {
        const c1 = contacts.find((c) => c.id === orderedIds[i]);
        const c2 = contacts.find((c) => c.id === orderedIds[i + 1]);
        if (c1?.latitude && c1?.longitude && c2?.latitude && c2?.longitude) {
          totalDistance += haversineKm(
            parseFloat(c1.latitude),
            parseFloat(c1.longitude),
            parseFloat(c2.latitude),
            parseFloat(c2.longitude),
          );
        }
      }
    }

    // Create route
    const [route] = await sql`
      INSERT INTO routes (team_id, user_id, name, date, notes, total_distance_km, optimized, status)
      VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
              ${input.name}, ${input.date || null}, ${input.notes || null},
              ${totalDistance > 0 ? totalDistance.toFixed(2) : null},
              ${input.optimize || false}, 'active')
      RETURNING id
    `;

    // Insert stops
    for (let i = 0; i < orderedIds.length; i++) {
      const contact = contacts.find((c) => c.id === orderedIds[i]);
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

// ---- Get route with stops ----
export const getRoute = createServerFn({ method: "GET" }).handler(
  async (routeId: string): Promise<{ route: any; stops: any[] } | null> => {
    const sql = getDb();
    const [route] = await sql`SELECT * FROM routes WHERE id = ${routeId}`;
    if (!route) return null;

    const stops = await sql`
      SELECT rs.*, c.business_name, c.contact_name, c.address_line1, c.city, c.state, c.phone,
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
      },
      stops: stops.map((s: any) => ({
        ...s,
        created_at: String(s.created_at),
        updated_at: String(s.updated_at),
        latitude: s.latitude || s.contact_lat,
        longitude: s.longitude || s.contact_lng,
      })),
    };
  },
);

// ---- Update route (reorder stops, toggle visited) ----
export const updateRoute = createServerFn({ method: "POST" }).handler(
  async (input: {
    routeId: string;
    name?: string;
    notes?: string;
    status?: string;
    stopOrder?: { stopId: string; stopOrder: number }[];
  }): Promise<{ success: boolean }> => {
    const sql = getDb();

    // Update route fields
    if (input.name || input.notes || input.status) {
      const updates: string[] = [];
      if (input.name) updates.push(`name = '${input.name.replace(/'/g, "''")}'`);
      if (input.notes !== undefined) updates.push(`notes = ${input.notes ? `'${input.notes.replace(/'/g, "''")}'` : "NULL"}`);
      if (input.status) updates.push(`status = '${input.status}'`);
      updates.push("updated_at = now()");

      await sql([`UPDATE routes SET ${updates.join(", ")} WHERE id = '${input.routeId}'`] as any);
    }

    // Update stop order
    if (input.stopOrder) {
      for (const s of input.stopOrder) {
        await sql`
          UPDATE route_stops SET stop_order = ${s.stopOrder}, updated_at = now()
          WHERE id = ${s.stopId}
        `;
      }
    }

    return { success: true };
  },
);

// ---- Delete route ----
export const deleteRoute = createServerFn({ method: "POST" }).handler(
  async (routeId: string): Promise<{ success: boolean }> => {
    const sql = getDb();
    await sql`DELETE FROM routes WHERE id = ${routeId}`;
    return { success: true };
  },
);

// ---- Get contacts with geolocation for route planning ----
export const getRouteableContacts = createServerFn({ method: "GET" }).handler(
  async (): Promise<any[]> => {
    const sql = getDb();
    const rows = await sql`
      SELECT id, business_name, contact_name, address_line1, city, state, phone,
             latitude, longitude, category, visit_count
      FROM contacts
      WHERE status = 'active'
      ORDER BY business_name ASC
      LIMIT 200
    `;
    return rows.map((r: any) => ({
      ...r,
      latitude: r.latitude?.toString() ?? null,
      longitude: r.longitude?.toString() ?? null,
    }));
  },
);