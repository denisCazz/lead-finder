import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login - Lead Finder",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
