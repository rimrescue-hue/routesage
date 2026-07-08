import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";

const getBusinessName = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const cfg = JSON.parse(await readFile("site.json", "utf8")) as {
      businessName?: string;
    };
    return cfg.businessName?.trim() ?? "";
  } catch {
    return "";
  }
});

export const Route = createFileRoute("/")({
  loader: () => getBusinessName(),
  component: Home,
});

function Home() {
  const businessName = Route.useLoaderData();
  return (
    <main className="flex min-h-[calc(100dvh-57px)] flex-col items-center justify-center gap-8 px-6 text-center">
      {/* Badge */}
      <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
        Field Sales CRM
      </span>

      {/* Hero */}
      <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
        {businessName || "Field Sales CRM"}
      </h1>
      <p className="max-w-xl text-lg text-gray-600 dark:text-gray-400">
        Ditch the spreadsheets. Track every visit, log notes on the go, and get
        optimized driving routes — all in one place. Works offline, so you never
        lose a note.
      </p>

      {/* CTA */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          to="/contacts"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-500"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          Manage Contacts
        </Link>
        <Link
          to="/contacts/new"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add First Contact
        </Link>
      </div>

      {/* Feature Cards */}
      <div className="mt-12 grid max-w-5xl gap-6 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950">
            <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Contact Management</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Upload CSV/Excel or add businesses on the fly. Tag by category, track status, and never lose a lead.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950">
            <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Visit Tracking</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Log visits, snap photos, record voice notes. Each visit builds a timeline so you always know the history.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950">
            <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Route Planning</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Select contacts, get an optimized driving route with one-tap navigation to Google Maps or Waze.
          </p>
        </div>
      </div>

      <footer className="mt-12 text-sm text-gray-400 dark:text-gray-600">
        Built with{" "}
        <a
          href="https://cto.new"
          className="underline hover:text-gray-600 dark:hover:text-gray-400"
        >
          cto.new
        </a>
      </footer>
    </main>
  );
}