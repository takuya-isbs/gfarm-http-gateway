import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import jsconfigPaths from "vite-jsconfig-paths";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react(), jsconfigPaths()],
    resolve: {
        alias: {
            "@components": path.resolve(__dirname, "src/components"),
            "@utils": path.resolve(__dirname, "src/utils"),
            "@context": path.resolve(__dirname, "src/context"),
            "@hooks": path.resolve(__dirname, "src/hooks"),
            "@css": path.resolve(__dirname, "src/css"),
            "@page": path.resolve(__dirname, "src/page"),
        },
    },
    base: "./",
    server: {
        host: "0.0.0.0",
        port: 3000,
        allowedHosts: ["react"],
        open: "/",
    },
    preview: {
        port: 3000,
    },
    build: {
        outDir: "dist",
    },
});
