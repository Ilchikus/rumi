export default {
  plugins: {
    tailwindcss: {
      config: new URL("./tailwind.config.cjs", import.meta.url).pathname
    },
    autoprefixer: {}
  }
};
