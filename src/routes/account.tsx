import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { neon } from "@neondatabase/serverless";
import { useState, useEffect } from "react";

const getDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
};

const getAccountInfo = createServerFn({ method: "GET" }).handler(
  async (token: string) => {
    const sql = getDb();
    const [row] = await sql`
      SELECT u.id, u.email, u.name, u.role, u.created_at,
             t.id as team_id, t.name as team_name, t.plan, t.max_contacts,
             (SELECT COUNT(*) FROM contacts WHERE team_id = t.id) as contact_count
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN teams t ON t.id = u.team_id
      WHERE s.token = ${token} AND s.expires_at > now()
    `;
    if (!row) return null;
    return {
      ...row,
      created_at: String(row.created_at),
      contact_count: parseInt(row.contact_count),
    };
  },
);

const activatePlan = createServerFn({ method: "POST" }).handler(
  async ({ token, plan }: { token: string; plan: string }) => {
    const sql = getDb();
    // Verify session and get team
    const [row] = await sql`
      SELECT u.team_id, u.role FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ${token} AND s.expires_at > now()
    `;
    if (!row) throw new Error("Not authenticated");
    if (row.role !== "owner") throw new Error("Only team owners can change plan");

    const maxContacts = plan === "individual" ? 9999 : plan === "team" ? 99999 : 50;
    await sql`
      UPDATE teams SET plan = ${plan}, max_contacts = ${maxContacts}, updated_at = now()
      WHERE id = ${row.team_id}
    `;
    return { success: true };
  },
);

const STRIPE_LINKS: Record<string, string> = {
  individual: "https://buy.stripe.com/test_9AQ9AX6KJ8o598A9AB?prefilled_promo_code=price_1TqxTCDALoGLaXCfF2uqMLlW",
  team: "https://buy.stripe.com/test_9AQ9AX6KJ8o598A9AB?prefilled_promo_code=price_1TqxTtDALoGLaXCfOynQ56EP",
};

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

function AccountPage() {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("routesage_token") : null;

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    getAccountInfo(token).then((data) => {
      setInfo(data);
      setLoading(false);
    });
  }, [token]);

  const handleActivate = async (plan: string) => {
    if (!token) return;
    setActivating(true);
    setMessage("");
    try {
      await activatePlan({ token, plan });
      setInfo({ ...info, plan, max_contacts: plan === "individual" ? 9999 : 99999 });
      setMessage(`Plan activated: ${plan}`);
    } catch (err: any) {
      setMessage(err.message || "Failed to activate plan");
    }
    setActivating(false);
  };

  if (loading) {
    return <div className="flex min-h-[calc(100dvh-57px)] items-center justify-center"><p className="text-gray-500">Loading...</p></div>;
  }

  if (!token || !info) {
    return (
      <div className="flex min-h-[calc(100dvh-57px)] items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Not signed in</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Sign in to view your account</p>
          <Link to="/login" className="mt-4 inline-block text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">Sign in →</Link>
        </div>
      </div>
    );
  }

  const planLabels: Record<string, string> = { free: "Free", individual: "Individual ($19/mo)", team: "Team ($49/mo)" };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Account</h1>

      {message && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
          {message}
        </div>
      )}

      {/* Profile */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Profile</h2>
        <dl className="space-y-3">
          <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Name</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{info.name}</dd></div>
          <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Email</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{info.email}</dd></div>
          <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Team</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{info.team_name}</dd></div>
          <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Role</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{info.role}</dd></div>
          <div className="flex justify-between"><dt className="text-sm text-gray-500 dark:text-gray-400">Member since</dt><dd className="text-sm font-medium text-gray-900 dark:text-white">{new Date(info.created_at).toLocaleDateString()}</dd></div>
        </dl>
      </div>

      {/* Plan */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Plan & Billing</h2>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{planLabels[info.plan] || info.plan}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {info.contact_count} of {info.max_contacts} contacts used
            </p>
          </div>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            info.plan === "free" ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
          }`}>{info.plan}</span>
        </div>

        {info.plan === "free" && info.role === "owner" && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Upgrade your plan</p>
            <div className="flex gap-3">
              <button onClick={() => window.open(STRIPE_LINKS.individual, "_blank")} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
                Individual — $19/mo
              </button>
              <button onClick={() => window.open(STRIPE_LINKS.team, "_blank")} className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                Team — $49/mo
              </button>
            </div>
            <p className="text-xs text-gray-400">After payment, click below to activate your plan</p>
          </div>
        )}

        {info.role === "owner" && (
          <div className="mt-4 flex gap-3">
            {info.plan !== "individual" && (
              <button onClick={() => handleActivate("individual")} disabled={activating} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
                {activating ? "..." : "Activate Individual"}
              </button>
            )}
            {info.plan !== "team" && (
              <button onClick={() => handleActivate("team")} disabled={activating} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50">
                {activating ? "..." : "Activate Team"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Usage */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Usage</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Contacts</span><span className="text-gray-900 dark:text-white">{info.contact_count} / {info.max_contacts}</span></div>
            <div className="mt-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (info.contact_count / info.max_contacts) * 100)}%` }} />
            </div>
            {info.contact_count >= info.max_contacts && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Contact limit reached — upgrade to add more
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}