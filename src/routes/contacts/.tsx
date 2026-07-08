import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { useState } from "react";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const getContact = createServerFn({ method: "GET" }).handler(
  async (contactId: string) => {
    const sql = getDb();
    const [row] = await sql`SELECT * FROM contacts WHERE id = ${contactId}`;
    if (!row) return null;
    return {
      ...row,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      last_visited_at: row.last_visited_at ? String(row.last_visited_at) : null,
    };
  },
);

const updateContact = createServerFn({ method: "POST" }).handler(
  async ({ id, ...data }: Record<string, any>) => {
    const sql = getDb();
    const allowedFields = [
      "business_name", "contact_name", "title", "phone", "email", "website",
      "address_line1", "address_line2", "city", "state", "zip", "country",
      "latitude", "longitude", "category", "status", "notes",
    ];

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${idx}`);
        values.push(data[field] === "" ? null : data[field]);
        idx++;
      }
    }

    if (sets.length === 0) {
      const [row] = await sql`SELECT * FROM contacts WHERE id = ${id}`;
      return row;
    }

    sets.push(`updated_at = now()`);
    values.push(id);
    const query = `UPDATE contacts SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`;
    const [row] = await sql([query, ...values] as any);
    return {
      ...row,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      last_visited_at: row.last_visited_at ? String(row.last_visited_at) : null,
    };
  },
);

const deleteContact = createServerFn({ method: "POST" }).handler(
  async (id: string) => {
    const sql = getDb();
    await sql`DELETE FROM contacts WHERE id = ${id}`;
    return { success: true };
  },
);

export const Route = createFileRoute("/contacts/$contactId")({
  component: ContactDetail,
  loader: async ({ params }) => getContact(params.contactId),
});

function ContactDetail() {
  const contact = Route.useLoaderData();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!contact) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Contact not found</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">This contact may have been deleted.</p>
        <Link to="/contacts" className="mt-4 inline-block text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
          ← Back to contacts
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const data: Record<string, any> = { id: contact.id };
    form.forEach((value, key) => {
      data[key] = value;
    });

    if (!data.business_name?.trim()) {
      setError("Business name is required");
      setSaving(false);
      return;
    }

    try {
      await updateContact(data);
      setEditing(false);
      navigate({ to: "/contacts/$contactId", params: { contactId: contact.id } });
    } catch {
      setError("Failed to save changes.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${contact.business_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteContact(contact.id);
      navigate({ to: "/contacts" });
    } catch {
      setError("Failed to delete contact.");
      setDeleting(false);
    }
  };

  const openDirections = () => {
    const addr = [contact.address_line1, contact.city, contact.state, contact.zip]
      .filter(Boolean)
      .join(", ");
    if (addr) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, "_blank");
    }
  };

  const statusBadge = (status: string) => {
    const classes: Record<string, string> = {
      active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      inactive: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
      do_not_contact: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    };
    return classes[status] || classes.active;
  };

  if (editing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          <Link to="/contacts" className="hover:text-indigo-600 dark:hover:text-indigo-400">Contacts</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700 dark:text-gray-300">{contact.business_name}</span>
        </nav>
        <h1 className="mb-8 text-2xl font-bold text-gray-900 dark:text-white">Edit Contact</h1>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">Business Info</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Name *</label>
                <input name="business_name" defaultValue={contact.business_name} required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contact Name</label>
                <input name="contact_name" defaultValue={contact.contact_name || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                <input name="title" defaultValue={contact.title || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
                <input name="phone" defaultValue={contact.phone || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <input name="email" type="email" defaultValue={contact.email || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Website</label>
                <input name="website" defaultValue={contact.website || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">Address</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Address</label>
                <input name="address_line1" defaultValue={contact.address_line1 || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">City</label>
                <input name="city" defaultValue={contact.city || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">State</label>
                <input name="state" defaultValue={contact.state || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">ZIP</label>
                <input name="zip" defaultValue={contact.zip || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Country</label>
                <select name="country" defaultValue={contact.country || "US"}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">Classification</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                <input name="category" defaultValue={contact.category || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select name="status" defaultValue={contact.status}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="do_not_contact">Do Not Contact</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
                <textarea name="notes" rows={3} defaultValue={contact.notes || ""}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-6 dark:border-gray-700">
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-red-600 hover:text-red-500 disabled:opacity-50">
              {deleting ? "Deleting..." : "Delete Contact"}
            </button>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setEditing(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-500 dark:text-gray-300">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/contacts" className="hover:text-indigo-600 dark:hover:text-indigo-400">Contacts</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700 dark:text-gray-300">{contact.business_name}</span>
      </nav>

      {/* Header Card */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {contact.business_name}
              </h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(contact.status)}`}>
                {contact.status.replace(/_/g, " ")}
              </span>
            </div>
            {contact.contact_name && (
              <p className="mt-1 text-lg text-gray-600 dark:text-gray-400">
                {contact.contact_name}{contact.title ? ` — ${contact.title}` : ""}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-6 text-sm text-gray-500 dark:text-gray-400">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                  </svg>
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                  {contact.email}
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => setEditing(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
              Edit
            </button>
            {contact.address_line1 && (
              <button onClick={openDirections}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                </svg>
                Directions
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Address */}
        {contact.address_line1 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Address</h2>
            <p className="text-gray-900 dark:text-white">
              {contact.address_line1}
              {contact.address_line2 && <><br />{contact.address_line2}</>}
              <br />
              {[contact.city, contact.state, contact.zip].filter(Boolean).join(", ")}
            </p>
          </div>
        )}

        {/* Details */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Details</h2>
          <dl className="space-y-3">
            {contact.category && (
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Category</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-white">{contact.category}</dd>
              </div>
            )}
            {contact.website && (
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Website</dt>
                <dd className="text-sm font-medium">
                  <a href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                    {contact.website.replace(/^https?:\/\//, "")}
                  </a>
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Visits</dt>
              <dd className="text-sm font-medium text-gray-900 dark:text-white">{contact.visit_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Last visited</dt>
              <dd className="text-sm font-medium text-gray-900 dark:text-white">
                {contact.last_visited_at
                  ? new Date(contact.last_visited_at).toLocaleDateString()
                  : "Never"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Added</dt>
              <dd className="text-sm font-medium text-gray-900 dark:text-white">
                {new Date(contact.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        {/* Notes */}
        {contact.notes && (
          <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Notes</h2>
            <p className="whitespace-pre-wrap text-gray-900 dark:text-white">{contact.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}