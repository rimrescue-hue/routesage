import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

// ---- Types ----
export type Visit = {
  id: string;
  contact_id: string;
  user_id: string;
  visit_date: string;
  visit_type: string;
  outcome: string;
  notes: string | null;
  duration_minutes: number | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
};

export type VisitInput = {
  contact_id: string;
  visit_type: string;
  outcome: string;
  notes?: string;
  duration_minutes?: number;
  follow_up_date?: string;
};

// ---- Log a visit ----
export const logVisit = createServerFn({ method: "POST" }).handler(
  async (input: VisitInput): Promise<Visit> => {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO visits (
        contact_id, user_id, visit_type, outcome, notes, duration_minutes, follow_up_date
      ) VALUES (
        ${input.contact_id},
        '00000000-0000-0000-0000-000000000001',
        ${input.visit_type},
        ${input.outcome},
        ${input.notes || null},
        ${input.duration_minutes || null},
        ${input.follow_up_date ? input.follow_up_date : null}
      )
      RETURNING *
    `;

    // Update contact stats
    await sql`
      UPDATE contacts
      SET visit_count = visit_count + 1,
          last_visited_at = now(),
          updated_at = now()
      WHERE id = ${input.contact_id}
    `;

    return {
      ...row,
      visit_date: String(row.visit_date),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      follow_up_date: row.follow_up_date ? String(row.follow_up_date) : null,
    } as Visit;
  },
);

// ---- Get visits for a contact ----
export const getVisitsForContact = createServerFn({ method: "GET" }).handler(
  async (contactId: string): Promise<Visit[]> => {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM visits
      WHERE contact_id = ${contactId}
      ORDER BY visit_date DESC
      LIMIT 50
    `;
    return rows.map((r: any) => ({
      ...r,
      visit_date: String(r.visit_date),
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      follow_up_date: r.follow_up_date ? String(r.follow_up_date) : null,
      duration_minutes: r.duration_minutes,
    })) as Visit[];
  },
);

// ---- Get visit summary stats ----
export const getVisitStats = createServerFn({ method: "GET" }).handler(
  async (contactId: string): Promise<{
    totalVisits: number;
    lastOutcome: string | null;
    lastVisitDate: string | null;
    outcomes: Record<string, number>;
  }> => {
    const sql = getDb();
    const rows = await sql`
      SELECT outcome, visit_date FROM visits
      WHERE contact_id = ${contactId}
      ORDER BY visit_date DESC
    `;

    const outcomes: Record<string, number> = {};
    for (const r of rows) {
      outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
    }

    return {
      totalVisits: rows.length,
      lastOutcome: rows[0]?.outcome ?? null,
      lastVisitDate: rows[0] ? String(rows[0].visit_date) : null,
      outcomes,
    };
  },
);