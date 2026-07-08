import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

// Stripe payment links
const STRIPE_LINKS = {
  individual: "https://buy.stripe.com/test_28o5kV8Cv9mpbMYbII?prefilled_promo_code=price_1TqxTCDALoGLaXCfF2uqMLlW",
  team: "https://buy.stripe.com/test_28o5kV8Cv9mpbMYbII?prefilled_promo_code=price_1TqxTtDALoGLaXCfOynQ56EP",
};

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem("routesage_token"));
  }, []);

  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "For solo reps getting started",
      features: [
        "Up to 50 contacts",
        "Basic route planning",
        "Visit tracking",
        "Notes & reminders",
      ],
      cta: token ? "Current plan" : "Get started",
      href: token ? "/account" : "/signup",
      highlight: false,
    },
    {
      name: "Individual",
      price: "$19",
      period: "/month",
      description: "For serious field sales reps",
      features: [
        "Unlimited contacts",
        "Optimized route planning",
        "Visit tracking with outcomes",
        "Notes, photos & voice recordings",
        "CSV/Excel import",
        "Follow-up reminders",
        "Map view of contacts",
      ],
      cta: "Upgrade",
      href: STRIPE_LINKS.individual,
      highlight: true,
      badge: "Most popular",
    },
    {
      name: "Team",
      price: "$49",
      period: "/month",
      description: "For sales teams of 2+",
      features: [
        "Everything in Individual",
        "Team collaboration",
        "Shared contacts & routes",
        "Admin dashboard",
        "Priority support",
      ],
      cta: "Upgrade",
      href: STRIPE_LINKS.team,
      highlight: false,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Start free, upgrade when you need more
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border p-8 shadow-sm ${
              plan.highlight
                ? "border-indigo-300 bg-white shadow-lg dark:border-indigo-500 dark:bg-gray-900"
                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
            }`}
          >
            {plan.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                {plan.badge}
              </span>
            )}

            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>
              <div className="mt-4">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">{plan.price}</span>
                <span className="text-gray-500 dark:text-gray-400">{plan.period}</span>
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <svg className="h-4 w-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <a
                href={plan.href}
                className={`block rounded-lg text-center px-4 py-3 text-sm font-semibold shadow-sm transition ${
                  plan.highlight
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}