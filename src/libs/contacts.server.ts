import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

// ---- Types ----
export type Contact = {
  id: string;
  team_id: string;
  created_by: string;
  business_name: string;
  contact_name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  latitude: string | null;
  longitude: string | null;
  category: string | null;
  source: string;
  status: string;
  notes: string | null;
  last_visited_at: string | null;
  visit_count: number;
  created_at: string;
  updated_at: string;
};

export type ContactInput = {
  business_name: string;
  contact_name?: string;
  title?: string;
  phone?: string;
  email?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  status?: string;
  notes?: string;
};

// ---- List contacts ----
export const listContacts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Contact[]> => {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM contacts
      ORDER BY updated_at DESC
      LIMIT 100
    `;
    return rows.map((r: any) => ({
      ...r,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      last_visited_at: r.last_visited_at ? String(r.last_visited_at) : null,
      latitude: r.latitude?.toString() ?? null,
      longitude: r.longitude?.toString() ?? null,
    })) as Contact[];
  },
);

// ---- Get single contact ----
export const getContact = createServerFn({ method: "GET" }).handler(
  async (contactId: string): Promise<Contact | null> => {
    const sql = getDb();
    const [row] = await sql`
      SELECT * FROM contacts WHERE id = ${contactId}
    `;
    if (!row) return null;
    return {
      ...row,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      last_visited_at: row.last_visited_at ? String(row.last_visited_at) : null,
      latitude: row.latitude?.toString() ?? null,
      longitude: row.longitude?.toString() ?? null,
    } as Contact;
  },
);

// ---- Create contact ----
export const createContact = createServerFn({ method: "POST" }).handler(
  async (input: ContactInput): Promise<Contact> => {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO contacts (
        team_id, created_by, business_name, contact_name, title,
        phone, email, website,
        address_line1, address_line2, city, state, zip, country,
        latitude, longitude,
        category, status, notes
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        ${input.business_name},
        ${input.contact_name ?? null},
        ${input.title ?? null},
        ${input.phone ?? null},
        ${input.email ?? null},
        ${input.website ?? null},
        ${input.address_line1 ?? null},
        ${input.address_line2 ?? null},
        ${input.city ?? null},
        ${input.state ?? null},
        ${input.zip ?? null},
        ${input.country ?? 'US'},
        ${input.latitude ?? null},
        ${input.longitude ?? null},
        ${input.category ?? null},
        ${input.status ?? 'active'},
        ${input.notes ?? null}
      )
      RETURNING *
    `;
    return {
      ...row,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      last_visited_at: row.last_visited_at ? String(row.last_visited_at) : null,
      latitude: row.latitude?.toString() ?? null,
      longitude: row.longitude?.toString() ?? null,
    } as Contact;
  },
);

// ---- Update contact ----
export const updateContact = createServerFn({ method: "POST" }).handler(
  async ({
    id,
    input,
  }: {
    id: string;
    input: Partial<ContactInput>;
  }): Promise<Contact> => {
    const sql = getDb();

    // Build dynamic UPDATE
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      business_name: "business_name",
      contact_name: "contact_name",
      title: "title",
      phone: "phone",
      email: "email",
      website: "website",
      address_line1: "address_line1",
      address_line2: "address_line2",
      city: "city",
      state: "state",
      zip: "zip",
      country: "country",
      latitude: "latitude",
      longitude: "longitude",
      category: "category",
      status: "status",
      notes: "notes",
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if ((input as any)[key] !== undefined) {
        // Use a typed approach with the sql tagged template
        (input as any)[`__${key}`] = (input as any)[key];
      }
    }

    // Simpler approach: build SQL manually via the tagged template
    const updates: string[] = [];
    for (const [key, col] of Object.entries(fieldMap)) {
      if ((input as any)[key] !== undefined) {
        updates.push(`${col} = ${JSON.stringify((input as any)[key])}`);
      }
    }

    if (updates.length === 0) {
      // Just return the existing contact
      const [row] = await sql`SELECT * FROM contacts WHERE id = ${id}`;
      return row as Contact;
    }

    const query = `UPDATE contacts SET ${updates.join(", ")}, updated_at = now() WHERE id = '${id}' RETURNING *`;
    const [row] = await sql([query] as any);
    return {
      ...row,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      last_visited_at: row.last_visited_at ? String(row.last_visited_at) : null,
      latitude: row.latitude?.toString() ?? null,
      longitude: row.longitude?.toString() ?? null,
    } as Contact;
  },
);

// ---- Delete contact ----
export const deleteContact = createServerFn({ method: "POST" }).handler(
  async (id: string): Promise<{ success: boolean }> => {
    const sql = getDb();
    await sql`DELETE FROM contacts WHERE id = ${id}`;
    return { success: true };
  },
);

// ---- Search contacts ----
export const searchContacts = createServerFn({ method: "GET" }).handler(
  async (query: string): Promise<Contact[]> => {
    const sql = getDb();
    const searchTerm = `%${query}%`;
    const rows = await sql`
      SELECT * FROM contacts
      WHERE business_name ILIKE ${searchTerm}
         OR contact_name ILIKE ${searchTerm}
         OR phone ILIKE ${searchTerm}
         OR email ILIKE ${searchTerm}
         OR city ILIKE ${searchTerm}
         OR category ILIKE ${searchTerm}
      ORDER BY business_name ASC
      LIMIT 50
    `;
    return rows.map((r: any) => ({
      ...r,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      last_visited_at: r.last_visited_at ? String(r.last_visited_at) : null,
      latitude: r.latitude?.toString() ?? null,
      longitude: r.longitude?.toString() ?? null,
    })) as Contact[];
  },
);