import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Home, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

// Visitors landing on /login choose which portal they want before being
// handed off. We keep the split-screen branding visible so the choice feels
// branded rather than like a generic gateway.
const ENTERPRISE_URL =
  import.meta.env.VITE_ENTERPRISE_URL || "http://localhost:3002";
const RESIDENTS_URL =
  import.meta.env.VITE_RESIDENTS_URL || "http://localhost:3005";

const Login = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-hero p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-primary-foreground rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="p-2 rounded-lg bg-white">
              <img src="/logo.png" alt="HOA.africa" className="w-12 h-12" />
            </div>
            <span className="text-2xl font-bold text-primary-foreground">
              HOA Africa
            </span>
          </Link>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold text-primary-foreground mb-4">
            Sign in to HOA Africa
          </h2>
          <p className="text-primary-foreground/80 text-lg">
            Two portals, one platform. Residents manage their unit; admins and
            exco run the HOA. Pick the one that fits.
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-primary-foreground/60 text-sm">
            Trusted by communities across Africa
          </p>
        </div>
      </div>

      {/* Right Panel - Portal chooser */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo (shown when the split panel collapses) */}
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-2">
              <img src="/logo.png" alt="HOA.africa" className="w-10 h-10" />
              <span className="text-xl font-bold text-foreground">
                HOA Africa
              </span>
            </Link>
          </div>

          <div className="mb-8">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Where would you like to sign in?
            </h1>
            <p className="text-muted-foreground">
              Pick the portal that matches your role.
            </p>
          </div>

          <div className="space-y-3">
            <a
              href={`${RESIDENTS_URL}/login`}
              className="group block rounded-xl border-2 border-border bg-card p-5 transition-all hover:border-primary hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Home className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">
                    Resident portal
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Pay levies, submit requests, manage visitor passes.
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </a>

            <a
              href={`${ENTERPRISE_URL}/login`}
              className="group block rounded-xl border-2 border-border bg-card p-5 transition-all hover:border-primary hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-600/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">
                    Enterprise console
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Admin, finance, exco, gate security, comms.
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </a>
          </div>

          <div className="mt-8 text-center">
            <p className="text-muted-foreground">
              New to HOA Africa?{" "}
              <a
                href={`${ENTERPRISE_URL}/register`}
                className="text-primary font-medium hover:underline"
              >
                Register your HOA
              </a>
            </p>
            <p className="mt-2 text-xs text-muted-foreground/80">
              Residents join by invitation. Ask your HOA admin to send you a
              link.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
