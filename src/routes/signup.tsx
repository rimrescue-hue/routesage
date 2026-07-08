import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { scryptSync } from "node:crypto";
import { useState } from "react";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const doSignup = createServerFn({ method: "POST" }).handler(
  async (input: Record<string, string>) => {
    const sql = getDb();
    const email = input.email.toLowerCase().trim();

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) throw new Error("Email already registered");

    const salt = randomUUID().slice(0, 16);
    const hash = scryptSync(input.password, salt, 64).toString("hex");
    const pwhash = `${salt}:${hash}`;
    const teamName = input.businessName?.trim() || `${input.name}'s Team`;

    const [team] = await sql`
      INSERT INTO teams (name, plan, max_contacts) VALUES (${teamName}, 'free', 50) RETURNING id
    `;
    const [user] = await sql`
      INSERT INTO users (email, name, team_id, role, password_hash)
      VALUES (${email}, ${input.name.trim()}, ${team.id}, 'owner', ${pwhash})
      RETURNING id, email, name, team_id, role
    `;
    const token = randomUUID();
    await sql`INSERT INTO sessions (user_id, token) VALUES (${user.id}, ${token})`;

    return { token, user: { id: user.id, email: user.email, name: user.name, team_id: user.team_id, role: user.role, team_name: teamName, plan: "free", max_contacts: 50 } };
  },
);

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) { setError("All fields required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    try {
      const result = await doSignup({ name, email, password, businessName });
      localStorage.setItem("routesage_token", result.token);
      window.location.href = "/contacts";
    } catch (err: any) {
      setError(err.message || "Signup failed");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-[calc(100dvh-57px)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create your account</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Start tracking your field sales for free</p>
          </div>

          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Name (optional)</label>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your company name" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}