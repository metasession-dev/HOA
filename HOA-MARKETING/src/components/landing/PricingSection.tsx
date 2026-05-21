import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

// Prices in Naira (₦). Round numbers for the Nigerian SaaS market — feel
// free to retune per round of customer interviews. The "Most Popular" tier
// is positioned at roughly 3× starter, which mirrors typical SaaS pricing
// ladders and matches the prior $49 / $99 / Custom shape.
const plans = [
  {
    name: "Starter",
    price: "₦50,000",
    period: "/month",
    description: "Perfect for small communities just getting started.",
    features: [
      "Up to 50 residential units",
      "Basic billing & payments",
      "Visitor pass management",
      "Email notifications",
      "Standard support",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Professional",
    price: "₦150,000",
    period: "/month",
    description: "Best for growing communities with advanced needs.",
    features: [
      "Up to 200 residential units",
      "Advanced billing automation",
      "Digital wallet system",
      "QR code gate passes",
      "Transaction exports (PDF/Excel)",
      "Role-based admin access",
      "Priority support",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large communities requiring custom solutions.",
    features: [
      "Unlimited residential units",
      "Custom integrations",
      "Dedicated account manager",
      "API access",
      "White-label options",
      "On-premise deployment",
      "24/7 premium support",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

// Where the marketing site sends "Start free trial" / "Get started" clicks.
// Vite exposes VITE_*-prefixed env vars to the client. Falls back to the
// dev port so a fresh clone Just Works without an .env file.
const ENTERPRISE_URL =
  import.meta.env.VITE_ENTERPRISE_URL || "http://localhost:3002";

const PricingSection = () => {
  return (
    <section id="pricing" className="py-20 lg:py-32 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-block text-primary font-semibold mb-4"
          >
            PRICING
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
          >
            Simple, Transparent Pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            Choose the plan that fits your community. All plans include a 14-day 
            free trial with no credit card required.
          </motion.p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative p-8 rounded-2xl border ${
                plan.popular
                  ? "border-primary bg-card shadow-card"
                  : "border-border bg-card"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-accent text-accent-foreground text-sm font-semibold px-4 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {plan.name}
                </h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <p className="text-muted-foreground text-sm mt-2">
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-success" />
                    </div>
                    <span className="text-foreground text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* "Contact Sales" stays in-marketing (we don't have a contact
                  page yet — TODO route it to a contact form). All other
                  CTAs hand off to the enterprise console's register page so
                  the trial signup happens where the actual product lives. */}
              {plan.cta === "Contact Sales" ? (
                <a href="mailto:sales@hoa.africa?subject=Enterprise%20plan%20enquiry" className="block">
                  <Button variant={plan.popular ? "hero" : "outline"} className="w-full" size="lg">
                    {plan.cta}
                  </Button>
                </a>
              ) : (
                <a href={`${ENTERPRISE_URL}/register`} className="block">
                  <Button variant={plan.popular ? "hero" : "outline"} className="w-full" size="lg">
                    {plan.cta}
                  </Button>
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
