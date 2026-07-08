import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { useState } from "react";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const getReminders = createServerFn({ method: "GET" }).handler(async () => {
  const sql = getDb();
  const rows = await sql`
    SELECT r.*, c.business_name
    FROM reminders r
    JOIN contacts c ON c.id = r.contact_id
    ORDER BY r.completed ASC, r.remind_at ASC
    LIMIT 50
  `;
  return rows.map((r: any) => ({
    ...r,
    remind_at: String(r.remind_at),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    completed_at: r.completed_at ? String(r.completed_at) : null,
  }));
});

const toggleReminder = createServerFn({ method: "POST" }).handler(
  async (reminderId: string) => {
    const sql = getDb();
    const [row] = await sql`
      UPDATE reminders
      SET completed = NOT completed,
          completed_at = CASE WHEN NOT completed THEN now() ELSE NULL END,
          updated_at = now()
      WHERE id = ${reminderId}
      RETURNING completed
    `;
    return { success: row?.completed ?? false };
  },
);

const deleteReminder = createServerFn({ method: "POST" }).handler(
  async (reminderId: string) => {
    const sql = getDb();
    await sql`DELETE FROM reminders WHERE id = ${reminderId}`;
    return { success: true };
  },
);

export const Route = createFileRoute("/reminders/")({
  component: RemindersList,
  loader: () => getReminders(),
});

function RemindersList() {
  const initialData = Route.useLoaderData();
  const [reminders, setReminders] = useState(initialData);

  const handleToggle = async (id: string) => {
    await toggleReminder(id);
    setReminders(reminders.map((r: any) =>
      r.id === id ? { ...r, completed: !r.completed, completed_at: !r.completed ? new Date().toISOString() : null } : r
    ));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this reminder?")) return;
    await deleteReminder(id);
    setReminders(reminders.filter((r: any) => r.id !== id));
  };

  const isOverdue = (date: string) => new Date(date) < new Date() && !reminders.find((r: any) => r.remind_at === date)?.completed;
  const isToday = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  };

  const pending = reminders.filter((r: any) => !r.completed);
  const completed = reminders.filter((r: any) => r.completed);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Reminders</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {pending.length} pending · {completed.length} completed
          </p>
        </div>
      </div>

      {reminders.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No reminders yet</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Reminders are created when you schedule follow-ups on visits, or you can add them from a contact's page.
          </p>
        </div>
      ) : (
        <>
          {/* Pending */}
          {pending.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Pending</h2>
              <div className="space-y-2">
                {pending.map((r: any) => (
                  <div key={r.id} className={`rounded-xl border p-4 shadow-sm transition ${
                    isToday(r.remind_at)
                      ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
                      : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                  }`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => handleToggle(r.id)} className="mt-0.5 flex-shrink-0">
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-indigo-500 dark:border-gray-600" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{r.title}</p>
                            <Link to="/contacts/$contactId" params={{ contactId: r.contact_id }}
                              className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                              {r.business_name}
                            </Link>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xs font-medium ${
                              isOverdue(r.remind_at) ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
                            }`}>
                              {isToday(r.remind_at) ? "Today" : new Date(r.remind_at).toLocaleDateString()}
                            </span>
                            <button onClick={() => handleDelete(r.id)} className="text-xs text-gray-400 hover:text-red-500">
                              Delete
                            </button>
                          </div>
                        </div>
                        {r.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{r.description}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Completed</h2>
              <div className="space-y-2">
                {completed.map((r: any) => (
                  <div key={r.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-start gap-3">
                      <button onClick={() => handleToggle(r.id)} className="mt-0.5 flex-shrink-0">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        </div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-gray-500 line-through dark:text-gray-400">{r.title}</p>
                            <Link to="/contacts/$contactId" params={{ contactId: r.contact_id }}
                              className="text-sm text-indigo-400 hover:text-indigo-300">
                              {r.business_name}
                            </Link>
                          </div>
                          <button onClick={() => handleDelete(r.id)} className="text-xs text-gray-400 hover:text-red-500">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}