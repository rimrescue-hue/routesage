import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { useState } from "react";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const listRoutes = createServerFn({ method: "GET" }).handler(async () => {
  const sql = getDb();
  const rows = await sql`
    SELECT r.id, r.name, r.date, r.status, r.optimized, r.total_distance_km,
           r.created_at, r.updated_at,
           COUNT(rs.id) as stop_count,
           COUNT(rs.id) FILTER (WHERE rs.visited) as visited_count
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
    visited_count: parseInt(r.visited_count),
  }));
});

export const Route = createFileRoute("/routes/")({
  component: RoutesList,
  loader: () => listRoutes(),
});

function RoutesList() {
  const routes = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Routes</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Plan and optimize your driving routes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/routes/new"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Route
          </Link>
        </div>
      </div>

      {routes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No routes yet</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Create your first route to start planning visits
          </p>
          <Link
            to="/routes/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create First Route
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {routes.map((route: any) => (
            <Link
              key={route.id}
              to="/routes/$routeId"
              params={{ routeId: route.id }}
              className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-600"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                      {route.name}
                    </h3>
                    {route.optimized && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        Optimized
                      </span>
                    )}
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      route.status === "active" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                      route.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                      "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    }`}>
                      {route.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                    <span>{route.stop_count} stop{route.stop_count !== 1 ? "s" : ""}</span>
                    {route.visited_count > 0 && <span>{route.visited_count} visited</span>}
                    {route.total_distance_km && <span>{parseFloat(route.total_distance_km).toFixed(1)} km</span>}
                    {route.date && <span>{new Date(route.date).toLocaleDateString()}</span>}
                  </div>
                </div>
                <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}