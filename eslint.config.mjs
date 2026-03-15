import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    files: ["components/schedule-page.tsx"],
    rules: {
      "@next/next/no-img-element": "off"
    }
  },
  {
    files: ["convex/_generated/**/*.{js,d.ts}"],
    rules: {
      "no-warning-comments": "off"
    }
  },
  {
    ignores: ["convex/_generated/**"]
  }
];

export default config;
