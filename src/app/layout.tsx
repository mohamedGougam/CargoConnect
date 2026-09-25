import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { UiAppearanceProvider } from "@/context/UiAppearanceContext";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CargoConnect — AI Maritime Platform",
  description:
    "See global maritime cargo activity and ask CargoConnect AI what you need to transport.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}
      data-cc-ui="night"
    >
      <body
        className="h-full overflow-y-auto font-sans"
        style={{
          backgroundColor: "var(--cc-page, #071018)",
          color: "var(--cc-page-fg, #e8eef5)",
        }}
      >
        <UiAppearanceProvider>{children}</UiAppearanceProvider>
      </body>
    </html>
  );
}
