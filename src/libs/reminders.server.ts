import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

// ---- Reminder Types ----
export type Reminder = {
  id: string;
  user_id: string;
  contact_id: string;
  visit_id: string | null;
  title: string;
  description: string | null;
  remind_at: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  business_name?: string;
};

// ---- Notes Types ----
export type Note = {
  id: string;
  contact_id: string;
  user_id: string;
  visit_id: string | null;
  note_type: string;
  title: string | null;
  content: string | null;
  file_url: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

// ---- Reminder: list pending ----
export const listPendingReminders = createServerFn({ method: "GET" }).handler(
  async (): Promise<Reminder[]> => {
    const sql = getDb();
    const rows = await sql`
      SELECT r.*, c.business_name
      FROM reminders r
      JOIN contacts c ON c.id = r.contact_id
      WHERE r.completed = false
      ORDER BY r.remind_at ASC
      LIMIT 50
    `;
    return rows.map((r: any) => ({
      ...r,
      remind_at: String(r.remind_at),
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      completed_at: r.completed_at ? String(r.completed_at) : null,
    })) as Reminder[];
  },
);

// ---- Reminder: list for contact ----
export const listContactReminders = createServerFn({ method: "GET" }).handler(
  async (contactId: string): Promise<Reminder[]> => {
    const sql = getDb();
    const rows = await sql`
      SELECT r.*, c.business_name
      FROM reminders r
      JOIN contacts c ON c.id = r.contact_id
      WHERE r.contact_id = ${contactId}
      ORDER BY r.completed ASC, r.remind_at ASC
      LIMIT 20
    `;
    return rows.map((r: any) => ({
      ...r,
      remind_at: String(r.remind_at),
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      completed_at: r.completed_at ? String(r.completed_at) : null,
    })) as Reminder[];
  },
);

// ---- Reminder: create ----
export const createReminder = createServerFn({ method: "POST" }).handler(
  async (input: {
    contact_id: string;
    title: string;
    description?: string;
    remind_at: string;
    visit_id?: string;
  }): Promise<Reminder> => {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO reminders (user_id, contact_id, visit_id, title, description, remind_at)
      VALUES ('00000000-0000-0000-0000-000000000001',
              ${input.contact_id},
              ${input.visit_id || null},
              ${input.title},
              ${input.description || null},
              ${input.remind_at})
      RETURNING *
    `;
    return {
      ...row,
      remind_at: String(row.remind_at),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      completed_at: null,
    } as Reminder;
  },
);

// ---- Reminder: toggle completed ----
export const toggleReminder = createServerFn({ method: "POST" }).handler(
  async (reminderId: string): Promise<{ success: boolean }> => {
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

// ---- Reminder: delete ----
export const deleteReminder = createServerFn({ method: "POST" }).handler(
  async (reminderId: string): Promise<{ success: boolean }> => {
    const sql = getDb();
    await sql`DELETE FROM reminders WHERE id = ${reminderId}`;
    return { success: true };
  },
);

// ---- Notes: list for contact ----
export const listContactNotes = createServerFn({ method: "GET" }).handler(
  async (contactId: string): Promise<Note[]> => {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM notes
      WHERE contact_id = ${contactId}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return rows.map((r: any) => ({
      ...r,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    })) as Note[];
  },
);

// ---- Notes: create ----
export const createNote = createServerFn({ method: "POST" }).handler(
  async (input: {
    contact_id: string;
    note_type: string;
    title?: string;
    content?: string;
    file_url?: string;
    file_type?: string;
    file_size?: number;
    visit_id?: string;
  }): Promise<Note> => {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO notes (contact_id, user_id, visit_id, note_type, title, content, file_url, file_type, file_size)
      VALUES (${input.contact_id},
              '00000000-0000-0000-0000-000000000001',
              ${input.visit_id || null},
              ${input.note_type},
              ${input.title || null},
              ${input.content || null},
              ${input.file_url || null},
              ${input.file_type || null},
              ${input.file_size || null})
      RETURNING *
    `;
    return {
      ...row,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    } as Note;
  },
);

// ---- Notes: delete ----
export const deleteNote = createServerFn({ method: "POST" }).handler(
  async (noteId: string): Promise<{ success: boolean }> => {
    const sql = getDb();
    await sql`DELETE FROM notes WHERE id = ${noteId}`;
    return { success: true };
  },
);