import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { useState, useEffect, useRef } from "react";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

// ---- Contact functions ----
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

// ---- Visit functions ----
const logVisit = createServerFn({ method: "POST" }).handler(
  async (input: Record<string, any>) => {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO visits (contact_id, user_id, visit_type, outcome, notes, duration_minutes, follow_up_date)
      VALUES (${input.contact_id}, '00000000-0000-0000-0000-000000000001', ${input.visit_type}, ${input.outcome}, ${input.notes || null}, ${input.duration_minutes || null}, ${input.follow_up_date || null})
      RETURNING *
    `;
    await sql`UPDATE contacts SET visit_count = visit_count + 1, last_visited_at = now(), updated_at = now() WHERE id = ${input.contact_id}`;
    return { ...row, visit_date: String(row.visit_date), created_at: String(row.created_at), updated_at: String(row.updated_at), follow_up_date: row.follow_up_date ? String(row.follow_up_date) : null };
  },
);

const getVisits = createServerFn({ method: "GET" }).handler(
  async (contactId: string) => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM visits WHERE contact_id = ${contactId} ORDER BY visit_date DESC LIMIT 50`;
    return rows.map((r: any) => ({ ...r, visit_date: String(r.visit_date), created_at: String(r.created_at), updated_at: String(r.updated_at), follow_up_date: r.follow_up_date ? String(r.follow_up_date) : null }));
  },
);

export const Route = createFileRoute("/contacts/$contactId")({
  component: ContactDetail,
  loader: async ({ params }) => getContact(params.contactId),
});

function ContactDetail() {
  const initialContact = Route.useLoaderData();
  const navigate = useNavigate();
  const [contact, setContact] = useState(initialContact);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Visit state
  const [showLogVisit, setShowLogVisit] = useState(false);
  const [visits, setVisits] = useState<any[] | null>(null);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [loggingVisit, setLoggingVisit] = useState(false);

  // Visit form
  const [visitType, setVisitType] = useState("in_person");
  const [visitOutcome, setVisitOutcome] = useState("no_answer");
  const [visitNotes, setVisitNotes] = useState("");
  const [visitDuration, setVisitDuration] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  // Load visits when expanded
  useEffect(() => {
    if (showLogVisit && !visits && contact) {
      loadVisits();
    }
  }, [showLogVisit]);

  const loadVisits = async () => {
    if (!contact) return;
    setLoadingVisits(true);
    try {
      const data = await getVisits(contact.id);
      setVisits(data);
    } catch {}
    setLoadingVisits(false);
  };

  const handleLogVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    setLoggingVisit(true);
    setError("");

    try {
      await logVisit({
        contact_id: contact.id,
        visit_type: visitType,
        outcome: visitOutcome,
        notes: visitNotes || null,
        duration_minutes: visitDuration ? parseInt(visitDuration) : null,
        follow_up_date: followUpDate || null,
      });

      // Reset form
      setVisitType("in_person");
      setVisitOutcome("no_answer");
      setVisitNotes("");
      setVisitDuration("");
      setFollowUpDate("");

      // Reload contact and visits
      const updated = await getContact(contact.id);
      setContact(updated);
      const data = await getVisits(contact.id);
      setVisits(data);
    } catch {
      setError("Failed to log visit.");
    }
    setLoggingVisit(false);
  };

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
    form.forEach((value, key) => { data[key] = value; });
    if (!data.business_name?.trim()) { setError("Business name is required"); setSaving(false); return; }
    try {
      const updated = await updateContact(data);
      setContact(updated);
      setEditing(false);
    } catch { setError("Failed to save changes."); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${contact.business_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await deleteContact(contact.id); navigate({ to: "/contacts" }); }
    catch { setError("Failed to delete contact."); }
    setDeleting(false);
  };

  const openDirections = () => {
    const addr = [contact.address_line1, contact.city, contact.state, contact.zip].filter(Boolean).join(", ");
    if (addr) window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, "_blank");
  };

  const statusBadge = (status: string) => {
    const classes: Record<string, string> = {
      active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      inactive: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
      do_not_contact: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    };
    return classes[status] || classes.active;
  };

  const outcomeBadge = (outcome: string) => {
    const map: Record<string, string> = {
      no_answer: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
      left_materials: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      meeting_scheduled: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
      not_interested: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      follow_up: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      closed_won: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      closed_lost: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      callback_later: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    };
    return map[outcome] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
  };

  const outcomeIcon = (outcome: string) => {
    switch (outcome) {
      case "no_answer": return "📞";
      case "left_materials": return "📄";
      case "meeting_scheduled": return "📅";
      case "not_interested": return "❌";
      case "follow_up": return "🔄";
      case "closed_won": return "✅";
      case "closed_lost": return "❌";
      case "callback_later": return "⏰";
      default: return "📋";
    }
  };

  const visitTypeIcon = (type: string) => {
    switch (type) {
      case "in_person": return "🤝";
      case "call": return "📞";
      case "virtual": return "💻";
      case "drive_by": return "🚗";
      default: return "📋";
    }
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
        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">Business Info</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Name *</label><input name="business_name" defaultValue={contact.business_name} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contact Name</label><input name="contact_name" defaultValue={contact.contact_name || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label><input name="title" defaultValue={contact.title || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label><input name="phone" defaultValue={contact.phone || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label><input name="email" type="email" defaultValue={contact.email || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Website</label><input name="website" defaultValue={contact.website || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
            </div>
          </section>
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">Address</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Address</label><input name="address_line1" defaultValue={contact.address_line1 || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">City</label><input name="city" defaultValue={contact.city || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">State</label><input name="state" defaultValue={contact.state || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">ZIP</label><input name="zip" defaultValue={contact.zip || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Country</label><select name="country" defaultValue={contact.country || "US"} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option><option value="AU">Australia</option></select></div>
            </div>
          </section>
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">Classification</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label><input name="category" defaultValue={contact.category || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label><select name="status" defaultValue={contact.status} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"><option value="active">Active</option><option value="inactive">Inactive</option><option value="do_not_contact">Do Not Contact</option></select></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label><textarea name="notes" rows={3} defaultValue={contact.notes || ""} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" /></div>
            </div>
          </section>
          <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-6 dark:border-gray-700">
            <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-lg px-4 py-2.5 text-sm font-medium text-red-600 hover:text-red-500 disabled:opacity-50">{deleting ? "Deleting..." : "Delete Contact"}</button>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-500 dark:text-gray-300">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{contact.business_name}</h1>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(contact.status)}`}>{contact.status.replace(/_/g, " ")}</span>
            </div>
            {contact.contact_name && <p className="mt-1 text-lg text-gray-600 dark:text-gray-400">{contact.contact_name}{contact.title ? ` — ${contact.title}` : ""}</p>}
            <div className="mt-4 flex flex-wrap gap-6 text-sm text-gray-500 dark:text-gray-400">
              {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>{contact.phone}</a>}
              {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>{contact.email}</a>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => setEditing(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
              Edit
            </button>
            {contact.address_line1 && (
              <button onClick={openDirections} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" /></svg>
                Directions
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {contact.address_line1 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Address</h2>
            <p className="text-gray-900 dark:text-white">
              {contact.address_line1}{contact.address_line2 && <><br />{contact.address_line2}</>}<br />
              {[contact.city, contact.state, contact.zip].filter(Boolean).join(", ")}
            </p>
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Details</h2>
          <dl className="space-y-3">
            {contact.category && <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Category</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{contact.category}</dd></div>}
            {contact.website && <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Website</dt><dd className="text-sm font-medium"><a href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">{contact.website.replace(/^https?:\/\//, "")}</a></dd></div>}
            <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Visits</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{contact.visit_count}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Last visited</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{contact.last_visited_at ? new Date(contact.last_visited_at).toLocaleDateString() : "Never"}</dd></div>
            <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Added</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{new Date(contact.created_at).toLocaleDateString()}</dd></div>
          </dl>
        </div>
        {contact.notes && (
          <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Notes</h2>
            <p className="whitespace-pre-wrap text-gray-900 dark:text-white">{contact.notes}</p>
          </div>
        )}
      </div>

      {/* Visit Tracking Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Visit History</h2>
          <button
            onClick={() => setShowLogVisit(!showLogVisit)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {showLogVisit ? "Close" : "Log Visit"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">{error}</div>
        )}

        {/* Log Visit Form */}
        {showLogVisit && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Log a Visit</h3>
            <form onSubmit={handleLogVisit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Visit Type</label>
                  <select value={visitType} onChange={(e) => setVisitType(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                    <option value="in_person">In Person</option>
                    <option value="call">Phone Call</option>
                    <option value="virtual">Virtual Meeting</option>
                    <option value="drive_by">Drive By</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Outcome</label>
                  <select value={visitOutcome} onChange={(e) => setVisitOutcome(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                    <option value="no_answer">No Answer</option>
                    <option value="left_materials">Left Materials</option>
                    <option value="meeting_scheduled">Meeting Scheduled</option>
                    <option value="not_interested">Not Interested</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="closed_won">Closed Won</option>
                    <option value="closed_lost">Closed Lost</option>
                    <option value="callback_later">Callback Later</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Duration (minutes)</label>
                  <input type="number" min="1" value={visitDuration} onChange={(e) => setVisitDuration(e.target.value)} placeholder="e.g. 30" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Follow-up Date</label>
                  <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
                  <textarea value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} rows={2} placeholder="Add notes about this visit..." className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={loggingVisit} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
                  {loggingVisit ? "Logging..." : "Log Visit"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Visit Timeline */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          {loadingVisits ? (
            <div className="flex items-center justify-center p-8">
              <svg className="h-6 w-6 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="ml-3 text-sm text-gray-500">Loading visits...</span>
            </div>
          ) : !visits || visits.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <svg className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="mt-3 text-sm font-medium">No visits logged yet</p>
              <p className="mt-1 text-xs">Click "Log Visit" above to record your first interaction</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {visits.map((visit: any) => (
                <div key={visit.id} className="p-4 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg dark:bg-indigo-950">
                      {visitTypeIcon(visit.visit_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {visit.visit_type === "in_person" ? "In-Person Visit" :
                             visit.visit_type === "call" ? "Phone Call" :
                             visit.visit_type === "virtual" ? "Virtual Meeting" :
                             visit.visit_type === "drive_by" ? "Drive By" : visit.visit_type}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {new Date(visit.visit_date).toLocaleString()}
                            {visit.duration_minutes && ` · ${visit.duration_minutes} min`}
                          </p>
                        </div>
                        <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${outcomeBadge(visit.outcome)}`}>
                          {outcomeIcon(visit.outcome)} {visit.outcome.replace(/_/g, " ")}
                        </span>
                      </div>
                      {visit.notes && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                          {visit.notes}
                        </p>
                      )}
                      {visit.follow_up_date && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                          ⏰ Follow up: {new Date(visit.follow_up_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reminders Section */}
      <RemindersSection contactId={contact.id} />

      {/* Notes Section */}
      <NotesSection contactId={contact.id} />
    </div>
  );
}

// ---- Reminders Section Component ----
function RemindersSection({ contactId }: { contactId: string }) {
  const [reminders, setReminders] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadReminders(); }, []);

  const loadReminders = async () => {
    setLoading(true);
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT * FROM reminders WHERE contact_id = ${contactId} ORDER BY completed ASC, remind_at ASC LIMIT 20
      `;
      setReminders(rows.map((r: any) => ({ ...r, remind_at: String(r.remind_at), created_at: String(r.created_at), completed_at: r.completed_at ? String(r.completed_at) : null })));
    } catch {}
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !remindAt) return;
    setSaving(true);
    try {
      const sql = getDb();
      await sql`INSERT INTO reminders (user_id, contact_id, title, description, remind_at) VALUES ('00000000-0000-0000-0000-000000000001', ${contactId}, ${title}, ${description || null}, ${remindAt})`;
      setTitle(""); setDescription(""); setRemindAt(""); setShowForm(false);
      loadReminders();
    } catch {}
    setSaving(false);
  };

  const handleToggle = async (id: string) => {
    try {
      const sql = getDb();
      await sql`UPDATE reminders SET completed = NOT completed, completed_at = CASE WHEN NOT completed THEN now() ELSE NULL END, updated_at = now() WHERE id = ${id}`;
      loadReminders();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this reminder?")) return;
    try {
      const sql = getDb();
      await sql`DELETE FROM reminders WHERE id = ${id}`;
      loadReminders();
    } catch {}
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Reminders</h2>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          {showForm ? "Close" : "Add Reminder"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up on proposal" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remind on *</label>
              <input type="date" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
              {saving ? "Saving..." : "Create Reminder"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {loading ? (
          <div className="flex items-center justify-center p-6 text-sm text-gray-500">Loading...</div>
        ) : !reminders || reminders.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No reminders for this contact</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {reminders.map((r: any) => (
              <div key={r.id} className={`flex items-center gap-3 p-4 ${r.completed ? "bg-gray-50 dark:bg-gray-800/50" : ""}`}>
                <button onClick={() => handleToggle(r.id)} className="flex-shrink-0">
                  {r.completed ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-indigo-500 dark:border-gray-600" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${r.completed ? "text-gray-500 line-through dark:text-gray-400" : "text-gray-900 dark:text-white"}`}>{r.title}</p>
                  {r.description && <p className="text-xs text-gray-500 dark:text-gray-400">{r.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${new Date(r.remind_at) < new Date() && !r.completed ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
                    {new Date(r.remind_at).toLocaleDateString()}
                  </span>
                  <button onClick={() => handleDelete(r.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Notes Section Component ----
function NotesSection({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [noteType, setNoteType] = useState("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadNotes(); }, []);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const sql = getDb();
      const rows = await sql`SELECT * FROM notes WHERE contact_id = ${contactId} ORDER BY created_at DESC LIMIT 50`;
      setNotes(rows.map((r: any) => ({ ...r, created_at: String(r.created_at) })));
    } catch {}
    setLoading(false);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim() && !photoPreview) return;
    setSaving(true);
    try {
      const sql = getDb();
      await sql`
        INSERT INTO notes (contact_id, user_id, note_type, title, content, file_url, file_type)
        VALUES (${contactId}, '00000000-0000-0000-0000-000000000001',
                ${noteType}, ${title || null}, ${content || null},
                ${photoPreview || null}, ${noteType === "photo" ? "image/png" : null})
      `;
      setTitle(""); setContent(""); setNoteType("text"); setPhotoPreview(null); setShowForm(false);
      loadNotes();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      const sql = getDb();
      await sql`DELETE FROM notes WHERE id = ${noteId}`;
      loadNotes();
    } catch {}
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notes</h2>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          {showForm ? "Close" : "Add Note"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex gap-2">
            <button type="button" onClick={() => setNoteType("text")} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${noteType === "text" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>Text</button>
            <button type="button" onClick={() => { setNoteType("photo"); setPhotoPreview(null); }} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${noteType === "photo" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>Photo</button>
            <button type="button" onClick={() => setNoteType("voice")} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${noteType === "voice" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>Voice</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>

            {noteType === "text" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Content</label>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Type your notes here..." className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>
            )}

            {noteType === "photo" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload Photo</label>
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-950 dark:file:text-indigo-300" />
                {photoPreview && (
                  <div className="mt-2">
                    <img src={photoPreview} alt="Preview" className="max-h-48 rounded-lg object-contain" />
                  </div>
                )}
              </div>
            )}

            {noteType === "voice" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Voice Note</label>
                <input type="file" accept="audio/*" capture="user" className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-950 dark:file:text-indigo-300" />
                <p className="mt-1 text-xs text-gray-400">Record an audio note (voice recordings stored on device)</p>
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
              {saving ? "Saving..." : "Save Note"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {loading ? (
          <div className="flex items-center justify-center p-6 text-sm text-gray-500">Loading...</div>
        ) : !notes || notes.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No notes yet</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {notes.map((note: any) => (
              <div key={note.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm dark:bg-indigo-950">
                    {note.note_type === "text" ? "📝" : note.note_type === "photo" ? "📷" : "🎤"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{note.title || (note.note_type === "text" ? "Text Note" : note.note_type === "photo" ? "Photo" : "Voice Note")}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(note.created_at).toLocaleString()}</p>
                      </div>
                      <button onClick={() => handleDelete(note.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                    </div>
                    {note.content && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{note.content}</p>}
                    {note.file_url && note.note_type === "photo" && (
                      <div className="mt-2">
                        <img src={note.file_url} alt="Note photo" className="max-h-48 rounded-lg object-contain" />
                      </div>
                    )}
                    {note.file_url && note.note_type === "voice" && (
                      <div className="mt-2">
                        <audio controls src={note.file_url} className="w-full max-w-xs" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}