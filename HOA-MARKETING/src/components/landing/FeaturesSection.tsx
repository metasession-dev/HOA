import { 
  CreditCard, 
  Wallet, 
  UserCheck, 
  FileText, 
  Shield, 
  BarChart3,
  Zap,
  Bell
} from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: CreditCard,
    title: "Bills & Payments",
    description: "Manage utility bills, HOA fees, and service charges with automated reminders and seamless payment processing.",
  },
  {
    icon: Wallet,
    title: "Digital Wallet",
    description: "Prepaid wallet system for quick payments. Top up once, pay for all services with a single tap.",
  },
  {
    icon: UserCheck,
    title: "Visitor Management",
    description: "Digital gate passes with QR codes. Approve visitors instantly and track all entries in real-time.",
  },
  {
    icon: FileText,
    title: "Transaction History",
    description: "Complete audit trail of all activities. Export reports to PDF, Excel, or CSV for your records.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description: "Granular permissions for admins. Super Admin, Moderator, and Viewer roles with secure access control.",
  },
  {
    icon: BarChart3,
    title: "Usage Analytics",
    description: "Track utility consumption with visual charts. Identify trends and optimize your community's resources.",
  },
  {
    icon: Zap,
    title: "Instant Approvals",
    description: "Streamlined workflows for resident registrations and visitor passes. No more waiting in line.",
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Email alerts for due dates, approvals, and important updates. Never miss a deadline again.",
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
            FEATURES
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
          >
            Everything Your Community Needs
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            A comprehensive toolkit designed to simplify HOA operations and enhance 
            the resident experience.
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
