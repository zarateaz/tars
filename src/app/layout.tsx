import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TARS — Asistente IA & Control de Sistema",
  description: "Interfaz futurista impulsada por Next.js y DeepSeek AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="antialiased selection:bg-sky-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
