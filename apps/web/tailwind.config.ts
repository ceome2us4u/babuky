import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#4338ca",
          dark: "#3730a3",
          light: "#818cf8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
