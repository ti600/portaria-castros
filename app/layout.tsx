import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle de Portaria",
  description: "Registro de acesso de visitantes, prestadores e usuarios internos.",
  icons: {
    icon: "/castros-logo-bordo.png",
    shortcut: "/castros-logo-bordo.png",
    apple: "/castros-logo-bordo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
