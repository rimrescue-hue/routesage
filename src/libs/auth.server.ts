import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { scryptSync, timingSafeEqual } from "node:crypto";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

// ---- Password hashing ----
function hashPassword(password: string): string {
  const salt = randomUUID().slice(0, 16);
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}

// ---- Auth types ----
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  team_id: string;
  role: string;
  plan: string;
  max_contacts: number;
  team_name: string;
};

// ---- Sign up ----
export const signup = createServerFn({ method: "POST" }).handler(
  async (input: {
    email: string;
    password: string;
    name: string;
    businessName?: string;
  }): Promise<{ user: AuthUser; token: string }> => {
    const sql = getDb();

    // Check if email exists
    const existing = await sql`
      SELECT id FROM users WHERE email = ${input.email.toLowerCase().trim()}
    `;
    if (existing.length > 0) {
      throw new Error("Email already registered");
    }

    // Create team
    const teamName = input.businessName?.trim() || `${input.name}'s Team`;
    const [team] = await sql`
      INSERT INTO teams (name, plan, max_contacts)
      VALUES (${teamName}, 'free', 50)
      RETURNING id
    `;

    // Create user
    const pwhash = hashPassword(input.password);
    const [user] = await sql`
      INSERT INTO users (email, name, team_id, role, password_hash)
      VALUES (${input.email.toLowerCase().trim()}, ${input.name.trim()}, ${team.id}, 'owner', ${pwhash})
      RETURNING id, email, name, team_id, role
    `;

    // Create session
    const token = randomUUID();
    await sql`
      INSERT INTO sessions (user_id, token)
      VALUES (${user.id}, ${token})
    `;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        team_id: user.team_id,
        role: user.role,
        plan: "free",
        max_contacts: 50,
        team_name: teamName,
      },
      token,
    };
  },
);

// ---- Login ----
export const login = createServerFn({ method: "POST" }).handler(
  async (input: {
    email: string;
    password: string;
  }): Promise<{ user: AuthUser; token: string }> => {
    const sql = getDb();

    const [user] = await sql`
      SELECT u.*, t.name as team_name, t.plan, t.max_contacts
      FROM users u
      JOIN teams t ON t.id = u.team_id
      WHERE u.email = ${input.email.toLowerCase().trim()}
    `;

    if (!user) throw new Error("Invalid email or password");
    if (!user.password_hash) throw new Error("Invalid email or password");

    if (!verifyPassword(input.password, user.password_hash)) {
      throw new Error("Invalid email or password");
    }

    // Update last sign in
    await sql`UPDATE users SET last_sign_in_at = now() WHERE id = ${user.id}`;

    // Create session
    const token = randomUUID();
    await sql`
      INSERT INTO sessions (user_id, token)
      VALUES (${user.id}, ${token})
    `;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        team_id: user.team_id,
        role: user.role,
        plan: user.plan,
        max_contacts: user.max_contacts,
        team_name: user.team_name,
      },
      token,
    };
  },
);

// ---- Get session from token ----
export const getSession = createServerFn({ method: "GET" }).handler(
  async (token: string): Promise<AuthUser | null> => {
    if (!token) return null;
    const sql = getDb();

    const [row] = await sql`
      SELECT u.id, u.email, u.name, u.team_id, u.role,
             t.name as team_name, t.plan, t.max_contacts
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN teams t ON t.id = u.team_id
      WHERE s.token = ${token} AND s.expires_at > now()
    `;
    if (!row) return null;
    return row as AuthUser;
  },
);

// ---- Logout ----
export const logout = createServerFn({ method: "POST" }).handler(
  async (token: string): Promise<{ success: boolean }> => {
    const sql = getDb();
    await sql`DELETE FROM sessions WHERE token = ${token}`;
    return { success: true };
  },
);

// ---- Get user by token (for protected routes) ----
export const getUserFromToken = createServerFn({ method: "GET" }).handler(
  async (token: string): Promise<AuthUser | null> => {
    return getSession(token);
  },
);

// ---- Update team plan (after payment) ----
export const updateTeamPlan = createServerFn({ method: "POST" }).handler(
  async (input: {
    teamId: string;
    plan: string;
  }): Promise<{ success: boolean }> => {
    const sql = getDb();
    const maxContacts =
      input.plan === "individual" ? 9999 : input.plan === "team" ? 99999 : 50;
    await sql`
      UPDATE teams SET plan = ${input.plan}, max_contacts = ${maxContacts}, updated_at = now()
      WHERE id = ${input.teamId}
    `;
    return { success: true };
  },
);

// ---- Check contact limit ----
export const checkContactLimit = createServerFn({ method: "GET" }).handler(
  async (teamId: string): Promise<{ count: number; max: number; canAdd: boolean }> => {
    const sql = getDb();
    const [team] = await sql`SELECT max_contacts FROM teams WHERE id = ${teamId}`;
    const [countRow] = await sql`
      SELECT COUNT(*) as count FROM contacts WHERE team_id = ${teamId}
    `;
    const count = parseInt(countRow.count);
    const max = team?.max_contacts ?? 50;
    return { count, max, canAdd: count < max };
  },
);