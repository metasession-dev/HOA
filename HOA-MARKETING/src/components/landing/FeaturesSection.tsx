import {
  Home,
  Receipt,
  Wallet,
  Building2,
  Gavel,
  Vote,
  ShieldAlert,
  KeyRound,
  Megaphone,
  Sparkles,
  BarChart3,
  Lock,
} from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: Home,
    title: "Units & residents",
    description: "A live register of every unit, its owner, tenants and other occupants, with full ownership history and bulk import.",
  },
  {
    icon: Receipt,
    title: "Levies & invoicing",
    description: "Recurring or one-off invoices, automatic late fees, multi-currency, and one-tap online payments. Residents are emailed the moment an invoice goes out.",
  },
  {
    icon: Wallet,
    title: "Payables & approvals",
    description: "Capture vendor invoices, route them through rule-based approval chains, and settle them in batch payment runs with a full audit trail.",
  },
  {
    icon: Building2,
    title: "Vendor self-service portal",
    description: "Invite vendors to submit their own invoices and receipts, then track approval and payment status live. No back-and-forth calls.",
  },
  {
    icon: Gavel,
    title: "Contract bidding & Exco voting",
    description: "Publish tenders, collect vendor bids, shortlist, and award by a formal board vote, with every party notified at each step.",
  },
  {
    icon: Vote,
    title: "Meetings, votes & surveys",
    description: "Calendar & Zoom meeting invites, quorum-aware ballots and special resolutions, and AI-assisted surveys for resident feedback.",
  },
  {
    icon: ShieldAlert,
    title: "Violations & compliance",
    description: "Log violations with photo evidence, issue notices, handle appeals, and keep the affected unit informed automatically.",
  },
  {
    icon: KeyRound,
    title: "Visitor & gate passes",
    description: "QR-coded gate passes, kiosk check-in, and an instant alert to the resident the moment their visitor is scanned through.",
  },
  {
    icon: Megaphone,
    title: "Broadcasts & notifications",
    description: "Reach residents by email, in-app bell, and web push, targeted by segment, with delivery and read tracking.",
  },
  {
    icon: Sparkles,
    title: "Built-in AI assistant",
    description: "Ask plain-language questions about arrears, occupancy, or finances. Answers come from your live data, always in your settings currency.",
  },
  {
    icon: BarChart3,
    title: "Finance & board-ready reports",
    description: "Budgets, funds, bank reconciliation, chart of accounts, and one-click board packs. Exportable, multi-currency, and audit-ready.",
  },
  {
    icon: Lock,
    title: "Roles, security & compliance",
    description: "Granular role-based access, MFA, complete audit logging, and POPIA / GDPR-aligned privacy and data controls.",
  },
];

const FeaturesSection = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <section id="features" className="py-20 lg:py-32 bg-background">
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
            EVERYTHING IN ONE PLACE
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
          >
            Run your entire estate from one platform
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            From levies and vendor payments to contract tenders, governance votes,
            and visitor access, HOA.africa brings every workflow your community
            needs into one place.
          </motion.p>
        </div>

        {/* Features Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-card transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-5 group-hover:bg-primary/10 transition-colors duration-300">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturesSection;
