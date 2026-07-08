import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { useState } from "react";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const doLogin = createServerFn({ method: "POST" }).handler(
  async (input: Record<string, string>) => {
    const sql = getDb();
    const [user] = await sql`
      SELECT u.*, t.name as team_name, t.plan, t.max_contacts
      FROM users u JOIN teams t ON t.id = u.team_id
      WHERE u.email = ${input.email.toLowerCase().trim()}
    `;
    if (!user || !user.password_hash) throw new Error("Invalid email or password");

    const [salt, hash] = user.password_hash.split(":");
    const computed = scryptSync(input.password, salt, 64).toString("hex");
    const valid = timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
    if (!valid) throw new Error("Invalid email or password");

    await sql`UPDATE users SET last_sign_in_at = now() WHERE id = ${user.id}`;
    const token = randomUUID();
    await sql`INSERT INTO sessions (user_id, token) VALUES (${user.id}, ${token})`;

    return { token, user: { id: user.id, email: user.email, name: user.name, team_id: user.team_id, role: user.role, team_name: user.team_name, plan: user.plan, max_contacts: user.max_contacts } };
  },
);

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("All fields required"); return; }
    setLoading(true); setError("");
    try {
      const result = await doLogin({ email, password });
      localStorage.setItem("routesage_token", result.token);
      window.location.href = "/contacts";
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-[calc(100dvh-57px)] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Welcome back to RouteSage</p>
          </div>

          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}