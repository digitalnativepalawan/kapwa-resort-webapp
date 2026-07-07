import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        limestone: "#E9E2D7",
        sandstone: "#D7CAA5",
        forest: "#435947",
        ocean: "#1C3A4A",
        bronze: "#8A6A43",
        basalt: "#1B1818",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        serif: ["Cormorant Garamond", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
