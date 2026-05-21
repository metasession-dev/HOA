import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        // shadcn semantic slots — mapped to Family palette
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        // Family-named direct tokens (use sparingly; prefer semantic slots)
        'warm-canvas': 'var(--c-warm-canvas)',
        'stone-surface': 'var(--c-stone-surface)',
        'parchment-card': 'var(--c-parchment-card)',
        graphite: 'var(--c-graphite)',
        'charcoal-primary': 'var(--c-charcoal-primary)',
        midnight: 'var(--c-midnight)',
        obsidian: 'var(--c-obsidian)',
        ash: 'var(--c-ash)',
        fog: 'var(--c-fog)',
        smoke: 'var(--c-smoke)',
        pepper: 'var(--c-pepper)',
        'ember-orange': 'var(--c-ember-orange)',
        'meadow-green': 'var(--c-meadow-green)',
        'sky-blue': 'var(--c-sky-blue)',
        'sunburst-yellow': 'var(--c-sunburst-yellow)',
        'deep-amber': 'var(--c-deep-amber)',
        'ocean-blue': 'var(--c-ocean-blue)',
        'ice-blue': 'var(--c-ice-blue)',
        spearmint: 'var(--c-spearmint)',
        flamingo: 'var(--c-flamingo)',
        'violet-pop': 'var(--c-violet-pop)',
        'coral-red': 'var(--c-coral-red)',
        'valid-green': 'var(--c-valid-green)',
      },
      fontFamily: {
        sans: ['var(--font-inter)'],
        display: ['var(--font-family)'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        pill: 'var(--radius-pill)',
        tag: 'var(--radius-tag)',
        icon: 'var(--radius-icon)',
        'card-lg': 'var(--radius-card-lg)',
      },
      spacing: {
        '4.5': '18px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-right': {
          from: { transform: 'translateX(0)', opacity: '1' },
          to: { transform: 'translateX(100%)', opacity: '0' },
        },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.19, 1, 0.22, 1)',
        'slide-out-right': 'slide-out-right 0.2s cubic-bezier(0.19, 1, 0.22, 1)',
        'slide-up': 'slide-up 0.2s cubic-bezier(0.19, 1, 0.22, 1)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
